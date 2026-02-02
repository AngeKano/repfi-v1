/**
 * Utilitaires pour l'affichage des roles dans le frontend
 * Centralise les fonctions de formatage des roles
 */

import { ROLES, RoleIdType } from "./roles";

// Mapping des variantes de badge par role
export const ROLE_BADGE_VARIANTS: Record<string, string> = {
  ADMIN_ROOT: "destructive",
  ADMIN_CF: "default",
  ADMIN_PARTENAIRE: "default",
  LOADER_PLUS: "secondary",
  LOADER: "secondary",
  VIEWER: "outline",
  // Support des anciens roles
  ADMIN: "default",
  USER: "secondary",
};

/**
 * Obtenir le label lisible d'un role
 */
export function getRoleLabel(role: string): string {
  // Supporter les anciens roles (mapping)
  if (role === "ADMIN") return ROLES.ADMIN_CF?.title || "Administrateur";
  if (role === "USER") return ROLES.LOADER?.title || "Utilisateur";
  return ROLES[role as RoleIdType]?.title || role;
}

/**
 * Obtenir la variante du badge pour un role
 */
export function getRoleBadgeVariant(role: string): string {
  return ROLE_BADGE_VARIANTS[role] || "secondary";
}

/**
 * Obtenir la description d'un role
 */
export function getRoleDescription(role: string): string {
  // Supporter les anciens roles
  if (role === "ADMIN") return ROLES.ADMIN_CF?.description || "";
  if (role === "USER") return ROLES.LOADER?.description || "";
  return ROLES[role as RoleIdType]?.description || "";
}

/**
 * Verifier si un role est un role administrateur
 */
export function isAdminRole(role: string): boolean {
  return ["ADMIN_ROOT", "ADMIN_CF", "ADMIN_PARTENAIRE", "ADMIN"].includes(role);
}
