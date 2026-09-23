// ============================================================================
// Périmètre des CRÉANCES À RECOUVRER — utilisé par toute la page Recouvrement
// (créances clients TTC, encaissements, taux de recouvrement, Top 10 créances)
// ainsi que par les contrôles QC correspondants.
//
// 1. Comptes clients 41*, en excluant 418* et 419*. L'exclusion porte à la fois
//    sur `compte` ET sur `n_tiers` : certains grands livres portent le code
//    418/419 côté tiers et non côté compte.
// 2. Compte 4495 — État, subventions à recevoir. Ce sont des créances à
//    recouvrer au même titre que les créances clients.
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
