// Références partagées pour la saisie manuelle d'écritures comptables.

// Codes journaux standard (liste prédéfinie — la table grand_livre ne stocke
// pas de code journal, c'était un fichier d'import). Ajustable au besoin.
export const CODES_JOURNAUX: { code: string; label: string }[] = [
  { code: "CAIS", label: "Caisse" },
  { code: "BQ", label: "Banque" },
  { code: "VT", label: "Ventes" },
  { code: "AC", label: "Achats" },
  { code: "OD", label: "Opérations diverses" },
  { code: "AN", label: "À-nouveaux" },
  { code: "PAIE", label: "Paie" },
  { code: "STK", label: "Stocks" },
  { code: "IMMO", label: "Immobilisations" },
];

export const CODE_JOURNAUX_SET = new Set(CODES_JOURNAUX.map((j) => j.code));

/** Journaux de trésorerie de la saisie (Caisse, Banque). */
export const CODES_JOURNAUX_TRESORERIE = ["CAIS", "BQ"];

// Types de tiers (pour les comptes centralisateurs uniquement).
export const TYPES_TIERS = ["Client", "Fournisseur", "Salarié", "État", "Autre"];

// Comptes rattachés à des tiers, reconnus par leur RUBRIQUE de bilan (et non
// plus par le préfixe 40 / 41 du numéro de compte) :
//   BI clients · DI clients créditeurs (avances reçues) → « Client »
//   DJ fournisseurs · BH fournisseurs débiteurs (avances versées) → « Fournisseur »
// Pour les autres comptes, les champs tiers (N° Tiers, Type Tiers, Intitulé
// Tiers) sont grisés / vidés.
const TYPE_TIERS_PAR_RUBRIQUE: Record<string, string> = {
  BI: "Client",
  DI: "Client",
  DJ: "Fournisseur",
  BH: "Fournisseur",
};

/** Rubriques de bilan dont les comptes portent des tiers (comptes centralisateurs). */
export const RUBRIQUES_TIERS = Object.keys(TYPE_TIERS_PAR_RUBRIQUE);

/**
 * Rubrique de bilan d'un compte : `bilan` sur l'ancien schéma (deux
 * colonnes), sinon la rubrique unique du schéma fusionné.
 */
export function rubriqueTiers(rubrique?: string, bilan?: string): string {
  return (bilan || rubrique || "").trim().toUpperCase();
}

/** Le compte (via sa rubrique) est rattaché à des tiers. */
export function exigeTiers(rubrique: string): boolean {
  return rubrique in TYPE_TIERS_PAR_RUBRIQUE;
}

/** Type de tiers déduit de la rubrique (« » si le compte n'a pas de tiers). */
export function typeTiersRubrique(rubrique: string): string {
  return TYPE_TIERS_PAR_RUBRIQUE[rubrique] ?? "";
}

// Origine d'une ligne du grand livre (colonne "Flags" de l'export / filtres).
export const FLAG_IMPORT = "Import";
export const FLAG_SAISIE = "Saisie";
export const FLAGS: string[] = [FLAG_IMPORT, FLAG_SAISIE];
