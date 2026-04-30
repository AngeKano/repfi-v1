import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// GET /api/files/download/comptable?batchId=xxx&fileName=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    const fileName = searchParams.get("fileName");

    if (!batchId || !fileName) {
      return NextResponse.json(
        { error: "batchId et fileName sont requis" },
        { status: 400 },
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const file = await prisma.comptableFile.findFirst({
      where: {
        batchId: batchId,
        fileName: fileName,
        client: { companyId: session.user.companyId },
      },
      include: { client: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: "Fichier non trouvé" },
        { status: 404 },
      );
    }

    // Utiliser s3Key directement (plus fiable que de parser s3Url)
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    let key: string | undefined = file.s3Key ?? undefined;

    // Fallback: extraire la clé depuis s3Url si s3Key n'est pas disponible
    if (!key && typeof file.s3Url === "string") {
      const s3Match = file.s3Url.match(/^s3:\/\/([^\/]+)\/(.+)$/);
      if (s3Match) {
        key = s3Match[2];
      } else {
        try {
          const parsedUrl = new URL(file.s3Url);
          const rawPath = parsedUrl.pathname.startsWith("/")
            ? parsedUrl.pathname.slice(1)
            : parsedUrl.pathname;
          key = decodeURIComponent(rawPath);
        } catch (e) {
          return NextResponse.json(
            { error: "Format du lien S3 invalide" },
            { status: 400 },
          );
        }
      }
    }

    if (!bucket || !key) {
      return NextResponse.json(
        { error: "Impossible d'extraire le bucket ou la clé S3" },
        { status: 400 },
      );
    }

    // Streamer le fichier directement depuis S3
    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const stream = s3Response.Body as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type":
          file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName ?? "export.xlsx")}"`,
        ...(s3Response.ContentLength
          ? { "Content-Length": String(s3Response.ContentLength) }
          : {}),
      },
    });
  } catch (error) {
    console.error("Erreur téléchargement S3 (comptable):", error);
    return NextResponse.json(
      { error: "Erreur lors du téléchargement du fichier" },
      { status: 500 },
    );
  }
}
