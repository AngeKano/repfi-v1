/**
 * Dossiers (clients) attribués à un membre.
 *
 * Les rôles qui voient tous les dossiers (administrateurs) y ont accès d'office :
 * ils n'ont pas d'attribution. Les autres (LOADER, LOADER_PLUS, VIEWER) ne voient
 * que les dossiers qui leur sont attribués, aucun par défaut.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CLIENTS_ACTIONS } from "./actions";
import { hasPermission } from "./matrix";
import { getMappedRole } from "./middleware";

/** Le rôle voit tous les dossiers de l'entreprise, sans attribution. */
export function voitTousLesDossiers(role: string): boolean {
  return hasPermission(getMappedRole(role), CLIENTS_ACTIONS.VOIR_TOUS);
}

/**
 * Valide les dossiers à attribuer à un membre de ce rôle : droit d'assigner et
 * dossiers de l'entreprise. Un rôle qui voit tous les dossiers n'en reçoit aucun.
 * @returns les identifiants retenus, ou la réponse d'erreur à renvoyer
 */
export async function dossiersAAttribuer(
  clientIds: string[],
  roleMembre: string,
  acteur: { role: string; companyId: string },
): Promise<string[] | NextResponse> {
  if (voitTousLesDossiers(roleMembre)) return [];
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return [];

  if (!hasPermission(getMappedRole(acteur.role), CLIENTS_ACTIONS.ASSIGNER_MEMBRE)) {
    return NextResponse.json(
      { error: "Permission refusée : attribuer des dossiers à un membre" },
      { status: 403 },
    );
  }
  const trouves = await prisma.client.count({
    where: { id: { in: ids }, companyId: acteur.companyId },
  });
  if (trouves !== ids.length) {
    return NextResponse.json({ error: "Certains dossiers sont invalides" }, { status: 400 });
  }
  return ids;
}
