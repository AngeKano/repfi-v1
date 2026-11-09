import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    // Télécharger un fichier importé, c'est le consulter (onglet Fichiers, même droit).
    const permission = await requirePermission(FICHIERS_ACTIONS.VOIR);
    if (permission instanceof NextResponse) return permission;
    const { user } = permission;

    const { fileId } = await params;

    const file = await prisma.normalFile.findFirst({
      where: {
        id: fileId,
        client: { companyId: user.companyId },
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

    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: file.s3Key,
      }),
    );

    const stream = s3Response.Body as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Erreur téléchargement" },
      { status: 500 },
    );
  }
}
