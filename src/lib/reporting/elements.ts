// ============================================================================
// Catalogue des éléments de reporting : chaque KPI, graphique, tableau et
// commentaire de chaque onglet. Source unique de l'onglet Membres, des onglets
// de reporting, des API (champs-proteges.ts) et du document « Accès ».
//
// Par défaut, un membre voit tout ce que son rôle autorise : un administrateur
// enregistre seulement ce qui lui est MASQUÉ, sur un dossier. Un élément ajouté
// ici plus tard est donc visible de tous. Un onglet dont tous les éléments sont
// masqués disparaît de la navigation.
// ============================================================================

export type TypeElement = "kpi" | "graphe" | "tableau" | "commentaire";

export type OngletReportingId =
  | "overview"
  | "chiffres"
  | "resultats"
  | "recouvrement"
  | "dettes"
  | "dettes-ct"
  | "tresorerie"
  | "dettes-fi"
  | "ratios"
  | "etats"
  | "bilan";

export interface ElementReporting {
  /** « onglet.type.cle » : ce qui est enregistré pour un membre. */
  id: string;
  type: TypeElement;
  label: string;
}

export interface OngletReporting {
  id: OngletReportingId;
  label: string;
  elements: ElementReporting[];
}

export const LIBELLES_TYPES: Record<TypeElement, string> = {
  kpi: "KPI",
  graphe: "Graphiques",
  tableau: "Tableaux",
  commentaire: "Commentaires",
};

export const idElement = (onglet: OngletReportingId, type: TypeElement, cle: string) =>
  `${onglet}.${type}.${cle}`;

function onglet(
  id: OngletReportingId,
  label: string,
  groupes: Partial<Record<TypeElement, Record<string, string>>>,
): OngletReporting {
  const elements: ElementReporting[] = [];
  for (const type of Object.keys(LIBELLES_TYPES) as TypeElement[]) {
    for (const [cle, libelle] of Object.entries(groupes[type] ?? {})) {
      elements.push({ id: idElement(id, type, cle), type, label: libelle });
    }
  }
  return { id, label, elements };
}

// Les clés reprennent les identifiants des KPI et des graphiques de chaque
// onglet (KpiDef.id, GrapheDef.id) : ils y sont filtrés par idElement.
export const ONGLETS_REPORTING: OngletReporting[] = [
  onglet("overview", "Synthèse Financière", {
    kpi: {
      ca: "Chiffre d'affaires",
      ms: "Masse salariale",
      rex: "Résultat d'exploitation",
      rn: "Résultat Net",
      treso: "Trésorerie",
      marge: "Marge commerciale",
      ratiomsca: "Masse salariale / CA",
    },
    graphe: {
      tresorerie: "Évolution de la Trésorerie",
      chargesProduits: "Charges vs Produits",
    },
  }),
  onglet("chiffres", "Chiffres d'affaires", {
    kpi: {
      ca: "Chiffre d'affaires N",
      caN1: "Chiffre d'affaires N-1",
      subventions: "Subventions d'exploitation N",
      subventionsN1: "Subventions d'exploitation N-1",
    },
    graphe: {
      evolutionCa: "Évolution du Chiffre d'Affaires",
      subventions: "Évolution des subventions d'exploitation",
      produitsNature: "Produits par Nature",
    },
    tableau: { topClients: "Top 10 Clients" },
  }),
  onglet("resultats", "Résultats", {
    kpi: {
      marge: "Marge Commerciale",
      va: "Valeur Ajoutée",
      ebe: "Excédent Brut d'Exploitation",
      rex: "Résultat Exploitation",
      rf: "Résultat Financier",
      rn: "Résultat Net",
      rhao: "Résultat HAO",
    },
    graphe: {
      tunnel: "Tunnel de rentabilité",
      chargesRentabilite: "Charges et rentabilité",
    },
  }),
  onglet("recouvrement", "Recouvrement Clients", {
    kpi: {
      taux: "Taux de Recouvrement",
      creances: "Créances Clients TTC",
      encaisse: "Encaissements Clients TTC",
      dso: "Délai Moyen de paiement Clients (DSO)",
    },
    graphe: {
      tauxRecouvrement: "Évolution du Taux de Recouvrement",
      creancesEncaissements: "Créances Clients TTC vs Encaissements Clients TTC",
      dso: "Évolution du Délai Moyen de paiement Clients (DSO)",
      topCreances: "Analyse des Créances - Top 10",
    },
  }),
  onglet("dettes", "Règlement Fournisseurs", {
    kpi: {
      dettesFournisseursTTC: "Dettes fournisseurs TTC",
      decaissementFournisseursTTC: "Décaissement Fournisseurs TTC",
      taux: "Taux de décaissement",
    },
    graphe: {
      tauxDecaissement: "Évolution du Taux de Décaissement Fournisseurs",
      dettesDecaissements: "Dettes Fournisseurs TTC vs Décaissement Fournisseurs TTC",
    },
    tableau: { topFournisseurs: "Analyse des Dettes par Fournisseur - Top 10" },
  }),
  onglet("dettes-ct", "Dettes court terme", {
    kpi: {
      total: "Total Dettes Court Terme",
      dettesFournisseurs: "Dettes fournisseurs",
      dettesSociales: "Dettes sociales",
      dettesPersonnel: "Dettes personnel",
      dettesFiscales: "Dettes fiscales",
      dettesHAO: "Dettes HAO",
    },
    tableau: { topTypes: "Analyse des Dettes par Type - Top 10" },
  }),
  onglet("tresorerie", "Trésorerie", {
    kpi: {
      total: "Total Trésorerie",
      caisse: "Caisse",
      banque: "Banque",
      regies: "Régies d'avance",
      etablissementsFinanciers: "Établissements financiers",
      instrumentsTresorerie: "Instruments de trésorerie",
      autresTresoreriePassif: "Autres Trésorerie Passif",
      monnaieElectronique: "Instruments de monnaie électronique",
      accreditifs: "Accréditifs",
    },
    graphe: { comptes: "Trésorerie par comptes" },
  }),
  onglet("dettes-fi", "Dettes Financières", {
    kpi: {
      dettesFinancieres: "Dettes financières",
      emprunts: "Emprunts",
      creditBail: "Crédit-bail",
    },
    graphe: { evolution: "Évolution des dettes financières" },
  }),
  onglet("ratios", "Ratios bilantiels", {
    kpi: {
      frng: "Fonds de Roulement Net Global",
      bfrGlobal: "Besoin en Fonds de Roulement",
      bfrExploitation: "BFR d'exploitation",
      bfrHao: "BFR Hors Activités Ordinaires",
    },
    graphe: {
      frng: "Fonds de roulement net global",
      bfr: "Besoin en fonds de roulement",
    },
  }),
  onglet("etats", "États Financiers", {
    tableau: {
      bilan: "Bilan",
      resultat: "Compte de Résultat",
      exploitation: "Compte d'exploitation",
    },
  }),
  onglet("bilan", "Bilan d'activité", {
    graphe: {
      evolutionCa: "Évolution du Chiffre d'Affaires",
      tauxRecouvrement: "Évolution du Taux de Recouvrement",
      creancesEncaissements: "Créances Clients TTC vs Encaissements Clients TTC",
      tresorerie: "Évolution de la Trésorerie",
      tunnel: "Tunnel de rentabilité",
    },
    tableau: { topCreances: "Analyse des Créances - Top 10" },
    commentaire: {
      ca: "Commentaire : chiffre d'affaires",
      recouvrement: "Commentaire : recouvrement",
      tresorerie: "Commentaire : trésorerie",
      resultat: "Commentaire : résultat",
    },
  }),
];

/** Tous les identifiants d'éléments connus. */
export const TOUS_LES_ELEMENTS: ReadonlySet<string> = new Set(
  ONGLETS_REPORTING.flatMap((o) => o.elements.map((e) => e.id)),
);

export const NB_ELEMENTS = TOUS_LES_ELEMENTS.size;

/** Éléments masqués d'un onglet. */
export function nbMasquesOnglet(o: OngletReporting, masques: ReadonlySet<string>): number {
  return o.elements.filter((e) => masques.has(e.id)).length;
}

/** Vrai si au moins un élément de l'onglet reste visible. */
export function ongletVisible(id: string, masques: ReadonlySet<string>): boolean {
  const o = ONGLETS_REPORTING.find((x) => x.id === id);
  return !o || nbMasquesOnglet(o, masques) < o.elements.length;
}
