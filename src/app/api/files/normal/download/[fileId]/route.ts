import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { fileId } = await params;

    const file = await prisma.normalFile.findFirst({
      where: {
        id: fileId,
        client: { companyId: session.user.companyId },
        deletedAt: null,
      },
    });

    if (!file) {
      return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
    }

    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: file.s3Key,
      })
    );

    const stream = s3Response.Body as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.fileType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "Erreur téléchargement" }, { status: 500 });
  }
}