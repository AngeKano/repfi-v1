/**
 * Utilitaires de permissions côté client
 * Pour vérifier les permissions dans les composants React
 */

"use client";

import { useSession } from "next-auth/react";
import { RoleId, RoleIdType } from "./roles";
import { PermissionAction } from "./actions";
import { hasPermission } from "./matrix";

/**
 * Mappe les anciens rôles vers les nouveaux (version client)
 */
function mapLegacyRole(legacyRole: string): RoleIdType {
  const roleMapping: Record<string, RoleIdType> = {
    ADMIN_ROOT: RoleId.ADMIN_ROOT,
    ADMIN: RoleId.ADMIN_CF,
    USER: RoleId.LOADER,
  };

  if (Object.values(RoleId).includes(legacyRole as RoleIdType)) {
    return legacyRole as RoleIdType;
  }

  return roleMapping[legacyRole] || RoleId.VIEWER;
}

/**
 * Hook pour vérifier une permission
 * @param action - L'action à vérifier
 * @returns boolean - true si l'utilisateur a la permission
 */
export function usePermission(action: PermissionAction): boolean {
  const { data: session } = useSession();

  if (!session?.user?.role) {
    return false;
  }

  const role = mapLegacyRole(session.user.role);
  return hasPermission(role, action);
}

/**
 * Hook pour vérifier plusieurs permissions (toutes requises)
 * @param actions - Les actions à vérifier
 * @returns boolean - true si l'utilisateur a toutes les permissions
 */
export function useAllPermissions(actions: PermissionAction[]): boolean {
  const { data: session } = useSession();

  if (!session?.user?.role) {
    return false;
  }

  const role = mapLegacyRole(session.user.role);
  return actions.every((action) => hasPermission(role, action));
}

/**
 * Hook pour vérifier plusieurs permissions (au moins une requise)
 * @param actions - Les actions à vérifier
 * @returns boolean - true si l'utilisateur a au moins une permission
 */
export function useAnyPermission(actions: PermissionAction[]): boolean {
  const { data: session } = useSession();

  if (!session?.user?.role) {
    return false;
  }

  const role = mapLegacyRole(session.user.role);
  return actions.some((action) => hasPermission(role, action));
}

/**
 * Hook pour récupérer le rôle mappé de l'utilisateur
 * @returns RoleIdType | null - Le rôle mappé ou null si non connecté
 */
export function useUserRole(): RoleIdType | null {
  const { data: session } = useSession();

  if (!session?.user?.role) {
    return null;
  }

  return mapLegacyRole(session.user.role);
}

/**
 * Composant wrapper pour afficher conditionnellement du contenu basé sur les permissions
 */
export interface PermissionGateProps {
  action: PermissionAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({
  action,
  children,
  fallback = null,
}: PermissionGateProps): React.ReactNode {
  const hasAccess = usePermission(action);
  return hasAccess ? children : fallback;
}

/**
 * Composant wrapper pour afficher conditionnellement du contenu basé sur plusieurs permissions
 */
export interface MultiPermissionGateProps {
  actions: PermissionAction[];
  mode: "all" | "any";
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function MultiPermissionGate({
  actions,
  mode,
  children,
  fallback = null,
}: MultiPermissionGateProps): React.ReactNode {
  const hasAllAccess = useAllPermissions(actions);
  const hasAnyAccess = useAnyPermission(actions);

  const hasAccess = mode === "all" ? hasAllAccess : hasAnyAccess;
  return hasAccess ? children : fallback;
}
