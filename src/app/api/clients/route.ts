// app/api/clients/route.ts
/**
 * Routes Clients
 * GET /api/clients - Liste des clients
 * POST /api/clients - Créer un client
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  checkPermissionSync,
  getMappedRole,
  CLIENTS_ACTIONS,
} from "@/lib/permissions";

// Schéma de validation pour la création
const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().toLowerCase(),
  companyType: z.enum([
    "TECHNOLOGIE",
    "FINANCE",
    "SANTE",
    "EDUCATION",
    "COMMERCE",
    "INDUSTRIE",
    "AGRICULTURE",
    "IMMOBILIER",
    "TRANSPORT",
    "ENERGIE",
    "TELECOMMUNICATION",
    "TOURISME",
  ]),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  description: z.string().max(1000).optional(),
  denomination: z.string().max(100).optional(),
  socialNetworks: z
    .array(
      z.object({
        type: z.enum(["FACEBOOK", "LINKEDIN", "TWITTER"]),
        url: z.string().url(),
      }),
    )
    .max(3)
    .optional(),
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function createClientS3Folder(companyId: string, clientId: string) {
  const bucketName = process.env.AWS_S3_BUCKET_NAME!;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `${companyId}/${clientId}/`,
      Body: "",
    }),
  );
}

/**
 * GET /api/clients
 * Liste des clients accessibles par l'utilisateur
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const companyType = searchParams.get("companyType");
    const isSelfEntity = searchParams.get("isSelfEntity");

    const skip = (page - 1) * limit;

    // Construction du where selon le rôle
    const whereClause: Record<string, unknown> = {
      companyId: session.user.companyId,
      deletedAt: null,
    };

    // Vérifier si l'utilisateur peut voir tous les clients
    const userRole = getMappedRole(session.user.role);
    const canSeeAllClients = checkPermissionSync(
      userRole,
      CLIENTS_ACTIONS.VOIR_TOUS,
    );

    // Si l'utilisateur ne peut pas voir tous les clients, filtrer par assignments
    if (!canSeeAllClients) {
      const assignments = await prisma.clientAssignment.findMany({
        where: { userId: session.user.id },
        select: { clientId: true },
      });

      whereClause.id = {
        in: assignments.map((a) => a.clientId),
      };
    }

    // Filtres supplémentaires
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { denomination: { contains: search, mode: "insensitive" } },
      ];
    }

    if (companyType) {
      whereClause.companyType = companyType;
    }

    if (isSelfEntity !== null) {
      whereClause.isSelfEntity = isSelfEntity === "true";
    }

    // Compter le total
    const total = await prisma.client.count({ where: whereClause });

    // Récupérer les clients
    const clients = await prisma.client.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        website: true,
        companyType: true,
        denomination: true,
        description: true,
        isSelfEntity: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            normalFiles: true,
            assignments: true,
          },
        },
      },
    });

    // Pour chaque client, récupérer les membres assignés (si permission de voir les membres)
    let clientsWithMembers = clients;
    const canSeeMembers = checkPermissionSync(userRole, "membres:voir");
    if (canSeeMembers) {
      clientsWithMembers = await Promise.all(
        clients.map(async (client) => {
          const assignments = await prisma.clientAssignment.findMany({
            where: { clientId: client.id },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                },
              },
            },
          });

          return {
            ...client,
            assignedMembers: assignments.map((a) => a.user),
          };
        }),
      );
    }

    return NextResponse.json({
      clients: clientsWithMembers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/clients error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des clients" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/clients
 * Créer un nouveau client
 */

export async function POST(req: NextRequest) {
  try {
    // Vérifier la permission de créer un client
    const permissionResult = await requirePermission(CLIENTS_ACTIONS.CREER);
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    if (user.companyPackType !== "ENTREPRISE") {
      return NextResponse.json(
        {
          error: "Cette fonctionnalité nécessite le pack ENTREPRISE",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const data = createClientSchema.parse(body);

    const existingClient = await prisma.client.findFirst({
      where: {
        email: data.email,
        companyId: user.companyId,
      },
    });

    if (existingClient) {
      return NextResponse.json(
        { error: "Un client avec cet email existe déjà" },
        { status: 409 },
      );
    }

    const client = await prisma.client.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        website: data.website,
        companyType: data.companyType,
        denomination: data.denomination,
        description: data.description,
        companyId: user.companyId,
        createdById: user.id,
        isSelfEntity: false,
      },
    });

    await createClientS3Folder(user.companyId, client.id);

    if (data.socialNetworks && data.socialNetworks.length > 0) {
      await prisma.socialNetwork.createMany({
        data: data.socialNetworks.map((network) => ({
          type: network.type,
          url: network.url,
          clientId: client.id,
        })),
      });
    }

    const clientWithSocials = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
        socialNetworks: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "Client créé avec succès",
        client: clientWithSocials,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("POST /api/clients error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de la création du client" },
      { status: 500 },
    );
  }
}
