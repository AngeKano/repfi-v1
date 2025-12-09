import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "../auth/[...nextauth]/route";

import { prisma } from "@/lib/prisma";

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  clientId: z.string(),
  parentId: z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => (val === null ? undefined : val)),
});

// CREATE Folder
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();

    // Ensure parentId is undefined if null is received
    const parsedBody = {
      ...body,
      parentId: body.parentId === null ? undefined : body.parentId,
    };
    const data = createFolderSchema.parse(parsedBody);

    const client = await prisma.client.findFirst({
      where: {
        id: data.clientId,
        companyId: session.user.companyId,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    const folder = await prisma.folder.create({
      data: {
        name: data.name,
        clientId: data.clientId,
        parentId: data.parentId,
        createdById: session.user.id,
      },
      include: {
        parent: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error: any) {
    console.error("Create folder error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de la création du dossier" },
      { status: 500 }
    );
  }
}

// GET Folders
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const parentId = searchParams.get("parentId");

    const folders = await prisma.folder.findMany({
      where: {
        client: {
          companyId: session.user.companyId,
        },
        ...(clientId && { clientId }),
        ...(parentId === "root"
          ? { parentId: null }
          : parentId
          ? { parentId }
          : {}),
      },
      include: {
        parent: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            children: true,
            files: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("GET folders error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des dossiers" },
      { status: 500 }
    );
  }
}
