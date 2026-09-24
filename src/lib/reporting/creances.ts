// ============================================================================
// Périmètre des CRÉANCES — utilisé par toute la page Recouvrement (créances
// TTC, encaissements, taux de recouvrement, Top 10) et par les contrôles QC.
//
// 1. Comptes clients 41*, en excluant 418* et 419*. L'exclusion porte à la fois
//    sur `compte` ET sur `n_tiers` : certains grands livres portent le code
//    418/419 côté tiers et non côté compte.
// 2. Compte 4495 — subventions à recevoir. C'est une créance : elle est donc
//    traitée exactement comme les autres.
//
// Fragment SQL unique afin que toutes les requêtes restent cohérentes : une
// évolution du périmètre se fait ici et nulle part ailleurs.
// ============================================================================
export const CREANCES_CLIENTS_SQL =
  "((startsWith(compte, '41') " +
  "AND NOT startsWith(compte, '418') " +
  "AND NOT startsWith(compte, '419') " +
  "AND NOT startsWith(n_tiers, '418') " +
  "AND NOT startsWith(n_tiers, '419')) " +
  "OR startsWith(compte, '4495'))";

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
export const BILAN_REF_SQL = "if(startsWith(compte, '4495'), 'BJ', bilan_rubrique)";

// Une ligne entre au Bilan si l'ETL lui a donné un code, ou s'il s'agit d'un
// 4495 (que l'on reclasse nous-mêmes).
export const BILAN_INCLUDE_SQL =
  "(bilan_rubrique != '' OR startsWith(compte, '4495'))";
