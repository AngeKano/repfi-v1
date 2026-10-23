// ============================================================================
// Trésorerie — rubriques SYSCOHADA et composition des indicateurs.
// L'onglet Trésorerie et la Synthèse raisonnent UNIQUEMENT par rubrique.
//
// Trésorerie actif (rubriques « BS… ») :
//   BSA caisse · BSB banques · BSC régies d'avance · BSD établissements
//   financiers · BSE instruments de trésorerie · BSF instruments de monnaie
//   électronique · BSG accréditifs.
//   Le suffixe « 1 » désigne les dépréciations de la rubrique correspondante
//   (BSB1, BSD1, BSE1), qui viennent EN MOINS du solde brut.
//
// Trésorerie passif :
//   DRA, DRB, DRC (banques, établissements financiers et crédits de
//   trésorerie) · DQ (banques, crédits d'escompte).
//   Ce sont des concours bancaires : ils viennent EN MOINS de la trésorerie.
//
// Convention des soldes par rubrique (voir soldeRubriqueSql) :
//   - actif  : débit − crédit ; rubriques de dépréciation (BSB1, BSD1, BSE1) :
//     crédit − débit ;
//   - passif : crédit − débit (un découvert est un montant positif).
// Ainsi « BSB − DRA » se lit naturellement : trésorerie − concours bancaires.
// ============================================================================

export interface TresorerieTerme {
  code: string;
  signe: 1 | -1;
}

export interface TresorerieKpiDef {
  id: string;
  label: string;
  /** Termes dans l'ordre d'affichage de la formule. */
  termes: TresorerieTerme[];
  /** Les rubriques résiduelles (BSF, BSG) alimentent le total sans être affichées. */
  visible: boolean;
}

const plus = (code: string): TresorerieTerme => ({ code, signe: 1 });
const moins = (code: string): TresorerieTerme => ({ code, signe: -1 });

export const TRESORERIE_KPIS: TresorerieKpiDef[] = [
  {
    id: "total",
    label: "Total Trésorerie",
    termes: [
      plus("BSA"),
      plus("BSB"),
      moins("BSB1"),
      plus("BSC"),
      plus("BSD"),
      moins("BSD1"),
      plus("BSE"),
      moins("BSE1"),
      plus("BSF"),
      plus("BSG"),
      moins("DRA"),
      moins("DRB"),
      moins("DRC"),
      moins("DQ"),
    ],
    visible: true,
  },
  { id: "caisse", label: "Caisse", termes: [plus("BSA")], visible: true },
  {
    id: "banque",
    label: "Banque",
    termes: [plus("BSB"), moins("BSB1"), moins("DRA"), moins("DRB")],
    visible: true,
  },
  { id: "regies", label: "Régies d'avance", termes: [plus("BSC")], visible: true },
  {
    id: "etablissementsFinanciers",
    label: "Établissements financiers",
    termes: [plus("BSD"), moins("BSD1")],
    visible: true,
  },
  {
    id: "instrumentsTresorerie",
    label: "Instruments de trésorerie",
    termes: [plus("BSE"), moins("BSE1")],
    visible: true,
  },
  {
    // Concours bancaires hors banques : crédits de trésorerie et d'escompte.
    // Montant de passif, donc affiché positif.
    id: "autresTresoreriePassif",
    label: "Autres Trésorerie Passif",
    termes: [plus("DRC"), plus("DQ")],
    visible: true,
  },
  {
    id: "monnaieElectronique",
    label: "Instruments de monnaie électronique",
    termes: [plus("BSF")],
    visible: false,
  },
  { id: "accreditifs", label: "Accréditifs", termes: [plus("BSG")], visible: false },
];

/** Toutes les rubriques citées par un indicateur (soldes à lire en base). */
export const RUBRIQUES_TRESORERIE: string[] = [
  ...new Set(TRESORERIE_KPIS.flatMap((k) => k.termes.map((t) => t.code))),
];

/**
 * Rubriques du Total Trésorerie. Sur ces rubriques, la somme des
 * (débit − crédit) de toutes les lignes est EXACTEMENT le Total Trésorerie :
 * dépréciations et concours bancaires y sont créditeurs, donc déjà en moins.
 * Sert au détail par compte et à la trésorerie de la Synthèse.
 */
export const RUBRIQUES_TOTAL_TRESORERIE: string[] = TRESORERIE_KPIS[0].termes.map((t) => t.code);

/** Rubrique de passif (concours bancaires) : solde lu en crédit − débit. */
export function estRubriquePassif(code: string): boolean {
  return code.startsWith("D");
}

/**
 * Solde d'une rubrique selon la convention de l'onglet, à utiliser dans une
 * requête groupée par rubrique (`refExpr` est la clé de regroupement).
 * `estAmortSql` désigne les comptes d'amortissement / dépréciation.
 */
export function soldeRubriqueSql(refExpr: string, estAmortSql: string): string {
  return (
    `if(startsWith(${refExpr}, 'D'), ` +
    `sum(credit - debit), ` +
    `sumIf(debit - credit, NOT (${estAmortSql})) + sumIf(credit - debit, ${estAmortSql}))`
  );
}

/** Formule lisible affichée sous le libellé du KPI. */
export function formuleTresorerie(kpi: TresorerieKpiDef): string {
  const expr = kpi.termes
    .map((t, i) => (i === 0 ? t.code : `${t.signe === 1 ? "+" : "-"} ${t.code}`))
    .join(" ");
  return `Somme des soldes (Rubrique ${expr})`;
}

/** Valeur d'un KPI à partir des soldes par rubrique. */
export function valeurTresorerie(
  kpi: TresorerieKpiDef,
  soldes: Record<string, number>,
): number {
  return kpi.termes.reduce((s, t) => s + t.signe * (soldes[t.code] || 0), 0);
}
