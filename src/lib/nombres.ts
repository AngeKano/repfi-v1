// ============================================================================
// Format des nombres de l'application : source unique. Milliers toujours
// séparés par une espace visible : « 12 222K », « 1 234M », « 2 218 101 ».
//
// toLocaleString("fr-FR") sépare les milliers par une espace fine (U+202F),
// presque invisible : « 12 222K » se lit « 12222K ». Elle est remplacée par une
// espace insécable (U+00A0) : pleine largeur et jamais de retour à la ligne au
// milieu d'un nombre.
// ============================================================================

/** Nombre français, milliers séparés. -0 s'affiche 0. */
export function formatNombre(valeur: number, options?: Intl.NumberFormatOptions): string {
  return (valeur === 0 ? 0 : valeur).toLocaleString("fr-FR", options).replace(/\u202F/g, "\u00a0");
}

/** « 1 234,50 » : tailles de fichier, montants d'une écriture. */
export const formatDeuxDecimales = (valeur: number) =>
  formatNombre(valeur, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Montant en milliers : « 12 222K » (en dessous de 1 000 : « 850 »). */
export function formatCompactOnly(value: number): string {
  return Math.abs(value) >= 1000
    ? `${formatNombre(Math.round(value / 1000))}K`
    : formatNombre(value);
}

/** Axe de graphique en millions : « 1 234M ». */
export const formatMillions = (value: number) =>
  `${formatNombre(Number((value / 1_000_000).toFixed(0)))}M`;

/** Axe de graphique, selon l'ordre de grandeur : « 1 234M », « 850K », « 500 ». */
export function formatAxeMontant(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return formatMillions(value);
  if (abs >= 1000) return `${formatNombre(Number((value / 1000).toFixed(0)))}K`;
  return formatNombre(value);
}

/** Lit un montant saisi : « 1 234 567,50 » → 1234567.5 ; illisible → 0. */
export function lireMontant(saisie: string): number {
  const v = parseFloat((saisie || "").replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(v) ? 0 : v;
}

/** Sépare les milliers d'un montant saisi, sans toucher à ce qui suit la virgule. */
export function grouperSaisie(saisie: string): string {
  const m = /^(-?)(\d+)([.,]\d*)?$/.exec((saisie || "").replace(/\s/g, ""));
  return m ? `${m[1]}${formatNombre(Number(m[2]))}${m[3] ?? ""}` : saisie;
}
