/**
 * Middleware et utilitaires pour la vérification des permissions
 * Fournit des fonctions pour vérifier les permissions dans les API routes
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { RoleIdType, RoleId } from "./roles";
import { prisma } from "@/lib/prisma";
import { PermissionAction, ACTION_LABELS, CLIENTS_ACTIONS } from "./actions";
import { hasPermission } from "./matrix";

/**
 * Interface pour l'utilisateur de session avec le nouveau système de rôles
 */
export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  companyId: string;
  companyName?: string;
  companyPackType?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Résultat d'une vérification de permission
 */
export interface PermissionCheckResult {
  allowed: boolean;
  user?: SessionUser;
  error?: string;
  statusCode?: number;
}

/**
 * Erreur de permission personnalisée
 */
export class PermissionError extends Error {
  public statusCode: number;
  public action?: PermissionAction;

  constructor(message: string, statusCode: number = 403, action?: PermissionAction) {
    super(message);
    this.name = "PermissionError";
    this.statusCode = statusCode;
    this.action = action;
  }
}

/**
 * Mappe les anciens rôles vers les nouveaux
 * Permet la compatibilité avec le système existant
 */
function mapLegacyRole(legacyRole: string): RoleIdType {
  const roleMapping: Record<string, RoleIdType> = {
    ADMIN_ROOT: RoleId.ADMIN_ROOT,
    ADMIN: RoleId.ADMIN_CF,
    USER: RoleId.LOADER,
  };

  // Si c'est déjà un nouveau rôle, le retourner directement
  if (Object.values(RoleId).includes(legacyRole as RoleIdType)) {
    return legacyRole as RoleIdType;
  }

  // Sinon, mapper depuis l'ancien système
  return roleMapping[legacyRole] || RoleId.VIEWER;
}

/**
 * Vérifie si l'utilisateur actuel a la permission pour une action
 * Retourne un objet avec le résultat et les détails
 */
export async function checkPermission(
  action: PermissionAction
): Promise<PermissionCheckResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      allowed: false,
      error: "Non authentifié",
      statusCode: 401,
    };
  }

  const user = session.user as SessionUser;
  const role = mapLegacyRole(user.role);

  if (!hasPermission(role, action)) {
    const actionLabel = ACTION_LABELS[action] || action;
    return {
      allowed: false,
      user,
      error: `Permission refusée: ${actionLabel}`,
      statusCode: 403,
    };
  }

  return {
    allowed: true,
    user,
  };
}

/**
 * Middleware qui vérifie une permission et retourne une réponse d'erreur si refusé
 * Utilisable directement dans les routes API
 */
export async function requirePermission(
  action: PermissionAction
): Promise<{ user: SessionUser } | NextResponse> {
  const result = await checkPermission(action);

  if (!result.allowed) {
    return NextResponse.json(
      { error: result.error },
      { status: result.statusCode }
    );
  }

  return { user: result.user! };
}

/**
 * Un droit de la matrice ne vaut que sur les dossiers accessibles : un rôle sans
 * « Voir tous les clients » n'agit que sur ceux où il est assigné. À appeler après
 * requirePermission. L'appartenance du dossier à l'entreprise reste contrôlée par
 * chaque route.
 * @returns la réponse d'erreur à renvoyer, ou null si le dossier est accessible
 */
export async function requireClientAccess(
  clientId: string,
  user: Pick<SessionUser, "id" | "role">
): Promise<NextResponse | null> {
  if (hasPermission(mapLegacyRole(user.role), CLIENTS_ACTIONS.VOIR_TOUS)) {
    return null;
  }

  const assignation = await prisma.clientAssignment.findFirst({
    where: { clientId, userId: user.id },
    select: { id: true },
  });

  return assignation
    ? null
    : NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
}

/**
 * Pendant de requireClientAccess pour une liste qui ne désigne pas de dossier : à
 * ajouter au filtre `client` de la requête, à côté de l'entreprise, pour ne garder
 * que les dossiers accessibles.
 */
export function filtreDossiersAccessibles(
  user: Pick<SessionUser, "id" | "role">
) {
  return hasPermission(mapLegacyRole(user.role), CLIENTS_ACTIONS.VOIR_TOUS)
    ? {}
    : { assignments: { some: { userId: user.id } } };
}

/**
 * Vérifie si l'utilisateur a AU MOINS UNE des permissions spécifiées
 */
export async function requireAnyPermission(
  actions: PermissionAction[]
): Promise<{ user: SessionUser } | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401 }
    );
  }

  const user = session.user as SessionUser;
  const role = mapLegacyRole(user.role);

  const hasAnyPermission = actions.some((action) =>
    hasPermission(role, action)
  );

  if (!hasAnyPermission) {
    const actionLabels = actions.map((a) => ACTION_LABELS[a] || a).join(", ");
    return NextResponse.json(
      { error: `Permission refusée. Actions requises (au moins une): ${actionLabels}` },
      { status: 403 }
    );
  }

  return { user };
}

/**
 * Vérifie si l'utilisateur a TOUTES les permissions spécifiées
 */
export async function requireAllPermissions(
  actions: PermissionAction[]
): Promise<{ user: SessionUser } | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401 }
    );
  }

  const user = session.user as SessionUser;
  const role = mapLegacyRole(user.role);

  const missingPermissions = actions.filter(
    (action) => !hasPermission(role, action)
  );

  if (missingPermissions.length > 0) {
    const missingLabels = missingPermissions
      .map((a) => ACTION_LABELS[a] || a)
      .join(", ");
    return NextResponse.json(
      { error: `Permissions manquantes: ${missingLabels}` },
      { status: 403 }
    );
  }

  return { user };
}

/**
 * HOC (Higher-Order Function) pour wrapper une fonction de route avec vérification de permission
 * Usage: export const GET = withPermission(ACTIONS.VOIR_CLIENTS, handler)
 */
export function withPermission<T>(
  action: PermissionAction,
  handler: (request: Request, user: SessionUser, ...args: unknown[]) => Promise<T>
) {
  return async (request: Request, ...args: unknown[]): Promise<T | NextResponse> => {
    const result = await requirePermission(action);

    if (result instanceof NextResponse) {
      return result;
    }

    return handler(request, result.user, ...args);
  };
}

/**
 * Vérifie une permission de manière synchrone (si le rôle est déjà connu)
 * Utile pour les vérifications côté client ou dans les composants
 */
export function checkPermissionSync(
  role: string,
  action: PermissionAction
): boolean {
  const mappedRole = mapLegacyRole(role);
  return hasPermission(mappedRole, action);
}

/**
 * Récupère le rôle mappé depuis une session
 */
export function getMappedRole(sessionRole: string): RoleIdType {
  return mapLegacyRole(sessionRole);
}

/**
 * Crée une réponse d'erreur de permission formatée
 */
export function createPermissionErrorResponse(
  action: PermissionAction,
  customMessage?: string
): NextResponse {
  const actionLabel = ACTION_LABELS[action] || action;
  const message = customMessage || `Permission refusée: ${actionLabel}`;

  return NextResponse.json(
    { error: message },
    { status: 403 }
  );
}

/**
 * Crée une réponse d'erreur d'authentification formatée
 */
export function createAuthErrorResponse(
  customMessage?: string
): NextResponse {
  return NextResponse.json(
    { error: customMessage || "Non authentifié" },
    { status: 401 }
  );
}
