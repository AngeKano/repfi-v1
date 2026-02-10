import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

    // Authentification utilisateur
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération du fichier en base pour le batch et fileName spécifiés et vérification société
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

    let bucket: string | undefined = undefined;
    let key: string | undefined = undefined;
    let signedUrl: string | undefined = undefined;

    if (typeof file.s3Url === "string") {
      const s3Match = file.s3Url.match(/^s3:\/\/([^\/]+)\/(.+)$/);
      if (s3Match) {
        bucket = s3Match[1];
        key = s3Match[2];
      } else {
        try {
          const parsedUrl = new URL(file.s3Url);
          // bucket: repfi-dev
          // host possible: repfi-dev.s3.eu-north-1.amazonaws.com
          const [bucketPart] = parsedUrl.host.split(".");
          bucket = bucketPart;
          // On enlève le "/" initial
          key = parsedUrl.pathname.startsWith("/")
            ? parsedUrl.pathname.slice(1)
            : parsedUrl.pathname;
        } catch (e) {
          // Echec du parsing (format URL incorrect)
          return NextResponse.json(
            { error: "Format du lien S3 invalide (ni s3://, ni HTTPS)" },
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

    // Générer une URL signée pour ce fichier/bucket/key
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return NextResponse.json({
      url: signedUrl,
      fileName: file.fileName ?? undefined,
      mimeType: file.mimeType ?? undefined,
    });
  } catch (error) {
    console.error("Erreur génération URL signée:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du lien de téléchargement" },
      { status: 500 },
    );
  }
}
