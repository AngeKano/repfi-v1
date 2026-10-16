// ============================================================================
// Tables de dimension pouvant être mises à jour seules, fichier par fichier.
// Partagé entre l'API (dépôt + suivi) et l'interface d'import.
//
// Correspondance des trois vocabulaires :
//   fileType (Prisma / front) → etlType (conf du DAG) → table (ClickHouse)
// ============================================================================
import { FileType } from "../../../prisma/generated/prisma/enums";

export interface DimensionDef {
  fileType: FileType;
  /** Valeur attendue dans la conf « dimension » du DAG etl_dimensions_clickhouse. */
  etlType: "plan_comptes" | "code_journal" | "plan_tiers";
  /** Table ClickHouse mise à jour. */
  table: "plan_compte" | "code_journal" | "plan_tiers";
  label: string;
  /** Ce qui identifie une ligne : une ligne de même clé est mise à jour. */
  cle: string;
}

export const DIMENSIONS: DimensionDef[] = [
  {
    fileType: FileType.PLAN_COMPTES,
    etlType: "plan_comptes",
    table: "plan_compte",
    label: "Plan comptable",
    cle: "numéro de compte",
  },
  {
    fileType: FileType.PLAN_TIERS,
    etlType: "plan_tiers",
    table: "plan_tiers",
    label: "Plan tiers",
    cle: "numéro de tiers",
  },
  {
    fileType: FileType.CODE_JOURNAL,
    etlType: "code_journal",
    table: "code_journal",
    label: "Codes journaux",
    cle: "code journal",
  },
];

export function dimensionParType(fileType: string): DimensionDef | undefined {
  return DIMENSIONS.find((d) => d.fileType === fileType);
}
