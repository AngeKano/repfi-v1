// ============================================================================
// Lancement du DAG Airflow « etl_dimensions_clickhouse » pour une ligne de
// suivi `dimension_updates` (côté serveur uniquement).
//
// Deux modes, selon la ligne de suivi :
//   - fichier      : la ligne porte une clé S3 → le DAG fusionne le fichier
//                    dans la table (et reclasse le grand livre s'il s'agit du
//                    mapping PLE) ;
//   - reclassement : pas de fichier (mapping PLE uniquement) → le DAG
//                    réapplique le mapping actuel aux écritures déjà chargées.
// Le DAG écrit ensuite lui-même statut, progression, compteurs et erreur dans
// `dimension_updates` grâce à update_id.
// ============================================================================
import { prisma } from "@/lib/prisma";
import { ProcessingStatus } from "../../../prisma/generated/prisma/enums";
import { triggerAirflowDagRun } from "@/lib/airflow";
import { DIMENSION_DAG_ID, dimensionParType } from "./dimensions";

export const MODE_RECLASSEMENT = "reclassement";

/** Libellé de la ligne de suivi d'un reclassement (pas de fichier déposé). */
export const LIBELLE_RECLASSEMENT = "Reclassement du grand livre";

export async function lancerMiseAJourDimension(update: {
  id: string;
  clientId: string;
  fileType: string;
  s3Key: string;
}) {
  const dimension = dimensionParType(update.fileType);
  if (!dimension) throw new Error("Type de référentiel invalide");

  const dagRunId = await triggerAirflowDagRun(DIMENSION_DAG_ID, {
    client_id: update.clientId,
    dimension: dimension.etlType,
    update_id: update.id,
    ...(update.s3Key ? { s3_key: update.s3Key } : { mode: MODE_RECLASSEMENT }),
  });

  // Le DAG prend le relais pour la suite du suivi.
  return prisma.dimensionUpdate.update({
    where: { id: update.id },
    data: {
      status: ProcessingStatus.PROCESSING,
      progress: 5,
      dagRunId,
      rowsInserted: null,
      rowsUpdated: null,
      errorMessage: null,
      processedAt: null,
    },
  });
}
