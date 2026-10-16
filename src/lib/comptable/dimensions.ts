// ============================================================================
// Tables de dimension pouvant être mises à jour seules, fichier par fichier.
// Partagé entre l'API (dépôt + suivi) et l'interface d'import.
//
// Correspondance des trois vocabulaires :
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

/** Colonne d'une table de dimension, dans l'ordre de DIMENSION_CONFIG (Airflow). */
export interface ColonneDimension {
  /** Nom de la colonne ClickHouse. */
  nom: string;
  libelle: string;
  /** Clé de la table : affichée mais jamais modifiable. */
  cle?: boolean;
  /** Modifiable depuis l'interface. */
  editable?: boolean;
  /** Valeur obligatoire à l'édition. */
  requis?: boolean;
  /** Valeur courte prise dans une liste (type, nature) : suggestions + filtre. */
  categorie?: boolean;
  /**
   * Colonne du grand livre qui recopie cette valeur (dénormalisée au
   * chargement) : elle est mise à jour avec la dimension, comme le fait le
   * DAG (_GL_PROPAGATION).
   */
  grandLivre?: string;
  /** Champ équivalent des écritures saisies (ManualLedgerEntry). */
  saisie?: "intituleCompte" | "intituleTiers" | "typeTiers";
}

export interface DimensionDef {
  fileType: FileType;
  /** Valeur attendue dans la conf « dimension » du DAG etl_dimensions_clickhouse. */
  etlType: "plan_comptes" | "code_journal" | "plan_tiers";
  /** Table ClickHouse mise à jour. */
  table: "plan_compte" | "code_journal" | "plan_tiers";
  label: string;
  /** Ce qui identifie une ligne : une ligne de même clé est mise à jour. */
  cle: string;
  /** Colonnes de la table, clé en premier. */
  colonnes: ColonneDimension[];
  /** Colonne clé du grand livre pour le report des intitulés (si concerné). */
  cleGrandLivre?: string;
}

export const DIMENSIONS: DimensionDef[] = [
  {
    fileType: FileType.PLAN_COMPTES,
    etlType: "plan_comptes",
    table: "plan_compte",
    label: "Plan comptable",
    cle: "numéro de compte",
    cleGrandLivre: "compte",
    colonnes: [
      { nom: "compte", libelle: "Compte", cle: true },
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
    fileType: FileType.PLAN_TIERS,
    etlType: "plan_tiers",
    table: "plan_tiers",
    label: "Plan tiers",
    cle: "numéro de tiers",
    cleGrandLivre: "n_tiers",
    colonnes: [
      { nom: "compte_tiers", libelle: "N° tiers", cle: true },
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
    fileType: FileType.CODE_JOURNAL,
    etlType: "code_journal",
    table: "code_journal",
    label: "Codes journaux",
    cle: "code journal",
    // Le grand livre ne recopie pas l'intitulé du journal : rien à reporter.
    colonnes: [
      { nom: "code_journal", libelle: "Code", cle: true },
      { nom: "intitule", libelle: "Intitulé", editable: true, requis: true },
      { nom: "type", libelle: "Type", editable: true, categorie: true },
    ],
  },
];

export function dimensionParType(fileType: string): DimensionDef | undefined {
  return DIMENSIONS.find((d) => d.fileType === fileType);
}

/** Colonne clé d'une table de dimension. */
export function colonneCle(d: DimensionDef): ColonneDimension {
  return d.colonnes.find((c) => c.cle) ?? d.colonnes[0];
}
