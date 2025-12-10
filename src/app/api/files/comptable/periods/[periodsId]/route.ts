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

//  const clickhouseClient = createClickhouseClient({
//    url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
//    username: process.env.CLICKHOUSE_USER || "default",
//    password: process.env.CLICKHOUSE_PASSWORD || "",
//  });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ periodsId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Get id from param
    const { periodsId } = await params;

    const periodId = periodsId;

    // Retrieve the period with files (must select id field!)
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
        { status: 404 }
      );
    }

    if (period.client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    // Ne pas permettre la suppression si en cours de traitement
    if (period.status === "PROCESSING" || period.status === "VALIDATING") {
      return NextResponse.json(
        { error: "Impossible de supprimer une période en cours de traitement" },
        { status: 400 }
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
      period.periodStart
    )}-${formatDateYYYYMMDD(period.periodEnd)}`;
    const s3Prefix = `${period.client.id}/declaration/${year}/${periodFolder}/`;

    // 1. Supprimer tous les fichiers S3 du dossier de la période
    try {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: s3Prefix,
        })
      );

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        for (const obj of listResponse.Contents) {
          if (obj.Key) {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: bucket,
                Key: obj.Key,
              })
            );
          }
        }
      }
    } catch (s3Error) {
      console.error("Erreur suppression S3:", s3Error);
      // Continuer même si erreur S3
    }

    // 2. Supprimer les données ClickHouse
    // try {
    //   const batchId = period.batchId;
    //   const clientId = period.client.id;

    //   // Supprimer de toutes les tables ClickHouse
    //   await clickhouseClient.command({
    //     query: `DELETE FROM GrandLivre WHERE client_id = '${clientId}' AND batch_id = '${batchId}'`,
    //   });

    //   await clickhouseClient.command({
    //     query: `DELETE FROM PlanTiers WHERE client_id = '${clientId}'`,
    //   });

    //   await clickhouseClient.command({
    //     query: `DELETE FROM PlanComptable WHERE client_id = '${clientId}'`,
    //   });

    //   await clickhouseClient.command({
    //     query: `DELETE FROM CodeJournal WHERE client_id = '${clientId}'`,
    //   });

    //   await clickhouseClient.command({
    //     query: `DELETE FROM etl_metadata WHERE batch_id = '${batchId}'`,
    //   });
    // } catch (clickhouseError) {
    //   console.error("Erreur suppression ClickHouse:", clickhouseError);
    //   // Continuer même si erreur ClickHouse
    // }

    // 3. Supprimer les enregistrements Postgres
    // Les fichiers seront supprimés en cascade grâce à onDelete: Cascade
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
      { status: 500 }
    );
  }
}
