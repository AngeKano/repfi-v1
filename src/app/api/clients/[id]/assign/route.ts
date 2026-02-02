// app/api/clients/[id]/assign/route.ts
/**
 * Routes pour l'assignation des membres aux clients
 * POST /api/clients/:id/assign - Assigner des membres
 * DELETE /api/clients/:id/assign - Retirer des membres
 * GET /api/clients/:id/assign - Liste des assignations
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  checkPermissionSync,
  getMappedRole,
  CLIENTS_ACTIONS,
  MEMBRES_ACTIONS,
} from "@/lib/permissions";

const assignMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Au moins un membre requis"),
});

const unassignMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Au moins un membre requis"),
});

/**
 * POST /api/clients/:id/assign
 * Assigner des membres à un client
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Vérifier la permission d'assigner des membres
    const permissionResult = await requirePermission(
      CLIENTS_ACTIONS.ASSIGNER_MEMBRE
    );
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    const body = await req.json();
    const { userIds } = assignMembersSchema.parse(body);

    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        companyId: user.companyId,
        isActive: true,
      },
    });

    if (users.length !== userIds.length) {
      return NextResponse.json(
        { error: "Certains utilisateurs sont invalides" },
        { status: 400 }
      );
    }

    const existingAssignments = await prisma.clientAssignment.findMany({
      where: {
        clientId: id,
        userId: { in: userIds },
      },
    });

    const existingUserIds = existingAssignments.map((a) => a.userId);
    const newUserIds = userIds.filter(
      (userId) => !existingUserIds.includes(userId)
    );

    if (newUserIds.length > 0) {
      await prisma.clientAssignment.createMany({
        data: newUserIds.map((userId) => ({
          clientId: id,
          userId,
        })),
      });
    }

    const allAssignments = await prisma.clientAssignment.findMany({
      where: { clientId: id },
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

    return NextResponse.json({
      message: `${newUserIds.length} membre(s) assigné(s) avec succès`,
      assignments: allAssignments,
      stats: {
        newAssignments: newUserIds.length,
        alreadyAssigned: existingUserIds.length,
        totalAssignments: allAssignments.length,
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/clients/:id/assign error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erreur lors de l'assignation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/clients/:id/assign
 * Retirer des membres d'un client
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Vérifier la permission de retirer des membres
    const permissionResult = await requirePermission(
      CLIENTS_ACTIONS.RETIRER_MEMBRE
    );
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    const body = await req.json();
    const { userIds } = unassignMembersSchema.parse(body);

    const result = await prisma.clientAssignment.deleteMany({
      where: {
        clientId: id,
        userId: { in: userIds },
      },
    });

    const remainingAssignments = await prisma.clientAssignment.findMany({
      where: { clientId: id },
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

    return NextResponse.json({
      message: `${result.count} membre(s) retiré(s) avec succès`,
      assignments: remainingAssignments,
      stats: {
        removed: result.count,
        remaining: remainingAssignments.length,
      },
    });
  } catch (error: unknown) {
    console.error("DELETE /api/clients/:id/assign error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erreur lors du retrait" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/clients/:id/assign
 * Récupérer les assignations d'un client
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        companyId: session.user.companyId,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    const assignments = await prisma.clientAssignment.findMany({
      where: { clientId: id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    let availableMembers: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      role: string;
    }[] = [];

    // Vérifier si l'utilisateur peut voir les membres disponibles
    const userRole = getMappedRole(session.user.role);
    const canSeeMembers = checkPermissionSync(userRole, MEMBRES_ACTIONS.VOIR);

    if (canSeeMembers) {
      const assignedUserIds = assignments.map((a) => a.userId);

      availableMembers = await prisma.user.findMany({
        where: {
          companyId: session.user.companyId,
          isActive: true,
          id: { notIn: assignedUserIds },
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
        orderBy: { email: "asc" },
      });
    }

    return NextResponse.json({
      assignments: assignments.map((a) => ({
        ...a.user,
        assignedAt: a.assignedAt,
      })),
      availableMembers,
      stats: {
        totalAssigned: assignments.length,
        totalAvailable: availableMembers.length,
      },
    });
  } catch (error) {
    console.error("GET /api/clients/:id/assign error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération" },
      { status: 500 }
    );
  }
}
