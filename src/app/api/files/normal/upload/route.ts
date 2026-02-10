import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, FICHIERS_ACTIONS } from "@/lib/permissions";
// Instantiate S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const uploadSchema = z.object({
  clientId: z.string(),
  folderId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    // Vérifier la permission de charger des fichiers
    const permissionResult = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const clientId = formData.get("clientId") as string;
    // Normalize folderId: convert undefined to null so Zod optional().nullable() passes
    let folderIdRaw = formData.get("folderId");
    const folderId = folderIdRaw === undefined ? null : (folderIdRaw as string);

    if (!file) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    const data = uploadSchema.parse({ clientId, folderId });

    // Vérification du client lié à l'utilisateur/entreprise
    const client = await prisma.client.findFirst({
      where: {
        id: data.clientId,
        companyId: user.companyId,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: folderId,
          clientId: data.clientId,
        },
      });

      if (!folder) {
        return NextResponse.json(
          { error: "Dossier non trouvé" },
          { status: 404 },
        );
      }
    }

    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    // Version corrigée pour inclure company.name dans le préfixe S3 si besoin
    // Assume we have `client` fetched above, so client.name is available
    const clientName = client.name.replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
    //

    // On récupère la company liée au client (déjà vérifié plus haut que client est valide)
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
    const companyName = company.name
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");

    const s3Key = folderId
      ? `${companyName}_${company.id}/${clientName}_${client.id}/folder/${folderId}/${file.name}`
      : `${companyName}_${company.id}/${clientName}_${client.id}/folder/${file.name}`;

    const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    // Correction: Utilisation de la table NormalFile pour ce type de fichier
    let fileRecord = await prisma.normalFile.create({
      data: {
        fileName: file.name,
        s3Key,
        s3Url,
        fileSize: file.size,
        mimeType: file.type,
        clientId: data.clientId,
        folderId: folderId || null,
        uploadedById: user.id,
      },
    });

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        }),
      );

      fileRecord = await prisma.normalFile.update({
        where: { id: fileRecord.id },
        data: {
          // No explicit file status in model for normal files, maybe set a custom `deletedAt` or use file history.
        },
      });

      // Ajout dans l'historique des fichiers normaux
      await prisma.normalFileHistory.create({
        data: {
          fileId: fileRecord.id,
          fileName: file.name,
          action: "UPLOAD",
          details: "Fichier normal uploadé avec succès",
          userId: user.id,
          userEmail: user.email ?? "",
        },
      });
    } catch (s3Error) {
      // S'il y a une erreur lors du transfert S3, supprimer le fichier créé en base
      await prisma.normalFile.update({
        where: { id: fileRecord.id },
        data: {
          deletedAt: new Date(),
        },
      });

      return NextResponse.json(
        { error: "Erreur lors du transfert du fichier" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        message: "Fichier uploadé avec succès",
        file: fileRecord,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Upload error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 },
    );
  }
}
