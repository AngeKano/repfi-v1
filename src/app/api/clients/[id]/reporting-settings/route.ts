import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { SAISIE_ACTIONS } from "@/lib/permissions/actions";

const schema = z.object({
  excludeManualEntries: z.boolean(),
});

// ============================================================================
// PATCH — bascule l'exclusion des écritures saisies manuellement de TOUS les
// calculs du reporting (permet de comparer l'avant/après saisies).
// ============================================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const perm = await requirePermission(SAISIE_ACTIONS.GERER);
    if (perm instanceof NextResponse) return perm;

    const { id } = await params;
    const client = await prisma.client.findFirst({
      where: { id, companyId: perm.user.companyId },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    const updated = await prisma.client.update({
      where: { id },
      data: { excludeManualEntries: parsed.data.excludeManualEntries },
      select: { excludeManualEntries: true },
    });

    return NextResponse.json({ ok: true, excludeManualEntries: updated.excludeManualEntries });
  } catch (error) {
    console.error("reporting-settings PATCH error:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
