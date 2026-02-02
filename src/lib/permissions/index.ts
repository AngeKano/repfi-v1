/**
 * Point d'entrée du système de permissions REPFI
 * Exporte toutes les fonctionnalités de permissions
 */

// Rôles
export {
  RoleId,
  ROLES,
  hasHigherOrEqualLevel,
  getRoleDefinition,
  getAllRoles,
  canManageRole,
} from "./roles";
export type { RoleIdType, RoleDefinition } from "./roles";

// Actions
export {
  ACTIONS,
  ALL_ACTIONS,
  ACTION_CATEGORIES,
  ACTION_LABELS,
  ENTREPRISE_ACTIONS,
  ABONNEMENT_ACTIONS,
  MEMBRES_ACTIONS,
  CLIENTS_ACTIONS,
  FICHIERS_ACTIONS,
  REPORTING_ACTIONS,
} from "./actions";
export type {
  PermissionAction,
  EntrepriseAction,
  AbonnementAction,
  MembresAction,
  ClientsAction,
  FichiersAction,
  ReportingAction,
} from "./actions";

// Matrice des permissions
export {
  PERMISSION_MATRIX,
  hasPermission,
  getRolePermissions,
  getAllowedActions,
  getDeniedActions,
} from "./matrix";

// Middleware et utilitaires serveur
export {
  checkPermission,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  withPermission,
  PermissionError,
  checkPermissionSync,
  getMappedRole,
  createPermissionErrorResponse,
  createAuthErrorResponse,
} from "./middleware";
export type { PermissionCheckResult, SessionUser } from "./middleware";

// Note: Les utilitaires client sont dans ./client.ts
// Importez-les séparément avec: import { usePermission, ... } from "@/lib/permissions/client"
