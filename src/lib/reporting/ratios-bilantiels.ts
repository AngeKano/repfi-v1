// ============================================================================
// Ratios bilantiels — FRNG, BFR, dettes financières et DSO.
//
// Tous ces ratios se lisent sur des SOLDES (encours), donc toujours en cumulé
// depuis le 1er janvier de l'exercice. Les REF utilisés sont ceux du modèle
// SYSCOHADA défini dans `etats-financiers.ts` :
//   - actif : solde net = Σ(débit − crédit) ; la rubrique de dépréciation
//     (suffixe « 1 ») est agrégée au même REF, donc (BB − BB1) = net(BB) ;
//   - passif : solde = Σ(crédit − débit).
// ============================================================================

/** Soldes d'un exercice à une date donnée (cumul depuis le 1er janvier). */
export interface SoldesBilan {
  /** Actif, solde net par REF (AZ, BA, BB, BH, BI, BJ…). */
  actif: Record<string, number>;
  /** Passif, solde par REF (DF, DA, DB, DH, DI, DJ, DK, DM, DN…). */
  passif: Record<string, number>;
}

export interface RatiosBilantiels {
  frng: number;
  bfrExploitation: number;
  bfrHao: number;
  bfrGlobal: number;
  dettesFinancieres: number;
  emprunts: number;
  creditBail: number;
}

/** REF du passif circulant retranchés du BFR d'exploitation. */
const BFR_EXPLOITATION_PASSIF = ["DI", "DJ", "DK", "DM", "DN"];
/** REF de l'actif circulant d'exploitation (soldes nets). */
const BFR_EXPLOITATION_ACTIF = ["BB", "BH", "BI", "BJ"];

export function calculerRatios(s: SoldesBilan): RatiosBilantiels {
  const a = (ref: string) => s.actif[ref] || 0;
  const p = (ref: string) => s.passif[ref] || 0;

  // Fonds de roulement net global : ressources stables − actif immobilisé net.
  const frng = p("DF") - a("AZ");

  const bfrExploitation =
    BFR_EXPLOITATION_ACTIF.reduce((t, ref) => t + a(ref), 0) -
    BFR_EXPLOITATION_PASSIF.reduce((t, ref) => t + p(ref), 0);
  const bfrHao = a("BA") - p("DH");

  const emprunts = p("DA");
  const creditBail = p("DB");

  return {
    frng,
    bfrExploitation,
    bfrHao,
    bfrGlobal: bfrExploitation + bfrHao,
    dettesFinancieres: emprunts + creditBail,
    emprunts,
    creditBail,
  };
}

/** Rubriques du chiffre d'affaires retenues pour le DSO (hors subventions). */
export const DSO_CA_RUBRIQUES = ["TA", "TB", "TC", "TD"];
/** Comptes de TVA collectée ajoutés au CA HT pour obtenir le CA TTC. */
export const DSO_TVA_COMPTES = ["4431", "4432", "4433", "4434", "4435"];

/**
 * Délai moyen de paiement clients, en jours.
 *
 * DSO = (créances clients moyennes TTC / CA TTC) × nombre de jours de la
 * période, les créances moyennes étant la demi-somme de l'encours d'ouverture
 * et de l'encours à la date de fin.
 */
export function calculerDso(opts: {
  creancesDebut: number;
  creancesFin: number;
  caTTC: number;
  jours: number;
}): number {
  const moyenne = (opts.creancesDebut + opts.creancesFin) / 2;
  if (opts.caTTC === 0) return 0;
  return (moyenne / opts.caTTC) * opts.jours;
}

/** Nombre de jours écoulés du 1er janvier à la fin du mois (inclus). */
export function joursEcoules(year: number, month: number): number {
  const fin = Date.UTC(year, month, 0); // dernier jour du mois
  const debut = Date.UTC(year, 0, 1);
  return Math.round((fin - debut) / 86400000) + 1;
}

/** Libellés et formules affichés sous chaque indicateur. */
export const RATIOS_FORMULES: Record<string, { label: string; formule: string }> = {
  frng: { label: "Fonds de Roulement Net Global", formule: "DF - AZ (net d'amortissements)" },
  bfrGlobal: { label: "Besoin en Fonds de Roulement", formule: "BFR d'exploitation + BFR HAO" },
  bfrExploitation: {
    label: "BFR d'exploitation",
    formule: "(BB-BB1) + (BH-BH1) + (BI-BI1) + (BJ-BJ1) - DI - DJ - DK - DM - DN",
  },
  bfrHao: { label: "BFR Hors Activités Ordinaires", formule: "(BA - BA1) - DH" },
  dettesFinancieres: { label: "Dettes financières", formule: "DA + DB" },
  emprunts: { label: "Emprunts", formule: "DA" },
  creditBail: { label: "Crédit-bail", formule: "DB" },
  dso: {
    label: "Délai Moyen de paiement Clients (DSO)",
    formule: "(Créances clients moyennes TTC / CA TTC) × nombre de jours",
  },
};
