// ============================================================================
// États financiers SYSCOHADA (Système Normal) — définition des lignes du Bilan
// (Actif / Passif) et du Compte de résultat, conformément aux modèles officiels
// DGI fournis (Modèle Bilan.pdf / Modèle P&L.pdf).
//
// Les codes REF correspondent aux valeurs stockées dans le grand livre :
//   - `bilan_rubrique` → REF du Bilan (AD…BZ pour l'Actif, CA…DZ pour le Passif)
//   - `rubrique`       → REF du Compte de résultat (TA…TO, RA…RS)
// Les lignes de total (AZ, BZ, CP, DZ, XA…XI) sont calculées, jamais stockées.
// ============================================================================

export interface LigneEtat {
  ref: string;
  libelle: string;
  /** Ligne calculée (sous-total) : somme des `children` ou formule dédiée. */
  total?: boolean;
  /** REF agrégés pour un sous-total simple. */
  children?: string[];
  /** Sens structurel indiqué dans le modèle officiel (colonne (2) du P&L). */
  sens?: "+" | "-" | "-/+";
  /** Repère A/B/C/D du chiffre d'affaires dans le modèle. */
  repere?: string;
}

// ==================== BILAN — ACTIF ====================
export const BILAN_ACTIF: LigneEtat[] = [
  { ref: "AD", libelle: "IMMOBILISATIONS INCORPORELLES", total: true, children: ["AE", "AF", "AG", "AH"] },
  { ref: "AE", libelle: "Frais de développement et de prospection" },
  { ref: "AF", libelle: "Brevets, licences, logiciels et droits similaires" },
  { ref: "AG", libelle: "Fonds commercial et droit au bail" },
  { ref: "AH", libelle: "Autres immobilisations incorporelles" },
  { ref: "AI", libelle: "IMMOBILISATIONS CORPORELLES", total: true, children: ["AJ", "AK", "AL", "AM", "AN"] },
  { ref: "AJ", libelle: "Terrains" },
  { ref: "AK", libelle: "Bâtiments" },
  { ref: "AL", libelle: "Aménagements, agencements et installations" },
  { ref: "AM", libelle: "Matériel, mobilier et actifs biologiques" },
  { ref: "AN", libelle: "Matériel de transport" },
  { ref: "AP", libelle: "AVANCES ET ACOMPTES VERSÉS SUR IMMOBILISATIONS" },
  { ref: "AQ", libelle: "IMMOBILISATIONS FINANCIÈRES", total: true, children: ["AR", "AS"] },
  { ref: "AR", libelle: "Titres de participation" },
  { ref: "AS", libelle: "Autres immobilisations financières" },
  { ref: "AZ", libelle: "TOTAL ACTIF IMMOBILISÉ", total: true, children: ["AD", "AI", "AP", "AQ"] },
  { ref: "BA", libelle: "ACTIF CIRCULANT HAO" },
  { ref: "BB", libelle: "STOCKS ET ENCOURS" },
  { ref: "BG", libelle: "CRÉANCES ET EMPLOIS ASSIMILÉS", total: true, children: ["BH", "BI", "BJ"] },
  { ref: "BH", libelle: "Fournisseurs avances versées" },
  { ref: "BI", libelle: "Clients" },
  { ref: "BJ", libelle: "Autres créances" },
  { ref: "BK", libelle: "TOTAL ACTIF CIRCULANT", total: true, children: ["BA", "BB", "BG"] },
  { ref: "BQ", libelle: "Titres de placement" },
  { ref: "BR", libelle: "Valeurs à encaisser" },
  { ref: "BS", libelle: "Banques, chèques postaux, caisse et assimilés" },
  { ref: "BT", libelle: "TOTAL TRÉSORERIE-ACTIF", total: true, children: ["BQ", "BR", "BS"] },
  { ref: "BU", libelle: "Écart de conversion-Actif" },
  { ref: "BZ", libelle: "TOTAL GÉNÉRAL", total: true, children: ["AZ", "BK", "BT", "BU"] },
];

// ==================== BILAN — PASSIF ====================
export const BILAN_PASSIF: LigneEtat[] = [
  { ref: "CA", libelle: "Capital" },
  { ref: "CB", libelle: "Apporteurs capital non appelé (-)" },
  { ref: "CD", libelle: "Primes liées au capital social" },
  { ref: "CE", libelle: "Écarts de réévaluation" },
  { ref: "CF", libelle: "Réserves indisponibles" },
  { ref: "CG", libelle: "Réserves libres" },
  { ref: "CH", libelle: "Report à nouveau (+ ou -)" },
  { ref: "CJ", libelle: "Résultat net de l'exercice (bénéfice + ou perte -)" },
  { ref: "CL", libelle: "Subventions d'investissement" },
  { ref: "CM", libelle: "Provisions réglementées" },
  {
    ref: "CP",
    libelle: "TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES",
    total: true,
    children: ["CA", "CB", "CD", "CE", "CF", "CG", "CH", "CJ", "CL", "CM"],
  },
  { ref: "DA", libelle: "Emprunts et dettes financières diverses" },
  { ref: "DB", libelle: "Dettes de location-acquisition" },
  { ref: "DC", libelle: "Provisions pour risques et charges" },
  { ref: "DD", libelle: "TOTAL DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES", total: true, children: ["DA", "DB", "DC"] },
  { ref: "DF", libelle: "TOTAL RESSOURCES STABLES", total: true, children: ["CP", "DD"] },
  { ref: "DH", libelle: "Dettes circulantes HAO" },
  { ref: "DI", libelle: "Clients, avances reçues" },
  { ref: "DJ", libelle: "Fournisseurs d'exploitation" },
  { ref: "DK", libelle: "Dettes fiscales et sociales" },
  { ref: "DM", libelle: "Autres dettes" },
  { ref: "DN", libelle: "Provisions pour risques à court terme" },
  { ref: "DP", libelle: "TOTAL PASSIF CIRCULANT", total: true, children: ["DH", "DI", "DJ", "DK", "DM", "DN"] },
  { ref: "DQ", libelle: "Banques, crédits d'escompte" },
  { ref: "DR", libelle: "Banques, établissements financiers et crédits de trésorerie" },
  { ref: "DT", libelle: "TOTAL TRÉSORERIE-PASSIF", total: true, children: ["DQ", "DR"] },
  { ref: "DV", libelle: "Écart de conversion-Passif" },
  { ref: "DZ", libelle: "TOTAL GÉNÉRAL", total: true, children: ["DF", "DP", "DT", "DV"] },
];

// ==================== COMPTE DE RÉSULTAT ====================
export const COMPTE_RESULTAT: LigneEtat[] = [
  { ref: "TA", libelle: "Ventes de marchandises", sens: "+", repere: "A" },
  { ref: "RA", libelle: "Achats de marchandises", sens: "-" },
  { ref: "RB", libelle: "Variation de stocks de marchandises", sens: "-/+" },
  { ref: "XA", libelle: "MARGE COMMERCIALE (Somme TA à RB)", total: true },
  { ref: "TB", libelle: "Ventes de produits fabriqués", sens: "+", repere: "B" },
  { ref: "TC", libelle: "Travaux, services vendus", sens: "+", repere: "C" },
  { ref: "TD", libelle: "Produits accessoires", sens: "+", repere: "D" },
  { ref: "XB", libelle: "CHIFFRE D'AFFAIRES (A + B + C + D)", total: true },
  { ref: "TE", libelle: "Production stockée (ou déstockage)", sens: "-/+" },
  { ref: "TF", libelle: "Production immobilisée", sens: "+" },
  { ref: "TG", libelle: "Subventions d'exploitation", sens: "+" },
  { ref: "TH", libelle: "Autres produits", sens: "+" },
  { ref: "TI", libelle: "Transferts de charges d'exploitation", sens: "+" },
  { ref: "RC", libelle: "Achats de matières premières et fournitures liées", sens: "-" },
  { ref: "RD", libelle: "Variation de stocks de matières premières et fournitures liées", sens: "-/+" },
  { ref: "RE", libelle: "Autres achats", sens: "-" },
  { ref: "RF", libelle: "Variation de stocks d'autres approvisionnements", sens: "-/+" },
  { ref: "RG", libelle: "Transports", sens: "-" },
  { ref: "RH", libelle: "Services extérieurs", sens: "-" },
  { ref: "RI", libelle: "Impôts et taxes", sens: "-" },
  { ref: "RJ", libelle: "Autres charges", sens: "-" },
  { ref: "XC", libelle: "VALEUR AJOUTÉE (XB + RA + RB) + (somme TE à RJ)", total: true },
  { ref: "RK", libelle: "Charges de personnel", sens: "-" },
  { ref: "XD", libelle: "EXCÉDENT BRUT D'EXPLOITATION (XC + RK)", total: true },
  { ref: "TJ", libelle: "Reprises d'amortissements, provisions et dépréciations", sens: "+" },
  { ref: "RL", libelle: "Dotations aux amortissements, aux provisions et dépréciations", sens: "-" },
  { ref: "XE", libelle: "RÉSULTAT D'EXPLOITATION (XD + TJ + RL)", total: true },
  { ref: "TK", libelle: "Revenus financiers et assimilés", sens: "+" },
  { ref: "TL", libelle: "Reprises de provisions et dépréciations financières", sens: "+" },
  { ref: "TM", libelle: "Transferts de charges financières", sens: "+" },
  { ref: "RM", libelle: "Frais financiers et charges assimilées", sens: "-" },
  { ref: "RN", libelle: "Dotations aux provisions et aux dépréciations financières", sens: "-" },
  { ref: "XF", libelle: "RÉSULTAT FINANCIER (somme TK à RN)", total: true },
  { ref: "XG", libelle: "RÉSULTAT DES ACTIVITÉS ORDINAIRES (XE + XF)", total: true },
  { ref: "TN", libelle: "Produits des cessions d'immobilisations", sens: "+" },
  { ref: "TO", libelle: "Autres produits HAO", sens: "+" },
  { ref: "RO", libelle: "Valeurs comptables des cessions d'immobilisations", sens: "-" },
  { ref: "RP", libelle: "Autres charges HAO", sens: "-" },
  { ref: "XH", libelle: "RÉSULTAT HORS ACTIVITÉS ORDINAIRES (somme TN à RP)", total: true },
  { ref: "RQ", libelle: "Participation des travailleurs", sens: "-" },
  { ref: "RS", libelle: "Impôts sur le résultat", sens: "-" },
  { ref: "XI", libelle: "RÉSULTAT NET (XG + XH + RQ + RS)", total: true },
];

// REF « feuilles » du compte de résultat réellement présents dans le grand livre.
export const RESULTAT_LEAF_REFS = COMPTE_RESULTAT.filter((l) => !l.total).map((l) => l.ref);

// Comptes d'amortissements / dépréciations : leur solde alimente la colonne
// « AMORT. et DÉPREC. » de l'Actif, jamais la colonne BRUT.
export const AMORT_PREFIXES = ["28", "29", "39", "49", "59"];

/** Normalise un code du grand livre vers un REF du modèle (ex. "DK1" → "DK"). */
export function normalizeRef(raw: string, known: Set<string>): string | null {
  const code = (raw || "").trim().toUpperCase();
  if (!code) return null;
  if (known.has(code)) return code;
  const stripped = code.replace(/\d+$/, "");
  return known.has(stripped) ? stripped : null;
}

/** Applique les sous-totaux « children » dans l'ordre de définition. */
export function applyTotals(lignes: LigneEtat[], values: Record<string, number>): Record<string, number> {
  const out = { ...values };
  for (const l of lignes) {
    if (!l.total || !l.children) continue;
    // Un montant porté directement sur le code de sous-total reste pris en compte.
    out[l.ref] = (out[l.ref] || 0) + l.children.reduce((s, c) => s + (out[c] || 0), 0);
  }
  return out;
}

/** Soldes intermédiaires de gestion (mêmes formules que le modèle officiel). */
export function computeResultatTotals(v: Record<string, number>): Record<string, number> {
  const g = (k: string) => v[k] || 0;
  const out = { ...v };
  out.XA = g("TA") + g("RA") + g("RB");
  out.XB = g("TA") + g("TB") + g("TC") + g("TD");
  out.XC =
    out.XA +
    g("TB") + g("TC") + g("TD") +
    g("TE") + g("TF") + g("TG") + g("TH") + g("TI") +
    g("RC") + g("RD") + g("RE") + g("RF") + g("RG") + g("RH") + g("RI") + g("RJ");
  out.XD = out.XC + g("RK");
  out.XE = out.XD + g("TJ") + g("RL");
  out.XF = g("TK") + g("TL") + g("TM") + g("RM") + g("RN");
  out.XG = out.XE + out.XF;
  out.XH = g("TN") + g("TO") + g("RO") + g("RP");
  out.XI = out.XG + out.XH + g("RQ") + g("RS");
  return out;
}
