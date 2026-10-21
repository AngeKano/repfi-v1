// ============================================================================
// Créances clients et dettes fournisseurs — définitions uniques, utilisées par
// le Recouvrement Clients, le Règlement Fournisseurs, la Synthèse et les
// contrôles QC. Une évolution se fait ici et nulle part ailleurs.
//
// Les mouvements sont séparés selon le TYPE du journal (voir
// journauxTresorerie) :
//   - hors journaux de trésorerie → ce qui NAÎT : créance, dette ;
//   - journaux de trésorerie      → ce qui se RÈGLE : encaissement,
//                                    décaissement.
// Dans les deux cas on retient le SOLDE des comptes (et non la seule somme
// des débits ou des crédits) : un avoir vient en déduction d'une créance, un
// remboursement en déduction d'un encaissement.
//
// Toute requête qui utilise ces fragments doit fournir les paramètres :
//   {journauxTresorerie:Array(String)}  — codes des journaux de trésorerie.
// ============================================================================

/** La ligne appartient à un journal de trésorerie. */
export const JOURNAL_TRESORERIE_SQL =
  "trim(code_journal) IN ({journauxTresorerie:Array(String)})";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/**
 * Périmètre des créances clients : rubrique BI (Clients) hors comptes 418* et
 * 419*. L'exclusion porte à la fois sur `compte` ET sur `n_tiers` : certains
 * grands livres portent le code 418/419 côté tiers et non côté compte.
 * Le compte 4495 (subventions à recevoir) est une créance : il est traité
 * exactement comme les autres.
 */
export function perimetreCreancesSql(refExpr: string): string {
  return (
    `((${refExpr} = 'BI' ` +
    "AND NOT startsWith(compte, '418') " +
    "AND NOT startsWith(compte, '419') " +
    "AND NOT startsWith(n_tiers, '418') " +
    "AND NOT startsWith(n_tiers, '419')) " +
    "OR startsWith(compte, '4495'))"
  );
}

/** Créances Clients TTC : solde (débit − crédit), hors journaux de trésorerie. */
export function creancesTTCSql(refExpr: string): string {
  return `sumIf(debit - credit, ${perimetreCreancesSql(refExpr)} AND NOT (${JOURNAL_TRESORERIE_SQL}))`;
}

/** Encaissements Clients TTC : solde (crédit − débit), journaux de trésorerie uniquement. */
export function encaissementsTTCSql(refExpr: string): string {
  return `sumIf(credit - debit, ${perimetreCreancesSql(refExpr)} AND (${JOURNAL_TRESORERIE_SQL}))`;
}

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

/**
 * Périmètre des dettes fournisseurs : rubrique DJ hors comptes 408*
 * (factures non parvenues) et 409* (fournisseurs débiteurs, avances).
 */
export function perimetreDettesFournisseursSql(refExpr: string): string {
  return (
    `(${refExpr} = 'DJ' ` +
    "AND NOT startsWith(compte, '408') " +
    "AND NOT startsWith(compte, '409'))"
  );
}

/** Dettes Fournisseurs TTC : solde (crédit − débit), hors journaux de trésorerie. */
export function dettesFournisseursTTCSql(refExpr: string): string {
  return `sumIf(credit - debit, ${perimetreDettesFournisseursSql(refExpr)} AND NOT (${JOURNAL_TRESORERIE_SQL}))`;
}

/** Décaissements Fournisseurs TTC : solde (débit − crédit), journaux de trésorerie uniquement. */
export function decaissementsFournisseursTTCSql(refExpr: string): string {
  return `sumIf(debit - credit, ${perimetreDettesFournisseursSql(refExpr)} AND (${JOURNAL_TRESORERIE_SQL}))`;
}

// ---------------------------------------------------------------------------
// Classement au Bilan.
//
// L'ETL range aujourd'hui tous les comptes 44x sous le même code (dettes
// fiscales et sociales, côté Passif). Le 4495 étant une créance, on le
// reclasse en BJ « Autres créances » à la lecture, afin que le Bilan, les
// États Financiers et le Recouvrement racontent la même chose.
//
// À terme, ce reclassement a vocation à être porté par le mapping Airflow ;
// cette expression pourra alors être retirée sans changer les chiffres.
// ---------------------------------------------------------------------------
export function bilanRefSql(refExpr: string): string {
  return `if(startsWith(compte, '4495'), 'BJ', ${refExpr})`;
}

// Une ligne entre au Bilan si l'ETL lui a donné un code, ou s'il s'agit d'un
// 4495 (que l'on reclasse nous-mêmes).
export function bilanIncludeSql(refExpr: string): string {
  return `(${refExpr} != '' OR startsWith(compte, '4495'))`;
}
