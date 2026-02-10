// app/api/clients/[id]/route.ts
/**
 * Routes Client individuel
 * GET /api/clients/:id - Détails d'un client
 * PATCH /api/clients/:id - Modifier un client
 * DELETE /api/clients/:id - Supprimer un client (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  checkPermissionSync,
  getMappedRole,
  CLIENTS_ACTIONS,
} from "@/lib/permissions";

// Schéma de validation pour la mise à jour
const updateClientSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().toLowerCase().optional(),
  companyType: z
    .enum([
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
    ])
    .optional(),
  phone: z.string().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal("")),
  description: z.string().max(1000).optional().nullable(),
  denomination: z.string().max(100).optional().nullable(),
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

/**
 * Vérifier l'accès au client
 */

async function checkClientAccess(
  clientId: string,
  userId: string,
  role: string,
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      company: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!client) {
    return { hasAccess: false, client: null, error: "Client non trouvé" };
  }

  // Vérifier si l'utilisateur peut voir tous les clients
  const mappedRole = getMappedRole(role);
  const canSeeAllClients = checkPermissionSync(
    mappedRole,
    CLIENTS_ACTIONS.VOIR_TOUS,
  );

  if (canSeeAllClients) {
    return { hasAccess: true, client, error: null };
  }

  // Sinon, ne peut accéder qu'aux clients assignés
  const assignment = await prisma.clientAssignment.findFirst({
    where: {
      clientId,
      userId,
    },
  });

  if (!assignment) {
    return {
      hasAccess: false,
      client: null,
      error: "Vous n'avez pas accès à ce client",
    };
  }

  return { hasAccess: true, client, error: null };
}

/**
 * GET /api/clients/:id
 * Récupérer les détails d'un client
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { hasAccess, client, error } = await checkClientAccess(
      id,
      session.user.id,
      session.user.role,
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: error || "Accès refusé" },
        { status: error === "Client non trouvé" ? 404 : 403 },
      );
    }

    // Récupérer les détails complets du client
    const clientDetails = await prisma.client.findUnique({
      where: { id: id },
      include: {
        socialNetworks: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        assignments: {
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
        },
        normalFiles: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: "desc" },
          take: 10,
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            uploadedAt: true,
            uploadedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            normalFiles: {
              where: { deletedAt: null },
            },
            assignments: true,
          },
        },
      },
    });

    return NextResponse.json({
      client: {
        ...clientDetails,
        assignedMembers: clientDetails?.assignments.map((a) => a.user),
        recentFiles: clientDetails?.normalFiles,
        stats: {
          totalFiles: clientDetails?._count.normalFiles || 0,
          totalMembers: clientDetails?._count.assignments || 0,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/clients/:id error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du client" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/clients/:id
 * Modifier un client
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Vérifier la permission de modifier un client
    const permissionResult = await requirePermission(CLIENTS_ACTIONS.MODIFIER);
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const { hasAccess, error } = await checkClientAccess(
      id,
      user.id,
      user.role,
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: error || "Accès refusé" },
        { status: error === "Client non trouvé" ? 404 : 403 },
      );
    }

    // Vérifier que ce n'est pas la self entity
    const client = await prisma.client.findUnique({
      where: { id: id },
      select: { isSelfEntity: true },
    });

    if (client?.isSelfEntity) {
      return NextResponse.json(
        {
          error:
            "Impossible de modifier l'entité self. Modifiez les informations de l'entreprise.",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const data = updateClientSchema.parse(body);

    // Si l'email change, vérifier qu'il n'existe pas déjà
    if (data.email) {
      const existingClient = await prisma.client.findFirst({
        where: {
          email: data.email,
          companyId: user.companyId,
          id: { not: id },
        },
      });

      if (existingClient) {
        return NextResponse.json(
          { error: "Un client avec cet email existe déjà" },
          { status: 409 },
        );
      }
    }

    // Mettre à jour le client
    const updatedClient = await prisma.client.update({
      where: { id: id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        website: data.website,
        companyType: data.companyType,
        denomination: data.denomination,
        description: data.description,
        updatedAt: new Date(),
      },
    });

    // Mettre à jour les réseaux sociaux si fournis
    if (data.socialNetworks !== undefined) {
      // Supprimer les anciens
      await prisma.socialNetwork.deleteMany({
        where: { clientId: id },
      });

      // Créer les nouveaux
      if (data.socialNetworks.length > 0) {
        await prisma.socialNetwork.createMany({
          data: data.socialNetworks.map((network) => ({
            type: network.type,
            url: network.url,
            clientId: id,
          })),
        });
      }
    }

    // Récupérer le client mis à jour avec les réseaux sociaux
    const clientWithSocials = await prisma.client.findUnique({
      where: { id: id },
      include: {
        socialNetworks: true,
      },
    });

    return NextResponse.json({
      message: "Client mis à jour avec succès",
      client: clientWithSocials,
    });
  } catch (error: any) {
    console.error("PATCH /api/clients/:id error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du client" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/clients/:id
 * Supprimer un client (soft delete)
 */

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Vérifier la permission de désactiver un client
    const permissionResult = await requirePermission(
      CLIENTS_ACTIONS.DESACTIVER,
    );
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const clientId = id;

    const { hasAccess, error } = await checkClientAccess(
      clientId,
      user.id,
      user.role,
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: error || "Accès refusé" },
        { status: error === "Client non trouvé" ? 404 : 403 },
      );
    }

    // Vérifier que ce n'est pas la self entity
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { isSelfEntity: true },
    });

    if (client?.isSelfEntity) {
      return NextResponse.json(
        { error: "Impossible de supprimer l'entité self" },
        { status: 403 },
      );
    }

    // Suppression effective du client
    await prisma.client.delete({
      where: { id: clientId },
    });

    return NextResponse.json({
      message: "Client supprimé avec succès",
    });
  } catch (error) {
    console.error("DELETE /api/clients/:id error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du client" },
      { status: 500 },
    );
  }
}
