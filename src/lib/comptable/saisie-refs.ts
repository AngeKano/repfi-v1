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

// Types de tiers (pour les comptes centralisateurs uniquement).
export const TYPES_TIERS = ["Client", "Fournisseur", "Salarié", "État", "Autre"];

// Un compte est "centralisateur" (rattaché à des tiers) s'il commence par 40
// (fournisseurs) ou 41 (clients). Pour les autres comptes, les champs tiers
// (N° Tiers, Type Tiers, Intitulé Tiers) doivent être grisés / vides.
export function isCentralizingAccount(compte: string): boolean {
  return /^(40|41)/.test((compte || "").trim());
}

// Suggestion de type de tiers selon le préfixe du compte.
export function suggestTypeTiers(compte: string): string {
  const c = (compte || "").trim();
  if (c.startsWith("401")) return "Fournisseur";
  if (c.startsWith("411")) return "Client";
  if (c.startsWith("42")) return "Salarié";
  if (c.startsWith("44")) return "État";
  return "";
}
