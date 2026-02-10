import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import {
  S3Client,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// ClickHouse client
const clickhouseClient = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

// Helper pour obtenir le nom de la DB ClickHouse
function getClickhouseDbName(clientId: string): string {
  const cleanId = clientId.replace(/[^a-zA-Z0-9]/g, "_");
  return `repfi_${cleanId}`;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ periodsId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { periodsId } = await params;
    const periodId = periodsId;

    // Retrieve the period with files
    const period = await prisma.comptablePeriod.findUnique({
      where: { id: periodId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyId: true,
          },
        },
        files: true,
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Période non trouvée" },
        { status: 404 },
      );
    }

    if (period.client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 },
      );
    }

    // Ne pas permettre la suppression si en cours de traitement
    if (period.status === "PROCESSING" || period.status === "VALIDATING") {
      return NextResponse.json(
        { error: "Impossible de supprimer une période en cours de traitement" },
        { status: 400 },
      );
    }

    const bucket = process.env.AWS_S3_BUCKET_NAME!;
    const year = period.periodStart.getFullYear();
    const formatDateYYYYMMDD = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}${month}${day}`;
    };
    const periodFolder = `periode-${formatDateYYYYMMDD(
      period.periodStart,
    )}-${formatDateYYYYMMDD(period.periodEnd)}`;
    const companyName = period.client.name
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");
    const clientName = period.client.name
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");
    const s3Prefix = `${companyName}_${period.client.companyId}/${clientName}_${period.client.id}/declaration/${year}/${periodFolder}/`;

    // 1. Supprimer tous les fichiers S3 du dossier de la période
    try {
      console.log("S3 bucket:", bucket, "S3 prefix:", s3Prefix);
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: s3Prefix,
        }),
      );

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        for (const obj of listResponse.Contents) {
          if (obj.Key) {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: bucket,
                Key: obj.Key,
              }),
            );
          }
        }
      }
    } catch (s3Error) {
      console.error("Erreur suppression S3:", s3Error);
    }

    // 2. Supprimer les données ClickHouse (tables grand_livre, gl_compte, gl_tiers)
    try {
      const batchId = period.batchId;
      const clientId = period.client.id;
      const dbName = getClickhouseDbName(clientId);

      const tablesToDelete = ["grand_livre", "gl_compte", "gl_tiers"];

      for (const table of tablesToDelete) {
        console.log(
          `🗑️ Suppression ClickHouse: ${dbName}.${table} WHERE batch_id = '${batchId}'`,
        );
        await clickhouseClient.command({
          query: `ALTER TABLE ${dbName}.${table} DELETE WHERE batch_id = '${batchId}'`,
        });
        console.log(
          `✅ Données ClickHouse supprimées pour batch_id: ${batchId} dans ${table}`,
        );
      }
    } catch (clickhouseError) {
      console.error("Erreur suppression ClickHouse:", clickhouseError);
      // Continuer même si erreur ClickHouse
    }

    // 3. Supprimer les enregistrements Postgres
    await prisma.comptablePeriod.delete({
      where: { id: periodId },
    });

    return NextResponse.json({
      message: "Période supprimée avec succès",
      deletedFiles: period.files.length,
    });
  } catch (error) {
    console.error("DELETE period error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la période" },
      { status: 500 },
    );
  }
}
