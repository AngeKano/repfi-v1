import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  requireClientAccess,
  filtreDossiersAccessibles,
  FICHIERS_ACTIONS,
} from "@/lib/permissions";

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  clientId: z.string(),
  parentId: z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => (val === null ? undefined : val)),
});

// CREATE Folder : organiser l'espace de dépôt relève du chargement de fichiers.
export async function POST(req: NextRequest) {
  try {
    const permission = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (permission instanceof NextResponse) return permission;
    const { user } = permission;

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
        companyId: user.companyId,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    const refusDossier = await requireClientAccess(client.id, user);
    if (refusDossier) return refusDossier;

    // Le parent doit être dans le même dossier client : sinon le contrôle ci-dessus
    // serait contourné, la réponse renvoyant le parent d'un autre dossier.
    if (data.parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: data.parentId, clientId: data.clientId },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "Dossier parent non trouvé" },
          { status: 404 },
        );
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name: data.name,
        clientId: data.clientId,
        parentId: data.parentId,
        createdById: user.id,
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
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de la création du dossier" },
      { status: 500 },
    );
  }
}

// GET Folders
export async function GET(req: NextRequest) {
  try {
    const permission = await requirePermission(FICHIERS_ACTIONS.VOIR);
    if (permission instanceof NextResponse) return permission;
    const { user } = permission;

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const parentId = searchParams.get("parentId");

    if (clientId) {
      const refusDossier = await requireClientAccess(clientId, user);
      if (refusDossier) return refusDossier;
    }

    const folders = await prisma.folder.findMany({
      where: {
        client: {
          companyId: user.companyId,
          ...filtreDossiersAccessibles(user),
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
      { status: 500 },
    );
  }
}
