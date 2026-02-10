import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "../../auth/[...nextauth]/route";

import { prisma } from "@/lib/prisma";

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255),
});

// UPDATE Folder
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { folderId } = await params;
    const body = await req.json();
    const data = updateFolderSchema.parse(body);

    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        client: {
          companyId: session.user.companyId,
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Dossier non trouvé" },
        { status: 404 },
      );
    }

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: { name: data.name },
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

    return NextResponse.json({ folder: updatedFolder });
  } catch (error: any) {
    console.error("Update folder error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du dossier" },
      { status: 500 },
    );
  }
}

// DELETE Folder
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { folderId } = await params;
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        client: {
          companyId: session.user.companyId,
        },
      },
      include: {
        _count: {
          select: {
            children: true,
            files: true,
          },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Dossier non trouvé" },
        { status: 404 },
      );
    }

    if (folder._count.children > 0 || folder._count.files > 0) {
      return NextResponse.json(
        { error: "Le dossier doit être vide avant suppression" },
        { status: 400 },
      );
    }

    await prisma.folder.delete({
      where: { id: folderId },
    });

    return NextResponse.json({ message: "Dossier supprimé avec succès" });
  } catch (error) {
    console.error("Delete folder error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du dossier" },
      { status: 500 },
    );
  }
}
