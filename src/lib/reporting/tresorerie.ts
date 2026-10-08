// ============================================================================
// Trésorerie — rubriques SYSCOHADA et composition des indicateurs.
//
// Le grand livre porte des rubriques « BS… » pour la trésorerie actif :
//   BSA caisse · BSB banques · BSC régies d'avance · BSD établissements
//   financiers · BSE instruments de trésorerie · BSF instruments de monnaie
//   électronique · BSG accréditifs.
// Le suffixe « 1 » désigne les dépréciations de la rubrique correspondante
// (BSB1, BSD1, BSE1), qui viennent donc EN MOINS du solde brut.
// ============================================================================

/** Rubriques de trésorerie brutes (hors dépréciations), pour le détail par compte. */
export const TRESORERIE_RUBRIQUES = ["BSA", "BSB", "BSC", "BSD", "BSE", "BSF", "BSG"];

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
    ],
    visible: true,
  },
  { id: "caisse", label: "Caisse", termes: [plus("BSA")], visible: true },
  { id: "banque", label: "Banque", termes: [plus("BSB"), moins("BSB1")], visible: true },
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
    id: "monnaieElectronique",
    label: "Instruments de monnaie électronique",
    termes: [plus("BSF")],
    visible: false,
  },
  { id: "accreditifs", label: "Accréditifs", termes: [plus("BSG")], visible: false },
];

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
