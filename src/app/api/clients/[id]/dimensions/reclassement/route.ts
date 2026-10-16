// ============================================================================
// Reclassement du grand livre selon le mapping PLE actuel.
//
// Le mapping (racine de compte → rubrique) est appliqué aux écritures au
// moment de leur chargement : une modification ligne à ligne du mapping n'agit
// donc sur les écritures déjà chargées qu'une fois celles-ci reclassées. Le
// reclassement est fait par Airflow (DAG etl_dimensions_clickhouse, mode
// « reclassement »), qui détient la règle de rattachement, et suivi comme une
// mise à jour de référentiel dans `dimension_updates`.
// ============================================================================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  FileType,
  ProcessingStatus,
} from "../../../../../../../prisma/generated/prisma/enums";
import { requirePermission, FICHIERS_ACTIONS } from "@/lib/permissions";
import { DIMENSION_EN_COURS } from "@/lib/comptable/dimensions";
import {
  LIBELLE_RECLASSEMENT,
  lancerMiseAJourDimension,
} from "@/lib/comptable/dimension-trigger";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const perm = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (perm instanceof NextResponse) return perm;
    const { user } = perm;

    const { id } = await params;
    const client = await prisma.client.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });

    // Un seul traitement du mapping à la fois (dépôt de fichier ou reclassement).
    const enCours = await prisma.dimensionUpdate.findFirst({
      where: { clientId: id, fileType: FileType.PLE, status: { in: DIMENSION_EN_COURS } },
      select: { id: true },
    });
    if (enCours)
      return NextResponse.json(
        { error: "Un traitement du mapping est déjà en cours : attendez sa fin." },
        { status: 409 },
      );

    // Ligne de suivi sans fichier : c'est ce qui désigne le mode reclassement.
    const update = await prisma.dimensionUpdate.create({
      data: {
        clientId: id,
        fileType: FileType.PLE,
        fileName: LIBELLE_RECLASSEMENT,
        s3Key: "",
        fileSize: 0,
        status: ProcessingStatus.PENDING,
        uploadedById: user.id,
      },
    });

    try {
      const lancee = await lancerMiseAJourDimension(update);
      return NextResponse.json({ message: "Reclassement lancé", update: lancee }, { status: 201 });
    } catch (e) {
      // Reste en PENDING : relançable depuis l'historique des mises à jour.
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Le reclassement n'a pas pu démarrer : ${message}` },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Reclassement error:", error);
    return NextResponse.json({ error: "Erreur lors du lancement du reclassement" }, { status: 500 });
  }
}
