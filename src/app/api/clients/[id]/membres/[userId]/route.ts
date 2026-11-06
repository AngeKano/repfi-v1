// app/api/clients/[id]/membres/[userId]/route.ts
/**
 * Éléments du reporting masqués à un membre sur un dossier.
 * PUT /api/clients/:id/membres/:userId  { masques: string[] }
 *
 * Réservé aux administrateurs, sur un membre de niveau inférieur au leur : on
 * ne se restreint pas soi-même et on ne restreint ni un pair ni un supérieur.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  hasPermission,
  getMappedRole,
  canManageRole,
  REPORTING_ACTIONS,
} from "@/lib/permissions";
import { TOUS_LES_ELEMENTS } from "@/lib/reporting/elements";

const schema = z.object({ masques: z.array(z.string()) });

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const permission = await requirePermission(REPORTING_ACTIONS.GERER_VISIBILITE);
    if (permission instanceof NextResponse) return permission;
    const { user } = permission;

    const { id, userId } = await params;
    const [client, membre] = await Promise.all([
      prisma.client.findFirst({ where: { id, companyId: user.companyId }, select: { id: true } }),
      prisma.user.findFirst({ where: { id: userId, companyId: user.companyId }, select: { role: true } }),
    ]);
    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }
    if (!membre) {
      return NextResponse.json({ error: "Membre non trouvé" }, { status: 404 });
    }

    const roleMembre = getMappedRole(membre.role);
    if (!canManageRole(getMappedRole(user.role), roleMembre)) {
      return NextResponse.json(
        { error: "Seul un administrateur de niveau supérieur peut modifier les accès de ce membre" },
        { status: 403 },
      );
    }
    if (!hasPermission(roleMembre, REPORTING_ACTIONS.VOIR)) {
      return NextResponse.json({ error: "Le rôle de ce membre n'a pas accès au reporting" }, { status: 400 });
    }

    const { masques } = schema.parse(await req.json());
    const inconnus = masques.filter((e) => !TOUS_LES_ELEMENTS.has(e));
    if (inconnus.length > 0) {
      return NextResponse.json({ error: `Éléments inconnus : ${inconnus.join(", ")}` }, { status: 400 });
    }

    const hiddenElements = [...new Set(masques)];
    if (hiddenElements.length === 0) {
      // Plus aucune restriction : retour à l'état par défaut (tout est visible).
      await prisma.memberReportingAccess.deleteMany({ where: { clientId: id, userId } });
    } else {
      await prisma.memberReportingAccess.upsert({
        where: { clientId_userId: { clientId: id, userId } },
        create: { clientId: id, userId, hiddenElements, updatedById: user.id },
        update: { hiddenElements, updatedById: user.id },
      });
    }

    return NextResponse.json({ masques: hiddenElements });
  } catch (error: unknown) {
    console.error("PUT /api/clients/:id/membres/:userId error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }
}
