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
    const folderId = searchParams.get("folderId") || null;
    if (!clientId) {
      return NextResponse.json({ error: "clientId requis" }, { status: 400 });
    }

    // Vérification de l'appartenance du client à la société
    const client = await prisma.client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        companyId: true,
      },
    });

    if (!client || client.companyId !== session.user.companyId) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    // Recherche des fichiers normaux
    const files = await prisma.normalFile.findMany({
      where: {
        clientId,
        folderId: folderId ? folderId : null,
        deletedAt: null,
      },
      orderBy: { uploadedAt: "desc" },
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error("Erreur chargement fichiers normaux:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des fichiers" },
      { status: 500 }
    );
  }
}
