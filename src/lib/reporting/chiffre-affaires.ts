// ============================================================================
// Périmètre des ANALYSES de chiffre d'affaires (CA par nature, Top 10 clients,
// CA total servant de dénominateur aux pourcentages).
//
// Il ne se confond pas avec la ligne XB du modèle officiel : celle-ci reste
// strictement TA + TB + TC + TD et ne doit pas bouger, sous peine de rendre le
// Compte de résultat non conforme. Les analyses, elles, intègrent en plus les
// subventions.
// ============================================================================
import { CA_RUBRIQUES } from "./etats-financiers";

export { CA_RUBRIQUES };

// Compte des subventions à recevoir. L'ETL ne lui attribue pas de rubrique de
// gestion : on le désigne donc par son numéro.
const COMPTE_SUBVENTIONS = "4495";

/** Lignes retenues : les quatre natures du CA + les subventions. */
export const CA_PERIMETRE_SQL =
  `(rubrique IN ({caRubriques:Array(String)}) ` +
  `OR startsWith(compte, '${COMPTE_SUBVENTIONS}'))`;

/**
 * Montant d'une ligne, dans le bon sens.
 *
 * Les comptes de produits (7x) sont créditeurs : le CA vaut `crédit − débit`.
 * Le compte 4495 est un compte d'actif, donc DÉBITEUR : appliquer la même
 * formule retrancherait la subvention du chiffre d'affaires. On inverse donc
 * le sens pour ce seul compte.
 */
export const CA_MONTANT_SQL =
  `if(startsWith(compte, '${COMPTE_SUBVENTIONS}'), debit - credit, credit - debit)`;

// ---------------------------------------------------------------------------
// Histogramme « Produits par Nature ».
//
// Il élargit le chiffre d'affaires aux SUBVENTIONS D'EXPLOITATION (rubrique
// TG), d'où son nom : ce n'est plus le seul CA. Le compte 4495 en est
// volontairement exclu — il porte la CRÉANCE de subvention, dont le produit
// correspondant est déjà en TG ; compter les deux reviendrait à doubler la
// subvention.
// ---------------------------------------------------------------------------
export const PRODUITS_RUBRIQUES = [...CA_RUBRIQUES, "TG"];

export const PRODUITS_PERIMETRE_SQL =
  "rubrique IN ({produitsRubriques:Array(String)})";
