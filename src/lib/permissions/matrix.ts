/**
 * Matrice des permissions par rôle
 * Définit quelles actions sont autorisées pour chaque rôle
 */

import { RoleId, RoleIdType } from "./roles";
import {
  PermissionAction,
  ENTREPRISE_ACTIONS,
  ABONNEMENT_ACTIONS,
  MEMBRES_ACTIONS,
  CLIENTS_ACTIONS,
  FICHIERS_ACTIONS,
  REPORTING_ACTIONS,
} from "./actions";

/**
 * Matrice des permissions
 * true = autorisé, false = refusé
 */
export const PERMISSION_MATRIX: Record<
  RoleIdType,
  Record<PermissionAction, boolean>
> = {
  // ============================================
  // ADMIN_ROOT - Accès complet
  // ============================================
  [RoleId.ADMIN_ROOT]: {
    // Entreprise
    [ENTREPRISE_ACTIONS.CREER_COMPTE]: true,
    [ENTREPRISE_ACTIONS.VOIR_INFOS]: true,
    [ENTREPRISE_ACTIONS.MODIFIER_INFOS]: true,

    // Abonnement
    [ABONNEMENT_ACTIONS.SOUSCRIRE_PREMIER]: true,
    [ABONNEMENT_ACTIONS.ACTIVER]: true,
    [ABONNEMENT_ACTIONS.DESACTIVER]: true,
    [ABONNEMENT_ACTIONS.MODIFIER_PACK]: true,
    [ABONNEMENT_ACTIONS.RENOUVELER]: true,

    // Membres
    [MEMBRES_ACTIONS.CREER]: true,
    [MEMBRES_ACTIONS.ACTIVER]: true,
    [MEMBRES_ACTIONS.MODIFIER]: true,
    [MEMBRES_ACTIONS.DESACTIVER]: true,
    [MEMBRES_ACTIONS.VOIR]: true,

    // Clients
    [CLIENTS_ACTIONS.CREER]: true,
    [CLIENTS_ACTIONS.MODIFIER]: true,
    [CLIENTS_ACTIONS.ACTIVER]: true,
    [CLIENTS_ACTIONS.DESACTIVER]: true,
    [CLIENTS_ACTIONS.VOIR_TOUS]: true,
    [CLIENTS_ACTIONS.ASSIGNER_MEMBRE]: true,
    [CLIENTS_ACTIONS.RETIRER_MEMBRE]: true,

    // Fichiers
    [FICHIERS_ACTIONS.CHARGER]: true,
    [FICHIERS_ACTIONS.VOIR]: true,
    [FICHIERS_ACTIONS.EXPORTER_FINAUX]: true,
    [FICHIERS_ACTIONS.SUPPRIMER]: true,
    [FICHIERS_ACTIONS.VOIR_HISTORIQUE]: true,

    // Reporting
    [REPORTING_ACTIONS.CREER]: true,
    [REPORTING_ACTIONS.VOIR]: true,
    [REPORTING_ACTIONS.FILTRER]: true,
    [REPORTING_ACTIONS.MODIFIER]: true,
    [REPORTING_ACTIONS.SUPPRIMER]: true,
    [REPORTING_ACTIONS.EXPORTER]: true,
  },

  // ============================================
  // ADMIN_CF - Administrateur Comptable
  // ============================================
  [RoleId.ADMIN_CF]: {
    // Entreprise
    [ENTREPRISE_ACTIONS.CREER_COMPTE]: false,
    [ENTREPRISE_ACTIONS.VOIR_INFOS]: true,
    [ENTREPRISE_ACTIONS.MODIFIER_INFOS]: true,

    // Abonnement
    [ABONNEMENT_ACTIONS.SOUSCRIRE_PREMIER]: false,
    [ABONNEMENT_ACTIONS.ACTIVER]: false,
    [ABONNEMENT_ACTIONS.DESACTIVER]: false,
    [ABONNEMENT_ACTIONS.MODIFIER_PACK]: false,
    [ABONNEMENT_ACTIONS.RENOUVELER]: true,

    // Membres
    [MEMBRES_ACTIONS.CREER]: true,
    [MEMBRES_ACTIONS.ACTIVER]: true,
    [MEMBRES_ACTIONS.MODIFIER]: true,
    [MEMBRES_ACTIONS.DESACTIVER]: true,
    [MEMBRES_ACTIONS.VOIR]: true,

    // Clients
    [CLIENTS_ACTIONS.CREER]: true,
    [CLIENTS_ACTIONS.MODIFIER]: true,
    [CLIENTS_ACTIONS.ACTIVER]: true,
    [CLIENTS_ACTIONS.DESACTIVER]: true,
    [CLIENTS_ACTIONS.VOIR_TOUS]: true,
    [CLIENTS_ACTIONS.ASSIGNER_MEMBRE]: true,
    [CLIENTS_ACTIONS.RETIRER_MEMBRE]: true,

    // Fichiers
    [FICHIERS_ACTIONS.CHARGER]: false,
    [FICHIERS_ACTIONS.VOIR]: true,
    [FICHIERS_ACTIONS.EXPORTER_FINAUX]: true,
    [FICHIERS_ACTIONS.SUPPRIMER]: true,
    [FICHIERS_ACTIONS.VOIR_HISTORIQUE]: true,

    // Reporting
    [REPORTING_ACTIONS.CREER]: false,
    [REPORTING_ACTIONS.VOIR]: true,
    [REPORTING_ACTIONS.FILTRER]: true,
    [REPORTING_ACTIONS.MODIFIER]: false,
    [REPORTING_ACTIONS.SUPPRIMER]: false,
    [REPORTING_ACTIONS.EXPORTER]: false,
  },

  // ============================================
  // ADMIN_PARTENAIRE - Administrateur Partenaire
  // ============================================
  [RoleId.ADMIN_PARTENAIRE]: {
    // Entreprise
    [ENTREPRISE_ACTIONS.CREER_COMPTE]: false,
    [ENTREPRISE_ACTIONS.VOIR_INFOS]: true,
    [ENTREPRISE_ACTIONS.MODIFIER_INFOS]: true,

    // Abonnement
    [ABONNEMENT_ACTIONS.SOUSCRIRE_PREMIER]: false,
    [ABONNEMENT_ACTIONS.ACTIVER]: false,
    [ABONNEMENT_ACTIONS.DESACTIVER]: false,
    [ABONNEMENT_ACTIONS.MODIFIER_PACK]: false,
    [ABONNEMENT_ACTIONS.RENOUVELER]: true,

    // Membres
    [MEMBRES_ACTIONS.CREER]: true,
    [MEMBRES_ACTIONS.ACTIVER]: false,
    [MEMBRES_ACTIONS.MODIFIER]: true,
    [MEMBRES_ACTIONS.DESACTIVER]: true,
    [MEMBRES_ACTIONS.VOIR]: true,

    // Clients
    [CLIENTS_ACTIONS.CREER]: false,
    [CLIENTS_ACTIONS.MODIFIER]: false,
    [CLIENTS_ACTIONS.ACTIVER]: false,
    [CLIENTS_ACTIONS.DESACTIVER]: false,
    [CLIENTS_ACTIONS.VOIR_TOUS]: true,
    [CLIENTS_ACTIONS.ASSIGNER_MEMBRE]: true,
    [CLIENTS_ACTIONS.RETIRER_MEMBRE]: true,

    // Fichiers
    [FICHIERS_ACTIONS.CHARGER]: false,
    [FICHIERS_ACTIONS.VOIR]: true,
    [FICHIERS_ACTIONS.EXPORTER_FINAUX]: true,
    [FICHIERS_ACTIONS.SUPPRIMER]: true,
    [FICHIERS_ACTIONS.VOIR_HISTORIQUE]: true,

    // Reporting
    [REPORTING_ACTIONS.CREER]: false,
    [REPORTING_ACTIONS.VOIR]: true,
    [REPORTING_ACTIONS.FILTRER]: true,
    [REPORTING_ACTIONS.MODIFIER]: false,
    [REPORTING_ACTIONS.SUPPRIMER]: false,
    [REPORTING_ACTIONS.EXPORTER]: true,
  },

  // ============================================
  // LOADER - Stagiaire Assistant Comptable
  // ============================================
  [RoleId.LOADER]: {
    // Entreprise
    [ENTREPRISE_ACTIONS.CREER_COMPTE]: false,
    [ENTREPRISE_ACTIONS.VOIR_INFOS]: true,
    [ENTREPRISE_ACTIONS.MODIFIER_INFOS]: false,

    // Abonnement
    [ABONNEMENT_ACTIONS.SOUSCRIRE_PREMIER]: false,
    [ABONNEMENT_ACTIONS.ACTIVER]: false,
    [ABONNEMENT_ACTIONS.DESACTIVER]: false,
    [ABONNEMENT_ACTIONS.MODIFIER_PACK]: false,
    [ABONNEMENT_ACTIONS.RENOUVELER]: false,

    // Membres
    [MEMBRES_ACTIONS.CREER]: false,
    [MEMBRES_ACTIONS.ACTIVER]: false,
    [MEMBRES_ACTIONS.MODIFIER]: false,
    [MEMBRES_ACTIONS.DESACTIVER]: false,
    [MEMBRES_ACTIONS.VOIR]: false,

    // Clients
    [CLIENTS_ACTIONS.CREER]: false,
    [CLIENTS_ACTIONS.MODIFIER]: false,
    [CLIENTS_ACTIONS.ACTIVER]: false,
    [CLIENTS_ACTIONS.DESACTIVER]: false,
    [CLIENTS_ACTIONS.VOIR_TOUS]: false,
    [CLIENTS_ACTIONS.ASSIGNER_MEMBRE]: false,
    [CLIENTS_ACTIONS.RETIRER_MEMBRE]: false,

    // Fichiers
    [FICHIERS_ACTIONS.CHARGER]: true,
    [FICHIERS_ACTIONS.VOIR]: true,
    [FICHIERS_ACTIONS.EXPORTER_FINAUX]: true,
    [FICHIERS_ACTIONS.SUPPRIMER]: true,
    [FICHIERS_ACTIONS.VOIR_HISTORIQUE]: true,

    // Reporting
    [REPORTING_ACTIONS.CREER]: false,
    [REPORTING_ACTIONS.VOIR]: false,
    [REPORTING_ACTIONS.FILTRER]: false,
    [REPORTING_ACTIONS.MODIFIER]: false,
    [REPORTING_ACTIONS.SUPPRIMER]: false,
    [REPORTING_ACTIONS.EXPORTER]: false,
  },

  // ============================================
  // LOADER_PLUS - Assistant Comptable
  // ============================================
  [RoleId.LOADER_PLUS]: {
    // Entreprise
    [ENTREPRISE_ACTIONS.CREER_COMPTE]: false,
    [ENTREPRISE_ACTIONS.VOIR_INFOS]: true,
    [ENTREPRISE_ACTIONS.MODIFIER_INFOS]: false,

    // Abonnement
    [ABONNEMENT_ACTIONS.SOUSCRIRE_PREMIER]: false,
    [ABONNEMENT_ACTIONS.ACTIVER]: false,
    [ABONNEMENT_ACTIONS.DESACTIVER]: false,
    [ABONNEMENT_ACTIONS.MODIFIER_PACK]: false,
    [ABONNEMENT_ACTIONS.RENOUVELER]: false,

    // Membres
    [MEMBRES_ACTIONS.CREER]: false,
    [MEMBRES_ACTIONS.ACTIVER]: false,
    [MEMBRES_ACTIONS.MODIFIER]: false,
    [MEMBRES_ACTIONS.DESACTIVER]: false,
    [MEMBRES_ACTIONS.VOIR]: true,

    // Clients
    [CLIENTS_ACTIONS.CREER]: false,
    [CLIENTS_ACTIONS.MODIFIER]: false,
    [CLIENTS_ACTIONS.ACTIVER]: false,
    [CLIENTS_ACTIONS.DESACTIVER]: false,
    [CLIENTS_ACTIONS.VOIR_TOUS]: true,
    [CLIENTS_ACTIONS.ASSIGNER_MEMBRE]: false,
    [CLIENTS_ACTIONS.RETIRER_MEMBRE]: false,

    // Fichiers
    [FICHIERS_ACTIONS.CHARGER]: true,
    [FICHIERS_ACTIONS.VOIR]: true,
    [FICHIERS_ACTIONS.EXPORTER_FINAUX]: true,
    [FICHIERS_ACTIONS.SUPPRIMER]: true,
    [FICHIERS_ACTIONS.VOIR_HISTORIQUE]: true,

    // Reporting
    [REPORTING_ACTIONS.CREER]: false,
    [REPORTING_ACTIONS.VOIR]: true,
    [REPORTING_ACTIONS.FILTRER]: true,
    [REPORTING_ACTIONS.MODIFIER]: false,
    [REPORTING_ACTIONS.SUPPRIMER]: false,
    [REPORTING_ACTIONS.EXPORTER]: false,
  },

  // ============================================
  // VIEWER - Visiteur
  // ============================================
  [RoleId.VIEWER]: {
    // Entreprise
    [ENTREPRISE_ACTIONS.CREER_COMPTE]: false,
    [ENTREPRISE_ACTIONS.VOIR_INFOS]: true,
    [ENTREPRISE_ACTIONS.MODIFIER_INFOS]: false,

    // Abonnement
    [ABONNEMENT_ACTIONS.SOUSCRIRE_PREMIER]: false,
    [ABONNEMENT_ACTIONS.ACTIVER]: false,
    [ABONNEMENT_ACTIONS.DESACTIVER]: false,
    [ABONNEMENT_ACTIONS.MODIFIER_PACK]: false,
    [ABONNEMENT_ACTIONS.RENOUVELER]: false,

    // Membres
    [MEMBRES_ACTIONS.CREER]: false,
    [MEMBRES_ACTIONS.ACTIVER]: false,
    [MEMBRES_ACTIONS.MODIFIER]: false,
    [MEMBRES_ACTIONS.DESACTIVER]: false,
    [MEMBRES_ACTIONS.VOIR]: true,

    // Clients
    [CLIENTS_ACTIONS.CREER]: false,
    [CLIENTS_ACTIONS.MODIFIER]: false,
    [CLIENTS_ACTIONS.ACTIVER]: false,
    [CLIENTS_ACTIONS.DESACTIVER]: false,
    [CLIENTS_ACTIONS.VOIR_TOUS]: true,
    [CLIENTS_ACTIONS.ASSIGNER_MEMBRE]: false,
    [CLIENTS_ACTIONS.RETIRER_MEMBRE]: false,

    // Fichiers
    [FICHIERS_ACTIONS.CHARGER]: false,
    [FICHIERS_ACTIONS.VOIR]: false,
    [FICHIERS_ACTIONS.EXPORTER_FINAUX]: false,
    [FICHIERS_ACTIONS.SUPPRIMER]: false,
    [FICHIERS_ACTIONS.VOIR_HISTORIQUE]: false,

    // Reporting
    [REPORTING_ACTIONS.CREER]: false,
    [REPORTING_ACTIONS.VOIR]: true,
    [REPORTING_ACTIONS.FILTRER]: true,
    [REPORTING_ACTIONS.MODIFIER]: false,
    [REPORTING_ACTIONS.SUPPRIMER]: false,
    [REPORTING_ACTIONS.EXPORTER]: false,
  },
};

/**
 * Vérifie si un rôle a la permission pour une action donnée
 */
export function hasPermission(
  role: RoleIdType,
  action: PermissionAction
): boolean {
  const rolePermissions = PERMISSION_MATRIX[role];
  if (!rolePermissions) {
    return false;
  }
  return rolePermissions[action] === true;
}

/**
 * Récupère toutes les permissions d'un rôle
 */
export function getRolePermissions(
  role: RoleIdType
): Record<PermissionAction, boolean> {
  return PERMISSION_MATRIX[role];
}

/**
 * Récupère la liste des actions autorisées pour un rôle
 */
export function getAllowedActions(role: RoleIdType): PermissionAction[] {
  const permissions = PERMISSION_MATRIX[role];
  return (Object.keys(permissions) as PermissionAction[]).filter(
    (action) => permissions[action] === true
  );
}

/**
 * Récupère la liste des actions refusées pour un rôle
 */
export function getDeniedActions(role: RoleIdType): PermissionAction[] {
  const permissions = PERMISSION_MATRIX[role];
  return (Object.keys(permissions) as PermissionAction[]).filter(
    (action) => permissions[action] === false
  );
}
