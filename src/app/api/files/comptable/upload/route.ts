// app/api/files/comptable/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { randomUUID } from "crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { prisma } from "@/lib/prisma";
import { FileType, ProcessingStatus } from "../../../../../../prisma/generated/prisma/enums";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const uploadComptableSchema = z.object({
  clientId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

// ============================================================
// FORMAT 4 FICHIERS (v3.0)
// - GRAND_LIVRE: Fichier unifié (remplace GRAND_LIVRE_COMPTES + GRAND_LIVRE_TIERS)
// - PLAN_COMPTES: Plan comptable
// - PLAN_TIERS: Plan des tiers (clients/fournisseurs)
// - CODE_JOURNAL: Codes journaux
// ============================================================
const REQUIRED_FILE_TYPES = [
  FileType.GRAND_LIVRE,      // Nouveau: fichier unifié
  FileType.PLAN_COMPTES,
  FileType.PLAN_TIERS,
  FileType.CODE_JOURNAL,
];

// Labels pour les messages d'erreur
const FILE_TYPE_LABELS: Record<string, string> = {
  [FileType.GRAND_LIVRE]: "Grand Livre Comptable",
  [FileType.PLAN_COMPTES]: "Plan Comptable",
  [FileType.PLAN_TIERS]: "Plan Tiers",
  [FileType.CODE_JOURNAL]: "Codes Journaux",
};

function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatPeriodFolder(start: Date, end: Date): string {
  return `periode-${formatDateYYYYMMDD(start)}-${formatDateYYYYMMDD(end)}`;
}

async function createBackupIfNeeded(s3Prefix: string): Promise<void> {
  const bucket = process.env.AWS_S3_BUCKET_NAME!;

  try {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: s3Prefix,
        MaxKeys: 10,
      })
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const now = new Date();
      const timestamp = `${formatDateYYYYMMDD(now)}_${String(
        now.getHours()
      ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(
        now.getSeconds()
      ).padStart(2, "0")}`;
      const backupPrefix = `${s3Prefix}backup/${timestamp}/`;

      for (const obj of listResponse.Contents) {
        if (
          obj.Key &&
          !obj.Key.includes("backup/") &&
          !obj.Key.includes("success/") &&
          !obj.Key.includes("EXCEL/")
        ) {
          const fileName = obj.Key.split("/").pop();
          await s3Client.send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${obj.Key}`,
              Key: `${backupPrefix}${fileName}`,
            })
          );
        }
      }
    }
  } catch (error) {
    console.error("Erreur lors de la création du backup:", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const clientId = formData.get("clientId") as string;
    const periodStartStr = formData.get("periodStart") as string;
    const periodEndStr = formData.get("periodEnd") as string;

    // Récupérer les 4 fichiers requis
    const files: { file: File; fileType: FileType }[] = [];
    const missingFiles: string[] = [];

    for (const fileType of REQUIRED_FILE_TYPES) {
      const file = formData.get(fileType) as File;
      if (!file) {
        missingFiles.push(FILE_TYPE_LABELS[fileType] || fileType);
      } else {
        files.push({ file, fileType });
      }
    }

    if (missingFiles.length > 0) {
      return NextResponse.json(
        { 
          error: `Fichier(s) manquant(s): ${missingFiles.join(", ")}`,
          missingFiles,
          requiredFiles: REQUIRED_FILE_TYPES.map(ft => ({
            type: ft,
            label: FILE_TYPE_LABELS[ft] || ft
          }))
        },
        { status: 400 }
      );
    }

    // Validation du schéma
    const data = uploadComptableSchema.parse({
      clientId,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
    });

    // Convertir les dates
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
    }

    if (periodStart >= periodEnd) {
      return NextResponse.json(
        { error: "La date de début doit être antérieure à la date de fin" },
        { status: 400 }
      );
    }

    // Vérifier que le client existe
    const client = await prisma.client.findFirst({
      where: {
        id: data.clientId,
        companyId: session.user.companyId,
      },
      select: {
        id: true,
        name: true,
        companyId: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    // Vérifier que tous les fichiers sont Excel
    const validExcelTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    for (const { file, fileType } of files) {
      if (!validExcelTypes.includes(file.type)) {
        return NextResponse.json(
          { 
            error: `Le fichier "${FILE_TYPE_LABELS[fileType]}" (${file.name}) doit être un fichier Excel (.xls ou .xlsx)` 
          },
          { status: 400 }
        );
      }
    }

    // Vérifier qu'il n'y a pas de doublons de type
    const fileTypes = files.map((f) => f.fileType);
    const uniqueTypes = new Set(fileTypes);
    if (uniqueTypes.size !== fileTypes.length) {
      return NextResponse.json(
        { error: "Types de fichiers dupliqués détectés" },
        { status: 400 }
      );
    }

    const year = periodStart.getFullYear();

    // Vérifier qu'il n'y a pas de chevauchement avec des périodes existantes
    const overlappingPeriod = await prisma.comptablePeriod.findFirst({
      where: {
        clientId: data.clientId,
        status: ProcessingStatus.COMPLETED,
        OR: [
          {
            AND: [
              { periodStart: { lte: periodEnd } },
              { periodEnd: { gte: periodStart } },
            ],
          },
        ],
      },
    });

    if (overlappingPeriod) {
      return NextResponse.json(
        {
          error: "Cette période chevauche une période déjà traitée",
          existingPeriod: {
            start: overlappingPeriod.periodStart.toISOString(),
            end: overlappingPeriod.periodEnd.toISOString(),
          },
        },
        { status: 409 }
      );
    }

    // Générer un batchId unique
    const batchId = randomUUID();

    // Définir le préfixe S3
    const clientName = client.name.replace(/\s+/g, "_").replace(/[^\w\-]/g, "");

    // Récupérer la company
    const company = await prisma.company.findUnique({
      where: { id: client.companyId },
      select: { name: true, id: true },
    });
    if (!company) {
      return NextResponse.json(
        { error: "Entreprise non trouvée" },
        { status: 404 }
      );
    }
    const companyName = company.name
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");

    const periodFolder = formatPeriodFolder(periodStart, periodEnd);
    const s3Prefix = `${companyName}_${company.id}/${clientName}_${client.id}/declaration/${year}/${periodFolder}/`;

    // Créer un backup si des fichiers existent déjà
    await createBackupIfNeeded(s3Prefix);

    // Créer l'enregistrement de la période
    const comptablePeriod = await prisma.comptablePeriod.create({
      data: {
        clientId: data.clientId,
        periodStart: periodStart,
        periodEnd: periodEnd,
        year,
        batchId,
        status: ProcessingStatus.PENDING,
      },
    });

    // Uploader les fichiers sur S3
    const uploadedFiles: any[] = [];

    for (const { file, fileType } of files) {
      const fileBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);

      // Générer le nom de fichier: YYYYMMDD_TYPE_ClientName.xlsx
      const dateStr = formatDateYYYYMMDD(periodEnd);
      const ext = file.name.split(".").pop();
      const fileName = `${dateStr}_${fileType}_${client.name}.${ext}`;

      // Upload vers S3 avec rangement par type (sous-dossier pour chaque type)
      const s3Key = `${s3Prefix}${fileType}/${fileName}`;
      const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        })
      );

      // Créer l'enregistrement dans la base
      const fileRecord = await prisma.comptableFile.create({
        data: {
          fileName: fileName,
          fileType: fileType,
          fileYear: year,
          s3Key,
          s3Url,
          fileSize: file.size,
          mimeType: file.type,
          status: "SUCCES",
          processingStatus: ProcessingStatus.PENDING,
          batchId,
          periodStart: periodStart,
          periodEnd: periodEnd,
          clientId: data.clientId,
          uploadedById: session.user.id,
          processedAt: new Date(),
        },
      });

      uploadedFiles.push({
        ...fileRecord,
        label: FILE_TYPE_LABELS[fileType] || fileType,
      });

      // Créer l'historique
      await prisma.comptableFileHistory.create({
        data: {
          fileId: fileRecord.id,
          fileName: fileName,
          action: "UPLOAD_COMPTABLE",
          details: `Fichier comptable uploadé (${FILE_TYPE_LABELS[fileType]}) - Période: ${formatDateYYYYMMDD(
            periodStart
          )} au ${formatDateYYYYMMDD(periodEnd)}`,
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });
    }

    return NextResponse.json(
      {
        message: "Fichiers comptables uploadés avec succès",
        batchId,
        period: {
          id: comptablePeriod.id,
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
          year,
        },
        s3Prefix,
        files: uploadedFiles,
        comptablePeriod,
        // Info pour le frontend
        fileFormat: {
          version: "3.0",
          description: "Format 4 fichiers avec Grand Livre unifié",
          requiredFiles: REQUIRED_FILE_TYPES.map(ft => ({
            type: ft,
            label: FILE_TYPE_LABELS[ft]
          }))
        }
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Upload comptable error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: "Erreur lors de l'upload des fichiers comptables",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
