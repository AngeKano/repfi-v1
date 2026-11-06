import { NextRequest, NextResponse } from "next/server";

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  requireClientAccess,
  FICHIERS_ACTIONS,
} from "@/lib/permissions";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// DELETE NormalFile
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const permission = await requirePermission(FICHIERS_ACTIONS.SUPPRIMER);
    if (permission instanceof NextResponse) return permission;
    const { user } = permission;

    const { fileId } = await params;
    // Only find file with correct client access and not deleted
    const file = await prisma.normalFile.findFirst({
      where: {
        id: fileId,
        client: {
          companyId: user.companyId,
        },
        deletedAt: null,
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: "Fichier non trouvé" },
        { status: 404 },
      );
    }

    const refusDossier = await requireClientAccess(file.clientId, user);
    if (refusDossier) return refusDossier;

    // Supprimer de S3
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: file.s3Key,
      }),
    );

    // Supprimer logiquement de la base (soft delete)
    await prisma.normalFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });

    await prisma.normalFileHistory.create({
      data: {
        fileId: file.id,
        fileName: file.fileName,
        action: "DELETE",
        details: "Fichier supprimé",
        userId: user.id,
        userEmail: user.email ?? "",
      },
    });

    return NextResponse.json({ message: "Fichier supprimé avec succès" });
  } catch (error) {
    console.error("Delete normal file error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du fichier" },
      { status: 500 },
    );
  }
}
