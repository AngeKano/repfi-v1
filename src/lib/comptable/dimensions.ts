// ============================================================================
// Référentiels du client : tables de dimension (plan comptable, plan tiers,
// codes journaux) et table de mapping des rubriques (`ple`).
// Partagé entre l'API (dépôt, suivi, consultation) et l'interface.
//
// Correspondance des trois vocabulaires pour les dimensions :
//   fileType (Prisma / front) → etlType (conf du DAG) → table (ClickHouse)
// ============================================================================
import { FileType, ProcessingStatus } from "../../../prisma/generated/prisma/enums";

/** DAG Airflow chargé de la mise à jour unitaire (pendant de etl_comptable_clickhouse). */
export const DIMENSION_DAG_ID = "etl_dimensions_clickhouse";

/** Statuts d'un traitement non terminé : déposé, en validation ou en cours. */
export const DIMENSION_EN_COURS: ProcessingStatus[] = [
  ProcessingStatus.PENDING,
  ProcessingStatus.VALIDATING,
  ProcessingStatus.PROCESSING,
];

/** Colonne d'une table de référentiel. */
export interface ColonneDimension {
  /** Nom de la colonne ClickHouse. */
  nom: string;
  libelle: string;
  /**
   * Fait partie de la clé de la table : affichée mais jamais modifiable. La
   * première colonne clé sert d'identifiant à l'édition et de tri par défaut.
   */
  cle?: boolean;
  /** Modifiable depuis l'interface. */
  editable?: boolean;
  /** Valeur obligatoire à l'édition. */
  requis?: boolean;
  /** Valeur courte prise dans une liste (type, nature) : suggestions à l'édition. */
  categorie?: boolean;
  /** Colonne fournissant le libellé affiché à côté de la valeur dans les filtres. */
  libelleDe?: string;
  /**
   * Colonne du grand livre qui recopie cette valeur (dénormalisée au
   * chargement) : elle est mise à jour avec la dimension, comme le fait le
   * DAG (_GL_PROPAGATION).
   */
  grandLivre?: string;
  /** Champ équivalent des écritures saisies (ManualLedgerEntry). */
  saisie?: "intituleCompte" | "intituleTiers" | "typeTiers";
}

/** Table consultable depuis l'onglet Comptabilité. */
export interface TableReferentiel {
  /** Identifiant d'URL. */
  id: string;
  /** Table ClickHouse. */
  table: string;
  label: string;
  /** Colonnes dans l'ordre d'affichage, clé en premier. */
  colonnes: ColonneDimension[];
  /** Colonne clé du grand livre pour le report des intitulés (si concerné). */
  cleGrandLivre?: string;
  /** Table reconstruite par Airflow : consultable, jamais modifiable. */
  lectureSeule?: boolean;
  /** Précision affichée sous le tableau. */
  note?: string;
}

/** Table de dimension : consultable, modifiable et mise à jour par fichier. */
export interface DimensionDef extends TableReferentiel {
  fileType: FileType;
  /** Valeur attendue dans la conf « dimension » du DAG etl_dimensions_clickhouse. */
  etlType: "plan_comptes" | "code_journal" | "plan_tiers";
  table: "plan_compte" | "code_journal" | "plan_tiers";
  /** Ce qui identifie une ligne : une ligne de même clé est mise à jour. */
  cle: string;
}

export const DIMENSIONS: DimensionDef[] = [
  {
    id: FileType.PLAN_COMPTES,
    fileType: FileType.PLAN_COMPTES,
    etlType: "plan_comptes",
    table: "plan_compte",
    label: "Plan comptable",
    cle: "numéro de compte",
    cleGrandLivre: "compte",
    colonnes: [
      { nom: "compte", libelle: "Compte", cle: true, libelleDe: "intitule_compte" },
      {
        nom: "intitule_compte",
        libelle: "Intitulé",
        editable: true,
        requis: true,
        grandLivre: "intitule_compte",
        saisie: "intituleCompte",
      },
      { nom: "nature_compte", libelle: "Nature", editable: true, categorie: true },
    ],
  },
  {
    id: FileType.PLAN_TIERS,
    fileType: FileType.PLAN_TIERS,
    etlType: "plan_tiers",
    table: "plan_tiers",
    label: "Plan tiers",
    cle: "numéro de tiers",
    cleGrandLivre: "n_tiers",
    colonnes: [
      { nom: "compte_tiers", libelle: "N° tiers", cle: true, libelleDe: "intitule_tiers" },
      {
        nom: "intitule_tiers",
        libelle: "Intitulé",
        editable: true,
        requis: true,
        grandLivre: "intitule_tiers",
        saisie: "intituleTiers",
      },
      {
        nom: "type",
        libelle: "Type",
        editable: true,
        categorie: true,
        grandLivre: "type_tiers",
        saisie: "typeTiers",
      },
    ],
  },
  {
    id: FileType.CODE_JOURNAL,
    fileType: FileType.CODE_JOURNAL,
    etlType: "code_journal",
    table: "code_journal",
    label: "Codes journaux",
    cle: "code journal",
    // Le grand livre ne recopie pas l'intitulé du journal : rien à reporter.
    colonnes: [
      { nom: "code_journal", libelle: "Code", cle: true, libelleDe: "intitule" },
      { nom: "intitule", libelle: "Intitulé", editable: true, requis: true },
      { nom: "type", libelle: "Type", editable: true, categorie: true },
    ],
  },
];

/**
 * Mapping racine de compte → rubrique (table `ple`), pour le compte de
 * résultat (PL) et le bilan (BILAN). Airflow la vide et la reconstruit à
 * chaque import depuis sa configuration : une correction faite ici serait
 * perdue, elle est donc en lecture seule.
 */
export const MAPPING: TableReferentiel = {
  id: "MAPPING",
  table: "ple",
  label: "Mapping",
  lectureSeule: true,
  note:
    "Table reconstruite à chaque import à partir du mapping SYSCOHADA d'Airflow : " +
    "consultable uniquement. Une racine de compte est rattachée à la rubrique la plus " +
    "précise (longueur de racine la plus grande).",
  colonnes: [
    { nom: "racine", libelle: "Racine", cle: true },
    { nom: "rubrique", libelle: "Rubrique" },
    { nom: "type_rubrique", libelle: "Type", cle: true },
    { nom: "nb_racine", libelle: "Longueur racine", cle: true },
    { nom: "solde_filter", libelle: "Sens du solde", cle: true },
    { nom: "exclusions", libelle: "Exclusions" },
  ],
};

/** Ordre des sous-onglets de la Comptabilité. */
export const REFERENTIELS: TableReferentiel[] = [
  DIMENSIONS[0], // Plan comptable
  MAPPING,
  DIMENSIONS[1], // Plan tiers
  DIMENSIONS[2], // Codes journaux
];

export function dimensionParType(fileType: string): DimensionDef | undefined {
  return DIMENSIONS.find((d) => d.fileType === fileType);
}

export function referentielParId(id: string): TableReferentiel | undefined {
  return REFERENTIELS.find((r) => r.id === id);
}

export function estDimension(r: TableReferentiel): r is DimensionDef {
  return "fileType" in r;
}

/** Colonne clé principale d'un référentiel. */
export function colonneCle(d: TableReferentiel): ColonneDimension {
  return d.colonnes.find((c) => c.cle) ?? d.colonnes[0];
}

/** Identifiant unique d'une ligne : toutes les colonnes clés réunies. */
export function identifiantLigne(d: TableReferentiel, ligne: Record<string, unknown>): string {
  return d.colonnes
    .filter((c) => c.cle)
    .map((c) => String(ligne[c.nom] ?? ""))
    .join("|");
}
