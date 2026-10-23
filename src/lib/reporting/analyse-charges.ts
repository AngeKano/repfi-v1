// ============================================================================
// Analyse des charges et du résultat (onglet Résultats).
// Spécification : « Click Insight — Analyse des charges » (F01 à F14).
//
// Entrée : le montant SIGNÉ de chaque rubrique du compte de résultat
// (crédit − débit : produit positif, charge négative), pour la période
// courante et la période de comparaison.
//
//   - Coût d'une catégorie = − somme des montants signés de ses rubriques
//     (jamais de valeur absolue : une reprise reste un coût négatif).  F03/F04
//   - CA = XB = TA + TB + TC + TD.
//   - Autres produits hors CA = TE à TO, avec leurs signes.             F07
//   - Résultat net = CA + autres produits − total des charges (= XI).
//   - Poids = coût / CA de la même période ; écart en points = (poids N −
//     poids N-1) × 100. Aucun arrondi intermédiaire.                    F05
//   - CA nul : ratios « n.a. » (null), montants conservés.              F10
// ============================================================================

import { XB_RUBRIQUES } from "./etats-financiers";

export interface CategorieCharge {
  id: string;
  libelle: string;
  /** Rubriques du compte de résultat rattachées (une seule fois chacune). */
  refs: string[];
  /** Nom précédé de son article, pour le commentaire (« les services extérieurs »). */
  nom: string;
}

/** Les 12 catégories, dans l'ordre de la spécification (aucun tri). F02 */
export const CATEGORIES_CHARGES: CategorieCharge[] = [
  {
    id: "achats",
    libelle: "Achats consommés",
    refs: ["RA", "RB", "RC", "RD", "RE", "RF"],
    nom: "les achats consommés",
  },
  { id: "transports", libelle: "Transports", refs: ["RG"], nom: "les transports" },
  { id: "services", libelle: "Services extérieurs", refs: ["RH"], nom: "les services extérieurs" },
  { id: "impots", libelle: "Impôts et taxes", refs: ["RI"], nom: "les impôts et taxes" },
  {
    id: "autresCharges",
    libelle: "Autres charges d'exploitation",
    refs: ["RJ"],
    nom: "les autres charges d'exploitation",
  },
  { id: "personnel", libelle: "Personnel", refs: ["RK"], nom: "le personnel" },
  {
    id: "dotations",
    libelle: "Amortissements, provisions et dépréciations",
    refs: ["RL"],
    nom: "les dotations aux amortissements et provisions",
  },
  { id: "financieres", libelle: "Charges financières", refs: ["RM"], nom: "les charges financières" },
  {
    id: "dotationsFinancieres",
    libelle: "Amortissements, provisions et dépréciations financières",
    refs: ["RN"],
    nom: "les dotations financières",
  },
  { id: "hao", libelle: "Charges HAO", refs: ["RO", "RP"], nom: "les charges HAO" },
  {
    id: "participation",
    libelle: "Participation des travailleurs",
    refs: ["RQ"],
    nom: "la participation des travailleurs",
  },
  { id: "impotResultat", libelle: "Impôt sur le résultat", refs: ["RS"], nom: "l'impôt sur le résultat" },
];

/** « le personnel » → « du personnel », « les … » → « des … », « la … » → « de la … ». */
export function complementDe(nom: string): string {
  if (nom.startsWith("le ")) return `du ${nom.slice(3)}`;
  if (nom.startsWith("les ")) return `des ${nom.slice(4)}`;
  return `de ${nom}`;
}

/** Rubriques du chiffre d'affaires (XB). */
export const REFS_CA = XB_RUBRIQUES;

/**
 * Autres produits et ajustements hors CA. TN = produits de cession, TO =
 * autres produits HAO. TA à TD sont exclus (déjà dans XB).            F07
 */
export const REFS_AUTRES_PRODUITS = [
  "TE", "TF", "TG", "TH", "TI", "TJ", "TK", "TL", "TM", "TN", "TO",
];

/** Toutes les rubriques lues par l'analyse. */
export const REFS_ANALYSE = [
  ...REFS_CA,
  ...REFS_AUTRES_PRODUITS,
  ...CATEGORIES_CHARGES.flatMap((c) => c.refs),
];

export interface PeriodeCharges {
  ca: number;
  autresProduits: number;
  /** Coût par catégorie (positif = charge, négatif = reprise nette). */
  couts: Record<string, number>;
  totalCharges: number;
  resultat: number;
  /** Poids de chaque catégorie dans le CA ; null si CA nul (n.a.). */
  poids: Record<string, number | null>;
  poidsTotalCharges: number | null;
  poidsAutresProduits: number | null;
  /** Marge nette = résultat / CA ; null si CA nul. */
  marge: number | null;
}

const somme = (m: Record<string, number>, refs: string[]) =>
  refs.reduce((s, r) => s + (m[r] || 0), 0);

const ratio = (n: number, ca: number): number | null => (ca === 0 ? null : n / ca);

/** Agrège les montants signés d'une période. */
export function calculerPeriode(signes: Record<string, number>): PeriodeCharges {
  const ca = somme(signes, REFS_CA);
  const autresProduits = somme(signes, REFS_AUTRES_PRODUITS);
  const couts: Record<string, number> = {};
  const poids: Record<string, number | null> = {};
  let totalCharges = 0;
  for (const c of CATEGORIES_CHARGES) {
    couts[c.id] = -somme(signes, c.refs);
    poids[c.id] = ratio(couts[c.id], ca);
    totalCharges += couts[c.id];
  }
  const resultat = ca + autresProduits - totalCharges;
  return {
    ca,
    autresProduits,
    couts,
    totalCharges,
    resultat,
    poids,
    poidsTotalCharges: ratio(totalCharges, ca),
    poidsAutresProduits: ratio(autresProduits, ca),
    marge: ratio(resultat, ca),
  };
}

/** Écart de poids en points ; null si l'un des deux ratios est indisponible. */
export function ecartPoints(n: number | null, n1: number | null): number | null {
  return n === null || n1 === null ? null : (n - n1) * 100;
}

export interface PontResultat {
  ecartCA: number;
  ecartAutresProduits: number;
  /** Impact des charges sur le résultat : une hausse de coût est négative. */
  impactCharges: number;
  ecartResultat: number;
}

/** Pont de résultat : écart CA + écart autres produits − écart coûts. F14 */
export function pontResultat(n: PeriodeCharges, n1: PeriodeCharges): PontResultat {
  const ecartCA = n.ca - n1.ca;
  const ecartAutresProduits = n.autresProduits - n1.autresProduits;
  const impactCharges = -(n.totalCharges - n1.totalCharges);
  return {
    ecartCA,
    ecartAutresProduits,
    impactCharges,
    ecartResultat: ecartCA + ecartAutresProduits + impactCharges,
  };
}

export interface EtapeCascade {
  id: string;
  libelle: string;
  refs: string[];
  /** Montant signé de l'impact sur le résultat (CA et résultat : leur valeur). */
  impact: number;
  avant: number;
  apres: number;
  type: "ca" | "charge" | "autresProduits" | "resultat";
}

/**
 * Cascade : départ au CA, chaque coût réduit le solde (une reprise
 * l'augmente), puis les autres produits, arrivée au résultat net.     F06
 */
export function cascade(p: PeriodeCharges): EtapeCascade[] {
  const etapes: EtapeCascade[] = [
    { id: "ca", libelle: "Chiffre d'affaires", refs: ["XB"], impact: p.ca, avant: 0, apres: p.ca, type: "ca" },
  ];
  let solde = p.ca;
  for (const c of CATEGORIES_CHARGES) {
    const impact = -p.couts[c.id];
    etapes.push({ id: c.id, libelle: c.libelle, refs: c.refs, impact, avant: solde, apres: solde + impact, type: "charge" });
    solde += impact;
  }
  etapes.push({
    id: "autresProduits",
    libelle: "Autres produits",
    refs: ["TE à TO"],
    impact: p.autresProduits,
    avant: solde,
    apres: solde + p.autresProduits,
    type: "autresProduits",
  });
  solde += p.autresProduits;
  etapes.push({ id: "resultat", libelle: "Résultat net", refs: ["XI"], impact: solde, avant: 0, apres: solde, type: "resultat" });
  return etapes;
}
