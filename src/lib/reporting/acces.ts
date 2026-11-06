// ============================================================================
// Accès d'un membre au reporting d'un dossier, côté serveur : point de passage
// commun des API de reporting et de la page du dossier.
//   1. matrice des droits : le rôle doit pouvoir voir le reporting ;
//   2. rôle sans accès à tous les dossiers : le membre doit y être assigné ;
//   3. éléments masqués à ce membre sur ce dossier (onglet Membres).
// ============================================================================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CLIENTS_ACTIONS, REPORTING_ACTIONS } from "@/lib/permissions/actions";
import { hasPermission } from "@/lib/permissions/matrix";
import { getMappedRole } from "@/lib/permissions/middleware";
import { RoleId } from "@/lib/permissions/roles";

/**
 * Éléments masqués à un membre sur un dossier (aucun par défaut). L'Administrateur
 * Principal voit tout : personne ne pourrait lever une restriction héritée d'un
 * ancien rôle.
 */
export async function elementsMasques(
  clientId: string,
  user: { id: string; role: string },
): Promise<string[]> {
  if (getMappedRole(user.role) === RoleId.ADMIN_ROOT) return [];
  const acces = await prisma.memberReportingAccess.findUnique({
    where: { clientId_userId: { clientId, userId: user.id } },
    select: { hiddenElements: true },
  });
  return acces?.hiddenElements ?? [];
}

/**
 * Vérifie l'accès au reporting du dossier. L'appartenance du dossier à
 * l'entreprise reste contrôlée par chaque route.
 * @returns les éléments masqués, ou la réponse d'erreur à renvoyer
 */
export async function accesReporting(
  clientId: string,
  user: { id: string; role: string },
): Promise<{ masques: Set<string> } | NextResponse> {
  const role = getMappedRole(user.role);
  if (!hasPermission(role, REPORTING_ACTIONS.VOIR)) {
    return NextResponse.json(
      { error: "Permission refusée : votre rôle n'a pas accès au reporting" },
      { status: 403 },
    );
  }
  if (!hasPermission(role, CLIENTS_ACTIONS.VOIR_TOUS)) {
    const assignation = await prisma.clientAssignment.findFirst({
      where: { clientId, userId: user.id },
      select: { id: true },
    });
    if (!assignation) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }
  }
  return { masques: new Set(await elementsMasques(clientId, user)) };
}
