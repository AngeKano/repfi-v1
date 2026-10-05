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
