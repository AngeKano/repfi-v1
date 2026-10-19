// ============================================================================
// Référentiels du client : plan comptable, mapping des rubriques (PLE), plan
// tiers et codes journaux. Partagé entre l'API (dépôt, suivi, consultation,
// modification) et l'interface.
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

/** Colonne d'une table de référentiel. */
export interface ColonneDimension {
  /** Nom de la colonne (nom de référence, celui du schéma Airflow). */
  nom: string;
  /**
   * Autres noms possibles de la colonne : le schéma des référentiels varie
   * selon les installations (même logique que planTiersList). Le nom réel est
   * détecté à l'exécution.
   */
  alias?: string[];
  libelle: string;
  /**
   * Fait partie de la clé de la table : affichée mais jamais modifiable. La
   * première colonne clé sert de libellé d'identifiant et de tri par défaut.
   */
  cle?: boolean;
  /** Modifiable depuis l'interface. */
  editable?: boolean;
  /** Valeur obligatoire à l'édition. */
  requis?: boolean;
  /** Valeur prise dans une liste (type, nature, rubrique) : suggestions à l'édition. */
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

  // ---- Règles de saisie d'une nouvelle ligne ----
  /** Seules ces valeurs sont acceptées (liste déroulante). */
  choix?: string[];
  /** Nombre entier (ex. longueur de racine). */
  entier?: boolean;
  /** Colonne clé qui peut rester vide (ex. sens du solde du mapping). */
  vide?: boolean;
  /** Valeur par défaut : longueur de la valeur de cette autre colonne. */
  defautLongueurDe?: string;
  /** Valeur mise en majuscules (codes de rubrique : « TC », jamais « tc »). */
  majuscules?: boolean;
}

/** Référentiel : consultable, filtrable, modifiable et mis à jour par fichier. */
export interface DimensionDef {
  /** Identifiant d'URL (égal au fileType). */
  id: string;
  fileType: FileType;
  /** Valeur attendue dans la conf « dimension » du DAG etl_dimensions_clickhouse. */
  etlType: "plan_comptes" | "code_journal" | "plan_tiers" | "ple";
  /** Table ClickHouse. */
  table: "plan_compte" | "code_journal" | "plan_tiers" | "ple";
  label: string;
  /** Ce qui identifie une ligne : une ligne de même clé est mise à jour. */
  cle: string;
  /** Colonnes dans l'ordre d'affichage, clé principale en premier. */
  colonnes: ColonneDimension[];
  /** Colonne clé du grand livre pour le report des intitulés (si concerné). */
  cleGrandLivre?: string;
  /**
   * Une modification change le classement des écritures déjà chargées : le
   * grand livre doit être reclassé par Airflow pour qu'elle s'y applique.
   */
  reclassement?: boolean;
  /** Colonnes attendues dans un fichier de mise à jour (format défini ici). */
  colonnesFichier?: string[];
  /** Précision affichée sous le tableau. */
  note?: string;
}

/** Alias conservé pour la consultation (tous les référentiels sont des dimensions). */
export type TableReferentiel = DimensionDef;

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
      {
        nom: "compte",
        alias: ["numero_compte", "n_compte"],
        libelle: "Compte",
        cle: true,
        libelleDe: "intitule_compte",
      },
      {
        nom: "intitule_compte",
        alias: ["intitule", "libelle", "libelle_compte"],
        libelle: "Intitulé",
        editable: true,
        requis: true,
        grandLivre: "intitule_compte",
        saisie: "intituleCompte",
      },
      {
        nom: "nature_compte",
        alias: ["nature", "type_compte"],
        libelle: "Nature",
        editable: true,
        categorie: true,
      },
    ],
  },
  {
    // Mapping racine de compte → rubrique, pour le compte de résultat (PL) et
    // le bilan (BILAN). Référentiel à part entière : il n'est plus reconstruit
    // par Airflow à chaque import, il évolue par fichier ou ligne à ligne.
    id: FileType.PLE,
    fileType: FileType.PLE,
    etlType: "ple",
    table: "ple",
    label: "Mapping",
    cle: "racine, type, longueur de racine et sens du solde",
    reclassement: true,
    colonnesFichier: [
      "racine",
      "rubrique",
      "nb_racine",
      "type_rubrique",
      "solde_filter",
      "exclusions",
    ],
    note:
      "Une racine de compte est rattachée à la rubrique de la racine la plus longue qui " +
      "lui correspond. Après une modification, réappliquez le mapping pour reclasser les " +
      "écritures déjà chargées.",
    colonnes: [
      { nom: "racine", libelle: "Racine", cle: true },
      {
        nom: "rubrique",
        libelle: "Rubrique",
        editable: true,
        requis: true,
        categorie: true,
        majuscules: true,
      },
      { nom: "type_rubrique", libelle: "Type", cle: true, choix: ["PL", "BILAN"] },
      {
        nom: "nb_racine",
        libelle: "Longueur racine",
        cle: true,
        entier: true,
        defautLongueurDe: "racine",
      },
      {
        nom: "solde_filter",
        libelle: "Sens du solde",
        cle: true,
        vide: true,
        choix: ["", "debit", "credit"],
      },
      { nom: "exclusions", libelle: "Exclusions", editable: true },
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
      {
        nom: "compte_tiers",
        alias: ["n_tiers", "numero_tiers", "compte"],
        libelle: "N° tiers",
        cle: true,
        libelleDe: "intitule_tiers",
      },
      {
        nom: "intitule_tiers",
        alias: ["intitule", "libelle", "nom"],
        libelle: "Intitulé",
        editable: true,
        requis: true,
        grandLivre: "intitule_tiers",
        saisie: "intituleTiers",
      },
      {
        nom: "type",
        alias: ["type_tiers"],
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
      { nom: "code_journal", alias: ["code"], libelle: "Code", cle: true, libelleDe: "intitule" },
      {
        nom: "intitule",
        alias: ["libelle", "intitule_journal", "libelle_journal"],
        libelle: "Intitulé",
        editable: true,
        requis: true,
      },
      { nom: "type", alias: ["type_journal"], libelle: "Type", editable: true, categorie: true },
    ],
  },
];

/** Ordre des sous-onglets de la Comptabilité (identique à celui des tuiles d'Import). */
export const REFERENTIELS: DimensionDef[] = DIMENSIONS;

export function dimensionParType(fileType: string): DimensionDef | undefined {
  return DIMENSIONS.find((d) => d.fileType === fileType);
}

export function referentielParId(id: string): DimensionDef | undefined {
  return DIMENSIONS.find((r) => r.id === id);
}

/** Colonne clé principale d'un référentiel. */
export function colonneCle(d: DimensionDef): ColonneDimension {
  return d.colonnes.find((c) => c.cle) ?? d.colonnes[0];
}

/** Colonnes formant la clé (une seule, sauf pour le mapping). */
export function colonnesCles(d: DimensionDef): ColonneDimension[] {
  return d.colonnes.filter((c) => c.cle);
}

/** Identifiant unique d'une ligne : toutes les colonnes clés réunies. */
export function identifiantLigne(d: DimensionDef, ligne: Record<string, unknown>): string {
  return colonnesCles(d)
    .map((c) => String(ligne[c.nom] ?? ""))
    .join("|");
}

/**
 * Normalise et contrôle une ligne à ajouter. Partagé par le formulaire
 * (contrôle immédiat) et par l'API (contrôle qui fait foi).
 *   - champs clés obligatoires, sauf ceux qui peuvent rester vides ;
 *   - valeurs limitées à une liste quand le champ en a une (casse ignorée) ;
 *   - longueur de racine du mapping : par défaut, et obligatoirement, égale à
 *     la longueur de la racine — sinon la ligne ne serait jamais retenue au
 *     classement des comptes.
 */
export function preparerNouvelleLigne(
  def: DimensionDef,
  saisie: Record<string, string>,
): { ligne: Record<string, string> } | { erreur: string } {
  const ligne: Record<string, string> = {};
  for (const c of def.colonnes) {
    let v = (saisie[c.nom] ?? "").trim();
    if (c.majuscules) v = v.toUpperCase();

    if (c.defautLongueurDe) {
      const longueur = (saisie[c.defautLongueurDe] ?? "").trim().length;
      if (!v && longueur) v = String(longueur);
      if (v && longueur && Number(v) !== longueur)
        return { erreur: `${c.libelle} : doit être égale à la longueur de la racine (${longueur}).` };
    }
    if (c.choix) {
      const retenue = c.choix.find((x) => x.toLowerCase() === v.toLowerCase());
      if (retenue === undefined)
        return {
          erreur: `${c.libelle} : valeur attendue parmi ${c.choix.map((x) => x || "(vide)").join(", ")}.`,
        };
      v = retenue;
    }
    if (c.entier && v && !/^\d{1,2}$/.test(v))
      return { erreur: `${c.libelle} : nombre entier attendu.` };
    if (((c.cle && !c.vide) || c.requis) && !v) return { erreur: `${c.libelle} obligatoire.` };
    if (v.length > 255) return { erreur: `${c.libelle} : 255 caractères maximum.` };

    ligne[c.nom] = v;
  }
  return { ligne };
}
