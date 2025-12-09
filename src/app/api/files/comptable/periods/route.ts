import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const periods = await prisma.comptablePeriod.findMany({
      where: {
        client: {
          companyId: session.user.companyId,
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
