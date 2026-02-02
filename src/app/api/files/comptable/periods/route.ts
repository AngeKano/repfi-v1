import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, FICHIERS_ACTIONS } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    // Vérifier la permission de voir les fichiers
    const permissionResult = await requirePermission(FICHIERS_ACTIONS.VOIR);
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const periods = await prisma.comptablePeriod.findMany({
      where: {
        client: {
          companyId: user.companyId,
        },
        ...(clientId && { clientId }),
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return NextResponse.json({ periods });
  } catch (error) {
    console.error("GET periods error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des périodes" },
      { status: 500 }
    );
  }
}
