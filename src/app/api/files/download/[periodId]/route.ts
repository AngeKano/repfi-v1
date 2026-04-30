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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> },
) {
  try {
    const { periodId } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

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

    let fileName = s3Key.split("/").pop();
    if (!fileName) fileName = `export-comptable-${period.id}.xlsx`;

    // Streamer le fichier directement depuis S3
    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      }),
    );

    const stream = s3Response.Body as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        ...(s3Response.ContentLength
          ? { "Content-Length": String(s3Response.ContentLength) }
          : {}),
      },
    });
  } catch (error) {
    console.error("Erreur téléchargement S3 (excelFileUrl):", error);
    return NextResponse.json(
      { error: "Erreur lors du téléchargement du fichier Excel" },
      { status: 500 },
    );
  }
}
