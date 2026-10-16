// ============================================================================
// Mise à jour UNITAIRE des tables de dimension d'un client
// (plan comptable, plan tiers, codes journaux).
//
// Même enchaînement que l'import complet (upload → trigger-etl → statut) :
//   POST                       → dépôt d'UN fichier sur S3 + suivi en PENDING
//                                (équivalent de /api/files/comptable/upload) ;
//   POST /dimensions/trigger   → lancement du DAG Airflow
//                                « etl_dimensions_clickhouse » (équivalent de
//                                /api/files/comptable/trigger-etl) ;
//   GET                        → lecture du suivi, que le DAG met à jour
//                                lui-même dans `dimension_updates` (statut,
//                                progression, lignes ajoutées / modifiées,
//                                erreur), comme il le fait pour les périodes.
//
// Le DAG ajoute les clés nouvelles et met à jour les clés existantes, sans
// jamais supprimer de ligne. Aucune période, aucun grand livre.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";
import {
  FileType,
  ProcessingStatus,
} from "../../../../../../prisma/generated/prisma/enums";
import {
  requirePermission,
  checkPermissionSync,
  FICHIERS_ACTIONS,
} from "@/lib/permissions";
import {
  detectComptableFormat,
  validateComptableFormat,
  MAX_COMPTABLE_FILE_SIZE,
} from "@/lib/comptable-formats";
import { getClickhouseDbName } from "@/lib/clickhouse/manual-sync";
import {
  DIMENSIONS,
  DIMENSION_EN_COURS,
  dimensionParType,
} from "@/lib/comptable/dimensions";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

/** Nom de fichier sûr pour une clé S3 (on garde l'extension d'origine). */
function nomSur(nom: string): string {
  return nom.replace(/[^\w.\-]+/g, "_").slice(-120);
}

function horodatage(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function chargerClient(id: string, companyId: string) {
  return prisma.client.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, companyId: true },
  });
}

// ============================================================================
// GET — état des référentiels + historique (lu en base, écrit par Airflow)
// ============================================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const perm = await requirePermission(FICHIERS_ACTIONS.VOIR);
    if (perm instanceof NextResponse) return perm;
    const { user } = perm;

    const { id } = await params;
    const client = await chargerClient(id, user.companyId);
    if (!client) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });

    const updates = await prisma.dimensionUpdate.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { uploadedBy: { select: { firstName: true, lastName: true, email: true } } },
    });

    // Nombre de lignes par table. FINAL : une table ReplacingMergeTree peut
    // garder temporairement des doublons de clé avant fusion.
    const dbName = getClickhouseDbName(id);
    const comptes = await Promise.all(
      DIMENSIONS.map(async (d) => {
        try {
          const res = await clickhouse.query({
            query: `SELECT count() AS n FROM ${dbName}.${d.table} FINAL`,
            format: "JSONEachRow",
          });
          const rows = (await res.json()) as Array<{ n: string }>;
          return parseInt(rows[0]?.n ?? "0", 10) || 0;
        } catch {
          // Base ou table absente : client jamais importé.
          return null;
        }
      }),
    );

    return NextResponse.json({
      canUpload: checkPermissionSync(user.role, FICHIERS_ACTIONS.CHARGER),
      tables: DIMENSIONS.map((d, i) => {
        const derniere = updates.find(
          (u) => u.fileType === d.fileType && u.status === ProcessingStatus.COMPLETED,
        );
        return {
          fileType: d.fileType,
          label: d.label,
          lignes: comptes[i],
          derniereMiseAJour: derniere?.processedAt ?? null,
          enCours: updates.some(
            (u) => u.fileType === d.fileType && DIMENSION_EN_COURS.includes(u.status),
          ),
        };
      }),
      updates: updates.map((u) => ({
        id: u.id,
        fileType: u.fileType,
        fileName: u.fileName,
        fileSize: u.fileSize,
        status: u.status,
        progress: u.progress,
        dagRunId: u.dagRunId,
        rowsInserted: u.rowsInserted,
        rowsUpdated: u.rowsUpdated,
        errorMessage: u.errorMessage,
        createdAt: u.createdAt,
        processedAt: u.processedAt,
        uploadedBy:
          [u.uploadedBy?.firstName, u.uploadedBy?.lastName].filter(Boolean).join(" ") ||
          u.uploadedBy?.email ||
          "",
      })),
    });
  } catch (error) {
    console.error("Dimensions GET error:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des référentiels" }, { status: 500 });
  }
}

// ============================================================================
// POST — dépôt d'un fichier de dimension unique (sans lancer le traitement)
// ============================================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const perm = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (perm instanceof NextResponse) return perm;
    const { user } = perm;

    const { id } = await params;
    const client = await chargerClient(id, user.companyId);
    if (!client) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });

    const formData = await req.formData();
    const fileType = String(formData.get("fileType") || "") as FileType;
    const file = formData.get("file");

    // Seules les trois tables de dimension peuvent être mises à jour seules :
    // le grand livre reste lié à une période et passe par l'import complet.
    const dimension = dimensionParType(fileType);
    if (!dimension) {
      return NextResponse.json(
        { error: "Type de référentiel invalide : plan comptable, plan tiers ou codes journaux." },
        { status: 400 },
      );
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }

    // Mêmes règles de format que l'import complet (miroir du DAG).
    const formatError = validateComptableFormat(fileType, detectComptableFormat(file.name));
    if (formatError) {
      return NextResponse.json({ error: `${formatError} Fichier reçu : ${file.name}` }, { status: 400 });
    }
    if (file.size > MAX_COMPTABLE_FILE_SIZE) {
      const limitMB = MAX_COMPTABLE_FILE_SIZE / (1024 * 1024);
      return NextResponse.json(
        { error: `Le fichier dépasse la limite autorisée (${limitMB} Mo).` },
        { status: 413 },
      );
    }

    // Deux mises à jour simultanées d'une même table se marcheraient dessus.
    const enCours = await prisma.dimensionUpdate.findFirst({
      where: { clientId: id, fileType, status: { in: DIMENSION_EN_COURS } },
      select: { id: true },
    });
    if (enCours) {
      return NextResponse.json(
        { error: `Une mise à jour « ${dimension.label} » est déjà en cours.` },
        { status: 409 },
      );
    }

    // ---- Dépôt S3 : dossier « dimensions », hors de toute période ----
    const company = await prisma.company.findUnique({
      where: { id: client.companyId },
      select: { id: true, name: true },
    });
    if (!company) return NextResponse.json({ error: "Entreprise non trouvée" }, { status: 404 });

    const propre = (s: string) => s.replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
    const s3Key =
      `${propre(company.name)}_${company.id}/${propre(client.name)}_${client.id}/` +
      `dimensions/${fileType}/${horodatage(new Date())}_${nomSur(file.name)}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: s3Key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type || "application/octet-stream",
      }),
    );

    const update = await prisma.dimensionUpdate.create({
      data: {
        clientId: id,
        fileType,
        fileName: file.name,
        s3Key,
        fileSize: file.size,
        status: ProcessingStatus.PENDING,
        uploadedById: user.id,
      },
    });

    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    console.error("Dimensions POST error:", error);
    return NextResponse.json({ error: "Erreur lors du dépôt du référentiel" }, { status: 500 });
  }
}
