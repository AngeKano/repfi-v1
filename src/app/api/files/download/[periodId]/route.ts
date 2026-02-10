import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// PrismaClient should ideally be a singleton, but for API route, it's OK.
import { prisma } from "@/lib/prisma";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Correct handling of context in Next.js API routes for both sync/async context
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> },
) {
  try {
    const { periodId } = await params;

    // Retrieve session and check authorization
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Fetch the period, making sure the user belongs to the right company
    const period = await prisma.comptablePeriod.findFirst({
      where: {
        id: periodId,
        client: { companyId: session.user.companyId },
      },
      include: { client: true },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Période non trouvée" },
        { status: 404 },
      );
    }

    if (!period.excelFileUrl || !period.excelFileUrl.startsWith("s3://")) {
      return NextResponse.json(
        { error: "Aucun fichier Excel S3 disponible pour cette période" },
        { status: 400 },
      );
    }

    // Format attendu : s3://<bucket>/<key>
    const s3UrlMatch = period.excelFileUrl.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!s3UrlMatch) {
      return NextResponse.json(
        { error: "Format du lien S3 invalide" },
        { status: 400 },
      );
    }
    const bucket = s3UrlMatch[1];
    const s3Key = s3UrlMatch[2];

    // Générer une URL signée S3 pour 1 heure
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    // Nom du fichier exporté (extraction du nom originel si possible)
    let fileName = s3Key.split("/").pop();
    if (!fileName) fileName = `export-comptable-${period.id}.xlsx`;

    return NextResponse.json({
      url: signedUrl,
      fileName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch (error) {
    console.error(
      "Erreur lors de la génération du lien de téléchargement S3 (excelFileUrl):",
      error,
    );
    return NextResponse.json(
      { error: "Erreur lors de la génération du lien de téléchargement Excel" },
      { status: 500 },
    );
  }
}
