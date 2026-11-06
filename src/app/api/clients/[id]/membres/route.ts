// app/api/clients/[id]/membres/route.ts
/**
 * Onglet Membres d'un dossier : qui y accède (assigné, ou par son rôle), et ce
 * que chacun voit du reporting.
 * GET /api/clients/:id/membres
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  hasPermission,
  getMappedRole,
  canManageRole,
  CLIENTS_ACTIONS,
  MEMBRES_ACTIONS,
  REPORTING_ACTIONS,
} from "@/lib/permissions";
import { TOUS_LES_ELEMENTS } from "@/lib/reporting/elements";
import type { DonneesMembres, MembreDisponible, MembreDossier } from "@/app/clients/[id]/membres/types";

const nomDe = (u: { firstName: string | null; lastName: string | null; email: string }) =>
  u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permission = await requirePermission(MEMBRES_ACTIONS.VOIR);
    if (permission instanceof NextResponse) return permission;
    const { user } = permission;

    const { id } = await params;
    const client = await prisma.client.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    const [utilisateurs, assignations, acces] = await Promise.all([
      prisma.user.findMany({
        where: { companyId: user.companyId },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
        orderBy: [{ firstName: "asc" }, { email: "asc" }],
      }),
      prisma.clientAssignment.findMany({
        where: { clientId: id },
        select: { userId: true, assignedAt: true },
      }),
      prisma.memberReportingAccess.findMany({
        where: { clientId: id },
        select: {
          userId: true,
          hiddenElements: true,
          updatedAt: true,
          updatedBy: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    const role = getMappedRole(user.role);
    const peutGerer = hasPermission(role, REPORTING_ACTIONS.GERER_VISIBILITE);
    const assignes = new Map(assignations.map((a) => [a.userId, a.assignedAt]));
    const accesParMembre = new Map(acces.map((a) => [a.userId, a]));

    const membres: MembreDossier[] = [];
    const disponibles: MembreDisponible[] = [];

    for (const u of utilisateurs) {
      const roleMembre = getMappedRole(u.role);
      const assigneLe = assignes.get(u.id) ?? null;
      const accesParRole = u.isActive && hasPermission(roleMembre, CLIENTS_ACTIONS.VOIR_TOUS);

      if (u.isActive && !assigneLe) {
        disponibles.push({ id: u.id, nom: nomDe(u), email: u.email, role: u.role, accesParRole });
      }
      if (!assigneLe && !accesParRole) continue;

      const voitReporting = hasPermission(roleMembre, REPORTING_ACTIONS.VOIR);
      const a = accesParMembre.get(u.id);
      // Un membre connaît ses propres restrictions, pas celles de ses collègues.
      const lisible = peutGerer || u.id === user.id;
      membres.push({
        id: u.id,
        nom: nomDe(u),
        email: u.email,
        role: u.role,
        actif: u.isActive,
        assigne: !!assigneLe,
        assigneLe: assigneLe ? assigneLe.toISOString() : null,
        voitReporting,
        peutFiltrer: hasPermission(roleMembre, REPORTING_ACTIONS.FILTRER),
        peutExporter: hasPermission(roleMembre, REPORTING_ACTIONS.EXPORTER),
        peutRestreindre: peutGerer && voitReporting && u.isActive && canManageRole(role, roleMembre),
        masques: lisible
          ? (a?.hiddenElements ?? []).filter((e) => TOUS_LES_ELEMENTS.has(e))
          : null,
        modification:
          lisible && a
            ? { le: a.updatedAt.toISOString(), par: a.updatedBy ? nomDe(a.updatedBy) : null }
            : null,
      });
    }

    // Les membres assignés d'abord.
    membres.sort((x, y) => Number(y.assigne) - Number(x.assigne));

    const donnees: DonneesMembres = {
      moi: user.id,
      peutAssigner: hasPermission(role, CLIENTS_ACTIONS.ASSIGNER_MEMBRE),
      peutRetirer: hasPermission(role, CLIENTS_ACTIONS.RETIRER_MEMBRE),
      peutGerer,
      membres,
      disponibles,
    };
    return NextResponse.json(donnees);
  } catch (error) {
    console.error("GET /api/clients/:id/membres error:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des membres" }, { status: 500 });
  }
}
