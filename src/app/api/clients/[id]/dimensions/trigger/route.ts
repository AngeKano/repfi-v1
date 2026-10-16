// ============================================================================
// Lancement du traitement Airflow d'une mise à jour de dimension déposée.
//
// Pendant de /api/files/comptable/trigger-etl pour l'import complet : on
// confie le fichier au DAG « etl_dimensions_clickhouse » en lui passant
// l'identifiant de suivi (update_id). C'est ensuite le DAG qui écrit statut,
// progression, compteurs et message d'erreur dans `dimension_updates`.
//
// Un dépôt en attente (PENDING) ou en échec (FAILED) peut être (re)lancé,
// comme le bouton « Relancer le traitement » de l'import complet.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ProcessingStatus } from "../../../../../../../prisma/generated/prisma/enums";
import { requirePermission, FICHIERS_ACTIONS } from "@/lib/permissions";
import { DIMENSION_EN_COURS, dimensionParType } from "@/lib/comptable/dimensions";
import { lancerMiseAJourDimension } from "@/lib/comptable/dimension-trigger";

const triggerSchema = z.object({ updateId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const perm = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (perm instanceof NextResponse) return perm;
    const { user } = perm;

    const { id } = await params;
    const parsed = triggerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    const update = await prisma.dimensionUpdate.findFirst({
      where: { id: parsed.data.updateId, clientId: id },
      include: { client: { select: { companyId: true } } },
    });
    if (!update) return NextResponse.json({ error: "Mise à jour introuvable" }, { status: 404 });
    if (update.client.companyId !== user.companyId)
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

    if (DIMENSION_EN_COURS.includes(update.status) && update.status !== ProcessingStatus.PENDING)
      return NextResponse.json({ error: "Traitement déjà en cours" }, { status: 409 });
    if (update.status === ProcessingStatus.COMPLETED)
      return NextResponse.json({ error: "Mise à jour déjà traitée" }, { status: 409 });

    const dimension = dimensionParType(update.fileType);
    if (!dimension) return NextResponse.json({ error: "Type de référentiel invalide" }, { status: 400 });

    // Une seule mise à jour à la fois par table.
    const autre = await prisma.dimensionUpdate.findFirst({
      where: {
        clientId: id,
        fileType: update.fileType,
        status: { in: [ProcessingStatus.VALIDATING, ProcessingStatus.PROCESSING] },
        id: { not: update.id },
      },
      select: { id: true },
    });
    if (autre)
      return NextResponse.json(
        { error: `Une mise à jour « ${dimension.label} » est déjà en cours.` },
        { status: 409 },
      );

    // Fichier déposé → fusion ; sans fichier → reclassement (mapping PLE).
    try {
      const lancee = await lancerMiseAJourDimension(update);
      return NextResponse.json({ message: "Traitement lancé", update: lancee, dagRunId: lancee.dagRunId });
    } catch (e) {
      // Le dépôt reste en PENDING : il pourra être relancé.
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Le traitement n'a pas pu démarrer : ${message}` },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Dimensions trigger error:", error);
    return NextResponse.json({ error: "Erreur lors du lancement du traitement" }, { status: 500 });
  }
}
