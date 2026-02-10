import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import {
  FileType,
  ProcessingStatus,
} from "../../../../../../prisma/generated/prisma/enums";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const REQUIRED_FILE_TYPES = [
  FileType.GRAND_LIVRE_COMPTES,
  FileType.GRAND_LIVRE_TIERS,
  FileType.PLAN_COMPTES,
  FileType.PLAN_TIERS,
  FileType.CODE_JOURNAL,
];

function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function deleteS3Folder(prefix: string): Promise<number> {
  const bucket = process.env.AWS_S3_BUCKET_NAME!;
  let deletedCount = 0;

  try {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      }),
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const objectsToDelete = listResponse.Contents.filter(
        (obj) => obj.Key && !obj.Key.includes("backup/"),
      ).map((obj) => ({ Key: obj.Key! }));

      if (objectsToDelete.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objectsToDelete },
          }),
        );
        deletedCount = objectsToDelete.length;
      }
    }
  } catch (error) {
    console.error("Erreur suppression S3:", error);
  }

  return deletedCount;
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const periodId = formData.get("periodId") as string;

    if (!periodId) {
      return NextResponse.json({ error: "periodId manquant" }, { status: 400 });
    }

    // Récupérer les 5 fichiers
    const files: { file: File; fileType: FileType }[] = [];
    for (const fileType of REQUIRED_FILE_TYPES) {
      const file = formData.get(fileType) as File;
      if (!file) {
        return NextResponse.json(
          { error: `Fichier manquant: ${fileType}` },
          { status: 400 },
        );
      }
      files.push({ file, fileType });
    }

    // Récupérer la période existante
    const existingPeriod = await prisma.comptablePeriod.findUnique({
      where: { id: periodId },
      include: {
        client: {
          select: { id: true, name: true, companyId: true },
        },
        files: true,
      },
    });

    if (!existingPeriod) {
      return NextResponse.json(
        { error: "Période non trouvée" },
        { status: 404 },
      );
    }

    if (existingPeriod.client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 },
      );
    }

    // Vérifier que la période n'est pas en cours de traitement
    if (
      existingPeriod.status === ProcessingStatus.PROCESSING ||
      existingPeriod.status === ProcessingStatus.VALIDATING
    ) {
      return NextResponse.json(
        { error: "Impossible de modifier une période en cours de traitement" },
        { status: 400 },
      );
    }

    // Vérifier que tous les fichiers sont Excel
    const validExcelTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    for (const { file } of files) {
      if (!validExcelTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `Le fichier ${file.name} doit être un fichier Excel` },
          { status: 400 },
        );
      }
    }

    const client = existingPeriod.client;
    const batchId = existingPeriod.batchId!;
    const periodStart = existingPeriod.periodStart;
    const periodEnd = existingPeriod.periodEnd;
    const year = periodStart.getFullYear();

    // Récupérer la company
    const company = await prisma.company.findUnique({
      where: { id: client.companyId },
      select: { name: true, id: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Entreprise non trouvée" },
        { status: 404 },
      );
    }

    const clientName = client.name.replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
    const companyName = company.name
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");
    const periodFolder = `periode-${formatDateYYYYMMDD(periodStart)}-${formatDateYYYYMMDD(periodEnd)}`;
    const s3Prefix = `${companyName}_${company.id}/${clientName}_${client.id}/declaration/${year}/${periodFolder}/`;

    console.log(`🔄 Mise à jour période: ${periodId}`);
    console.log(`📁 S3 Prefix: ${s3Prefix}`);

    // 1. Supprimer les anciens fichiers S3 (sauf backups)
    const deletedCount = await deleteS3Folder(s3Prefix);
    console.log(`🗑️ ${deletedCount} fichiers S3 supprimés`);

    // 2. Supprimer les anciens enregistrements de fichiers dans PostgreSQL
    await prisma.comptableFile.deleteMany({
      where: { batchId },
    });
    console.log(`🗑️ Anciens fichiers PostgreSQL supprimés`);

    // 3. Uploader les nouveaux fichiers sur S3 et créer les enregistrements
    const uploadedFiles: any[] = [];

    for (const { file, fileType } of files) {
      const fileBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);

      const dateStr = formatDateYYYYMMDD(periodEnd);
      const ext = file.name.split(".").pop();
      const fileName = `${dateStr}_${fileType}_${client.name}.${ext}`;

      const s3Key = `${s3Prefix}${fileType}/${fileName}`;
      const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        }),
      );

      const fileRecord = await prisma.comptableFile.create({
        data: {
          fileName,
          fileType,
          fileYear: year,
          s3Key,
          s3Url,
          fileSize: file.size,
          mimeType: file.type,
          status: "SUCCES",
          processingStatus: ProcessingStatus.PENDING,
          batchId,
          periodStart,
          periodEnd,
          clientId: client.id,
          uploadedById: session.user.id,
          processedAt: new Date(),
        },
      });

      uploadedFiles.push(fileRecord);

      await prisma.comptableFileHistory.create({
        data: {
          fileId: fileRecord.id,
          fileName,
          action: "UPDATE_COMPTABLE",
          details: `Fichier comptable mis à jour - Période: ${formatDateYYYYMMDD(periodStart)} au ${formatDateYYYYMMDD(periodEnd)}`,
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });
    }

    // 4. Mettre à jour le status de la période
    const updatedPeriod = await prisma.comptablePeriod.update({
      where: { id: periodId },
      data: {
        status: ProcessingStatus.PENDING,
        excelFileUrl: null,
        processedAt: null,
      },
    });

    console.log(`✅ Période mise à jour: ${periodId}`);

    return NextResponse.json(
      {
        message: "Période mise à jour avec succès",
        batchId,
        period: {
          id: periodId,
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
          year,
        },
        s3Prefix,
        files: uploadedFiles,
        comptablePeriod: updatedPeriod,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Update comptable error:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de la mise à jour",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
