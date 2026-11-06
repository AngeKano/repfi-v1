// ============================================================================
// Protection des réponses des API de reporting : un champ n'est envoyé au
// navigateur que si au moins un élément qui l'affiche reste visible pour le
// membre. Masquer un élément à l'écran ne suffit pas : le montant resterait
// lisible dans la réponse réseau.
//
// Chaque règle associe des chemins de la réponse (« kpis.total », « chartData[].frng »)
// aux éléments du catalogue qui les affichent. Tous masqués : le champ est
// neutralisé (nombre → 0, texte → "", liste → []). La forme de la réponse ne
// change pas, l'écran n'a donc pas à gérer de champ absent.
//
// À tenir à jour avec elements.ts : un montant ajouté à une réponse doit
// figurer ici, avec tous les éléments qui l'affichent.
// ============================================================================
import { idElement, type OngletReportingId } from "./elements";

export interface RegleChamp {
  chemins: string[];
  elements: string[];
}

function neutre(valeur: unknown): unknown {
  if (typeof valeur === "number") return 0;
  if (typeof valeur === "string") return "";
  if (Array.isArray(valeur)) return [];
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, neutre(v)]));
  }
  return valeur;
}

function neutraliser(cible: unknown, segments: string[]): void {
  if (!cible || typeof cible !== "object") return;
  const [segment, ...suite] = segments;
  const liste = segment.endsWith("[]");
  const cle = liste ? segment.slice(0, -2) : segment;
  const objet = cible as Record<string, unknown>;
  if (!(cle in objet)) return;
  if (liste) {
    if (Array.isArray(objet[cle])) for (const item of objet[cle]) neutraliser(item, suite);
  } else if (suite.length === 0) {
    objet[cle] = neutre(objet[cle]);
  } else {
    neutraliser(objet[cle], suite);
  }
}

/** Neutralise, dans la réponse, les champs dont tous les éléments sont masqués. */
export function filtrerReponse<T>(reponse: T, regles: RegleChamp[], masques: ReadonlySet<string>): T {
  if (masques.size === 0) return reponse;
  for (const regle of regles) {
    if (regle.elements.every((e) => masques.has(e))) {
      for (const chemin of regle.chemins) neutraliser(reponse, chemin.split("."));
    }
  }
  return reponse;
}

const k = (o: OngletReportingId, c: string) => idElement(o, "kpi", c);
const g = (o: OngletReportingId, c: string) => idElement(o, "graphe", c);
const t = (o: OngletReportingId, c: string) => idElement(o, "tableau", c);
const c = (o: OngletReportingId, cle: string) => idElement(o, "commentaire", cle);

const TUNNELS = [g("resultats", "tunnel"), g("bilan", "tunnel")];
const ANALYSE_RESULTAT = c("bilan", "resultat");
const COURBES_TAUX = [g("recouvrement", "tauxRecouvrement"), g("bilan", "tauxRecouvrement")];
const COURBES_CREANCES = [
  g("recouvrement", "creancesEncaissements"),
  g("bilan", "creancesEncaissements"),
];

/** Un indicateur de /reporting : valeur N, valeur N-1 et variation. */
function indicateur(cle: string, n: string[], n1: string[], variation: string[]): RegleChamp[] {
  return [
    { chemins: [`indicateurs.anneeN.${cle}`], elements: n },
    { chemins: [`indicateurs.anneeN1.${cle}`], elements: n1 },
    { chemins: [`indicateurs.variations.${cle}`], elements: variation },
  ];
}

const chartData = (...cles: string[]) => cles.map((cle) => `chartData[].${cle}`);

/** GET /reporting : Synthèse, Chiffres d'affaires, Résultats, Bilan d'activité. */
export const CHAMPS_REPORTING: RegleChamp[] = [
  ...indicateur(
    "chiffreAffaires",
    [k("overview", "ca"), k("chiffres", "ca"), ...TUNNELS, c("bilan", "ca"), ANALYSE_RESULTAT],
    [k("overview", "ca"), k("chiffres", "caN1")],
    [k("overview", "ca"), k("chiffres", "ca"), c("bilan", "ca")],
  ),
  ...indicateur(
    "masseSalariale",
    [k("overview", "ms"), ANALYSE_RESULTAT],
    [k("overview", "ms")],
    [k("overview", "ms")],
  ),
  ...indicateur(
    "ratioMasseSalarialeCA",
    [k("overview", "ratiomsca")],
    [k("overview", "ratiomsca")],
    [k("overview", "ratiomsca")],
  ),
  ...indicateur(
    "resultatExploitation",
    [k("overview", "rex"), k("resultats", "rex"), ...TUNNELS, ANALYSE_RESULTAT],
    [k("overview", "rex")],
    [k("overview", "rex"), k("resultats", "rex")],
  ),
  ...indicateur(
    "resultatNet",
    [k("overview", "rn"), k("resultats", "rn"), ...TUNNELS, ANALYSE_RESULTAT],
    [k("overview", "rn")],
    [k("overview", "rn"), k("resultats", "rn"), ANALYSE_RESULTAT],
  ),
  ...indicateur(
    "soldeTresorerie",
    [k("overview", "treso"), c("bilan", "tresorerie")],
    [k("overview", "treso")],
    [k("overview", "treso"), c("bilan", "tresorerie")],
  ),
  ...indicateur(
    "margeCommerciale",
    [k("overview", "marge"), k("resultats", "marge"), ...TUNNELS],
    [k("overview", "marge")],
    [k("overview", "marge"), k("resultats", "marge")],
  ),
  ...indicateur(
    "valeurAjoutee",
    [k("resultats", "va"), ...TUNNELS, ANALYSE_RESULTAT],
    [k("resultats", "va")],
    [k("resultats", "va")],
  ),
  ...indicateur("ebe", [k("resultats", "ebe")], [k("resultats", "ebe")], [k("resultats", "ebe")]),
  ...indicateur(
    "resultatFinancier",
    [k("resultats", "rf"), ...TUNNELS],
    [k("resultats", "rf")],
    [k("resultats", "rf")],
  ),
  ...indicateur(
    "resultatHAO",
    [k("resultats", "rhao"), ...TUNNELS],
    [k("resultats", "rhao")],
    [k("resultats", "rhao")],
  ),
  ...indicateur(
    "subventions",
    [k("chiffres", "subventions")],
    [k("chiffres", "subventionsN1")],
    [k("chiffres", "subventions")],
  ),
  ...indicateur(
    "tauxRecouvrement",
    [k("recouvrement", "taux"), c("bilan", "recouvrement")],
    [k("recouvrement", "taux")],
    [k("recouvrement", "taux")],
  ),
  {
    chemins: ["caTTCTotal", "caEncaisseTTC"].flatMap((cle) => [
      `indicateurs.anneeN.${cle}`,
      `indicateurs.anneeN1.${cle}`,
    ]),
    elements: [k("recouvrement", "creances"), k("recouvrement", "encaisse"), ...COURBES_CREANCES],
  },
  {
    chemins: ["caTA", "caTB", "caTC", "caTD"].flatMap((cle) => [
      `indicateurs.anneeN.${cle}`,
      `indicateurs.anneeN1.${cle}`,
      `indicateurs.variations.${cle}`,
    ]),
    elements: [g("chiffres", "produitsNature")],
  },
  {
    chemins: ["produitsAdditionnels", "totalAchats", "impotResultat"].flatMap((cle) => [
      `indicateurs.anneeN.${cle}`,
      `indicateurs.anneeN1.${cle}`,
    ]),
    elements: [ANALYSE_RESULTAT],
  },
  {
    chemins: [
      ...chartData("charges", "produits", "resultat", "cumulativeBalance"),
      "baselineFlux",
      "totals",
      "periods[].charges",
      "periods[].produits",
    ],
    elements: [g("overview", "chargesProduits")],
  },
  {
    chemins: chartData(
      "chiffreAffaires",
      "chiffreAffairesN1",
      "chiffreAffairesPeriodique",
      "chiffreAffairesPeriodiqueN1",
    ),
    elements: [g("chiffres", "evolutionCa"), g("bilan", "evolutionCa")],
  },
  {
    chemins: chartData(
      "subventions",
      "subventionsN1",
      "subventionsPeriodique",
      "subventionsPeriodiqueN1",
    ),
    elements: [g("chiffres", "subventions")],
  },
  {
    chemins: chartData("soldeTresorerie", "soldeTresorerieN1"),
    elements: [g("overview", "tresorerie"), g("bilan", "tresorerie")],
  },
  {
    chemins: chartData("margeCommerciale", "margeCommercialeN1"),
    elements: [k("overview", "marge"), k("resultats", "marge")],
  },
  {
    chemins: chartData("tauxRecouvrement", "tauxRecouvrementN1"),
    elements: COURBES_TAUX,
  },
  { chemins: chartData("caTTCTotal", "caEncaisseTTC"), elements: COURBES_CREANCES },
  { chemins: ["topClients"], elements: [t("chiffres", "topClients")] },
  { chemins: ["caParNature"], elements: [g("chiffres", "produitsNature")] },
];

/** GET /reporting/recouvrement : Recouvrement Clients, Bilan d'activité. */
export const CHAMPS_RECOUVREMENT: RegleChamp[] = [
  {
    chemins: ["totals.tauxRecouvrement"],
    elements: [k("recouvrement", "taux"), c("bilan", "recouvrement")],
  },
  { chemins: ["totals.caTTCTotal"], elements: [k("recouvrement", "creances")] },
  { chemins: ["totals.caEncaisseTTC"], elements: [k("recouvrement", "encaisse")] },
  {
    chemins: ["totals.soldeCreances"],
    elements: [k("recouvrement", "creances"), k("recouvrement", "encaisse")],
  },
  { chemins: chartData("tauxRecouvrement", "tauxRecouvrementCumule"), elements: COURBES_TAUX },
  {
    chemins: chartData("caTTCTotal", "caEncaisseTTC", "cumulativeCaTTC", "cumulativeCaEncaisse"),
    elements: COURBES_CREANCES,
  },
  {
    chemins: ["topCreances", "totalCreances", "partTop10"],
    elements: [g("recouvrement", "topCreances"), t("bilan", "topCreances")],
  },
];

/** GET /reporting/dettes : Règlement Fournisseurs, Dettes court terme. */
export const CHAMPS_DETTES: RegleChamp[] = [
  {
    chemins: ["kpis.dettesFournisseursTTC", "totals.detteNeeTotal"],
    elements: [k("dettes", "dettesFournisseursTTC")],
  },
  {
    chemins: ["kpis.decaissementFournisseursTTC", "totals.rembourseTotal"],
    elements: [k("dettes", "decaissementFournisseursTTC")],
  },
  {
    chemins: ["kpis.tauxRemboursement", "totals.tauxRemboursement"],
    elements: [k("dettes", "taux")],
  },
  {
    chemins: ["totals.soldeDettes"],
    elements: [k("dettes", "dettesFournisseursTTC"), k("dettes", "decaissementFournisseursTTC")],
  },
  // Le total des dettes court terme est la somme de ces cinq composantes : elles
  // restent envoyées tant qu'il est visible, même si leur carte est masquée.
  ...["dettesFournisseurs", "dettesSociales", "dettesPersonnel", "dettesFiscales", "dettesHAO"].map(
    (cle) => ({
      chemins: [`kpis.${cle}`],
      elements: [k("dettes-ct", cle), k("dettes-ct", "total")],
    }),
  ),
  {
    chemins: chartData("tauxRemboursement", "tauxRemboursementCumule"),
    elements: [g("dettes", "tauxDecaissement")],
  },
  {
    chemins: chartData(
      "detteFournisseurNee",
      "detteFournisseurRemboursee",
      "detteNeeTotal",
      "rembourseTotal",
      "cumulDetteNeeTotal",
      "cumulRembourseTotal",
    ),
    elements: [g("dettes", "dettesDecaissements")],
  },
  { chemins: ["topByType"], elements: [t("dettes-ct", "topTypes")] },
  { chemins: ["topByFournisseur"], elements: [t("dettes", "topFournisseurs")] },
];

/** GET /reporting/tresorerie. */
export const CHAMPS_TRESORERIE: RegleChamp[] = [
  // La ligne Total du tableau par comptes reprend l'indicateur.
  { chemins: ["kpis.total"], elements: [k("tresorerie", "total"), g("tresorerie", "comptes")] },
  ...[
    "caisse",
    "banque",
    "regies",
    "etablissementsFinanciers",
    "instrumentsTresorerie",
    "autresTresoreriePassif",
    "monnaieElectronique",
    "accreditifs",
  ].map((cle) => ({ chemins: [`kpis.${cle}`], elements: [k("tresorerie", cle)] })),
  { chemins: ["comptes"], elements: [g("tresorerie", "comptes")] },
];

/** GET /reporting/ratios : Ratios bilantiels, Dettes Financières, DSO du Recouvrement. */
export const CHAMPS_RATIOS: RegleChamp[] = [
  ...["frng", "bfrGlobal", "bfrExploitation", "bfrHao"].map((cle) => ({
    chemins: [`kpis.${cle}`],
    elements: [k("ratios", cle)],
  })),
  ...["dettesFinancieres", "emprunts", "creditBail"].map((cle) => ({
    chemins: [`kpis.${cle}`],
    elements: [k("dettes-fi", cle)],
  })),
  { chemins: ["kpis.dso"], elements: [k("recouvrement", "dso"), g("recouvrement", "dso")] },
  { chemins: ["dsoDetail"], elements: [g("recouvrement", "dso")] },
  { chemins: chartData("frng", "frngN1"), elements: [g("ratios", "frng")] },
  {
    chemins: chartData(
      "bfrGlobal",
      "bfrGlobalN1",
      "bfrExploitation",
      "bfrExploitationN1",
      "bfrHao",
      "bfrHaoN1",
    ),
    elements: [g("ratios", "bfr")],
  },
  {
    chemins: chartData(
      "dettesFinancieres",
      "dettesFinancieresN1",
      "emprunts",
      "empruntsN1",
      "creditBail",
      "creditBailN1",
    ),
    elements: [g("dettes-fi", "evolution")],
  },
  { chemins: chartData("dso", "dsoN1"), elements: [g("recouvrement", "dso")] },
];

/** GET /reporting/etats-financiers : Bilan et Compte de résultat. */
export const CHAMPS_ETATS: RegleChamp[] = [
  { chemins: ["actif", "passif"], elements: [t("etats", "bilan")] },
  { chemins: ["resultat"], elements: [t("etats", "resultat")] },
];

/** GET /reporting/compte-exploitation. */
export const CHAMPS_EXPLOITATION: RegleChamp[] = [
  { chemins: ["lignes"], elements: [t("etats", "exploitation")] },
];

/** Toutes les règles, pour la vérification du catalogue. */
export const TOUTES_LES_REGLES: RegleChamp[] = [
  ...CHAMPS_REPORTING,
  ...CHAMPS_RECOUVREMENT,
  ...CHAMPS_DETTES,
  ...CHAMPS_TRESORERIE,
  ...CHAMPS_RATIOS,
  ...CHAMPS_ETATS,
  ...CHAMPS_EXPLOITATION,
];
