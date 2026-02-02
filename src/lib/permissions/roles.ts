/**
 * Définition des rôles et leurs métadonnées
 * Système de permissions granulaire pour REPFI
 */

export const RoleId = {
  ADMIN_ROOT: "ADMIN_ROOT",
  ADMIN_CF: "ADMIN_CF",
  ADMIN_PARTENAIRE: "ADMIN_PARTENAIRE",
  LOADER: "LOADER",
  LOADER_PLUS: "LOADER_PLUS",
  VIEWER: "VIEWER",
} as const;

export type RoleIdType = (typeof RoleId)[keyof typeof RoleId];

export interface RoleDefinition {
  id: RoleIdType;
  title: string;
  description: string;
  level: number; // Niveau hiérarchique (plus bas = plus de privilèges)
}

export const ROLES: Record<RoleIdType, RoleDefinition> = {
  [RoleId.ADMIN_ROOT]: {
    id: RoleId.ADMIN_ROOT,
    title: "Administrateur Principal",
    description: "C'est le compte qui crée l'entreprise au tout début",
    level: 0,
  },
  [RoleId.ADMIN_CF]: {
    id: RoleId.ADMIN_CF,
    title: "Administrateur Comptable",
    description:
      "Administrateur responsable de la gestion comptable de l'entreprise",
    level: 1,
  },
  [RoleId.ADMIN_PARTENAIRE]: {
    id: RoleId.ADMIN_PARTENAIRE,
    title: "Administrateur Partenaire",
    description:
      "Administrateur partenaire responsable de la comptabilité d'une entité partenaire",
    level: 2,
  },
  [RoleId.LOADER]: {
    id: RoleId.LOADER,
    title: "Stagiaire Assistant Comptable",
    description:
      "Compte dédié aux stagiaires assistants comptables avec accès limité",
    level: 4,
  },
  [RoleId.LOADER_PLUS]: {
    id: RoleId.LOADER_PLUS,
    title: "Assistant Comptable",
    description:
      "Assistant comptable disposant de droits intermédiaires pour le traitement comptable",
    level: 3,
  },
  [RoleId.VIEWER]: {
    id: RoleId.VIEWER,
    title: "Visiteur",
    description: "C'est le compte qui peut voir les clients et les membres",
    level: 5,
  },
};

/**
 * Vérifie si un rôle a un niveau hiérarchique supérieur ou égal à un autre
 */
export function hasHigherOrEqualLevel(
  userRole: RoleIdType,
  targetRole: RoleIdType
): boolean {
  return ROLES[userRole].level <= ROLES[targetRole].level;
}

/**
 * Récupère la définition d'un rôle
 */
export function getRoleDefinition(roleId: RoleIdType): RoleDefinition {
  return ROLES[roleId];
}

/**
 * Liste tous les rôles disponibles
 */
export function getAllRoles(): RoleDefinition[] {
  return Object.values(ROLES);
}

/**
 * Vérifie si un rôle peut gérer un autre rôle
 * Un rôle peut gérer les rôles de niveau inférieur (niveau numérique plus élevé)
 */
export function canManageRole(
  managerRole: RoleIdType,
  targetRole: RoleIdType
): boolean {
  return ROLES[managerRole].level < ROLES[targetRole].level;
}
