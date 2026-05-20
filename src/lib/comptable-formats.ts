/**
 * Détection et validation du format des fichiers comptables.
 *
 * Miroir exact du module Python `plugins/etl/format_detect.py` du DAG Airflow.
 * Les règles métier (quels formats autorisés par type de fichier) doivent
 * rester strictement alignées entre les deux côtés — toute évolution ici
 * doit être répliquée côté ETL.
 */

import { FileType } from "../../prisma/generated/prisma/enums";

export type ComptableFileFormat =
  | "excel"
  | "sage_pnm"
  | "sage_pnc"
  | "unknown";

/**
 * Formats acceptés par type de fichier comptable.
 * - plan_comptes / code_journal : Excel uniquement
 * - plan_tiers                  : Excel ou .pnc Sage (Plan Tiers Sage)
 * - grand_livre                 : Excel ou .pnm Sage (Grand Livre Sage)
 */
export const ALLOWED_FORMATS: Record<FileType, ComptableFileFormat[]> = {
  [FileType.PLAN_COMPTES]: ["excel"],
  [FileType.CODE_JOURNAL]: ["excel"],
  [FileType.PLAN_TIERS]: ["excel", "sage_pnc"],
  [FileType.GRAND_LIVRE]: ["excel", "sage_pnm"],
  // Types legacy (v2) — gardés Excel only pour rétrocompatibilité
  [FileType.GRAND_LIVRE_COMPTES]: ["excel"],
  [FileType.GRAND_LIVRE_TIERS]: ["excel"],
};

/** Libellés humains pour les messages d'erreur. */
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  [FileType.GRAND_LIVRE]: "Grand Livre Comptable",
  [FileType.PLAN_COMPTES]: "Plan Comptable",
  [FileType.PLAN_TIERS]: "Plan Tiers",
  [FileType.CODE_JOURNAL]: "Codes Journaux",
  [FileType.GRAND_LIVRE_COMPTES]: "Grand Livre Comptes (legacy)",
  [FileType.GRAND_LIVRE_TIERS]: "Grand Livre Tiers (legacy)",
};

/** Libellés humains pour chaque format. */
export const FORMAT_LABELS: Record<ComptableFileFormat, string> = {
  excel: "Excel (.xls / .xlsx)",
  sage_pnm: "Sage PNM (.pnm)",
  sage_pnc: "Sage PNC (.pnc)",
  unknown: "format inconnu",
};

/**
 * Taille maximale par fichier (50 Mo). Couvre les exports volumineux
 * sur plusieurs années sans saturer le worker Airflow.
 */
export const MAX_COMPTABLE_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Détecte le format d'un fichier d'après son nom (extension uniquement).
 *
 * Le MIME-type du browser n'est pas fiable pour les .pnm/.pnc (souvent
 * application/octet-stream) — on se base donc exclusivement sur l'extension.
 */
export function detectComptableFormat(fileName: string): ComptableFileFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".pnm")) return "sage_pnm";
  if (lower.endsWith(".pnc")) return "sage_pnc";
  return "unknown";
}

/**
 * Vérifie qu'un format est autorisé pour un type de fichier donné.
 * @returns null si OK, sinon un message d'erreur prêt à afficher.
 */
export function validateComptableFormat(
  fileType: FileType,
  fileFormat: ComptableFileFormat,
): string | null {
  const allowed = ALLOWED_FORMATS[fileType];
  if (!allowed) {
    return `Type de fichier inconnu: ${fileType}`;
  }
  if (!allowed.includes(fileFormat)) {
    const allowedLabels = allowed.map((f) => FORMAT_LABELS[f]).join(", ");
    return (
      `Le fichier "${FILE_TYPE_LABELS[fileType]}" doit être au format ` +
      `${allowedLabels} (reçu : ${FORMAT_LABELS[fileFormat]}).`
    );
  }
  return null;
}

/**
 * Helper pratique pour les composants React : retourne la liste des
 * extensions acceptées par l'input file `accept`, en fonction des types
 * de fichiers qu'on veut autoriser. Si non spécifié, toutes les
 * extensions valides toutes catégories confondues.
 */
export function acceptedExtensionsAttribute(
  fileTypes: FileType[] = [
    FileType.PLAN_COMPTES,
    FileType.CODE_JOURNAL,
    FileType.PLAN_TIERS,
    FileType.GRAND_LIVRE,
  ],
): string {
  const formats = new Set<ComptableFileFormat>();
  for (const t of fileTypes) {
    for (const f of ALLOWED_FORMATS[t] ?? []) {
      formats.add(f);
    }
  }
  const exts: string[] = [];
  if (formats.has("excel")) exts.push(".xlsx", ".xls");
  if (formats.has("sage_pnm")) exts.push(".pnm");
  if (formats.has("sage_pnc")) exts.push(".pnc");
  return exts.join(",");
}
