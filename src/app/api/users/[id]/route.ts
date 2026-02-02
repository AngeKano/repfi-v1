// app/api/users/[id]/route.ts
/**
 * Routes Utilisateur individuel
 * PATCH /api/users/:id - Modifier un membre
 * DELETE /api/users/:id - Désactiver un membre
 * GET /api/users/:id - Détails d'un membre
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  checkPermissionSync,
  getMappedRole,
  canManageRole,
  RoleId,
  MEMBRES_ACTIONS,
} from "@/lib/permissions";

// Liste des rôles disponibles pour la mise à jour
const availableRoles = [
  "ADMIN_CF",
  "ADMIN_PARTENAIRE",
  "LOADER",
  "LOADER_PLUS",
  "VIEWER",
  // Legacy roles pour compatibilité
  "ADMIN",
  "USER",
] as const;

// Schéma de validation pour la mise à jour
const updateUserSchema = z.object({
  email: z.string().email().toLowerCase().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(2).max(100).optional().nullable(),
  lastName: z.string().min(2).max(100).optional().nullable(),
  role: z.enum(availableRoles).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Vérifier l'accès à l'utilisateur
 */
async function checkUserAccess(
  userId: string,
  sessionUserId: string,
  role: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          clientAssignments: true,
          normalFiles: true,
        },
      },
    },
  });

  if (!user) {
    return { hasAccess: false, user: null, error: "Utilisateur non trouvé" };
  }

  // Vérifier si l'utilisateur peut voir les membres
  const mappedRole = getMappedRole(role);
  const canSeeMembers = checkPermissionSync(mappedRole, MEMBRES_ACTIONS.VOIR);

  if (canSeeMembers) {
    return { hasAccess: true, user, error: null };
  }

  // Sinon, peut uniquement voir son propre profil
  if (userId === sessionUserId) {
    return { hasAccess: true, user, error: null };
  }

  return {
    hasAccess: false,
    user: null,
    error: "Vous n'avez pas accès à cet utilisateur",
  };
}

/**
 * GET /api/users/:id
 * Récupérer les détails d'un membre
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { hasAccess, user, error } = await checkUserAccess(
      id,
      session.user.id,
      session.user.role
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: error || "Accès refusé" },
        { status: error === "Utilisateur non trouvé" ? 404 : 403 }
      );
    }

    // Retirer le mot de passe
    const { password, ...userWithoutPassword } = user!;

    // Récupérer les clients assignés
    const clientAssignments = await prisma.clientAssignment.findMany({
      where: { userId: id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            companyType: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    return NextResponse.json({
      user: {
        ...userWithoutPassword,
        clientAssignments: clientAssignments.map((a) => ({
          ...a.client,
          assignedAt: a.assignedAt,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/users/:id error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'utilisateur" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/:id
 * Modifier un membre
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const sessionUser = session.user;
    const sessionRole = getMappedRole(sessionUser.role);
    const isSelf = id === sessionUser.id;

    // Vérifier les permissions de modification
    const canModifyMembers = checkPermissionSync(
      sessionRole,
      MEMBRES_ACTIONS.MODIFIER
    );

    if (!canModifyMembers && !isSelf) {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }

    const { hasAccess, user: targetUser, error } = await checkUserAccess(
      id,
      sessionUser.id,
      sessionUser.role
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: error || "Accès refusé" },
        { status: error === "Utilisateur non trouvé" ? 404 : 403 }
      );
    }

    const body = await req.json();
    const data = updateUserSchema.parse(body);

    // Si l'utilisateur n'a pas la permission de modifier, il ne peut modifier que son profil
    if (!canModifyMembers) {
      if (data.role || data.isActive !== undefined) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas modifier le rôle ou le statut" },
          { status: 403 }
        );
      }
    }

    // Vérifier la hiérarchie des rôles
    const targetRole = getMappedRole(targetUser?.role || "");

    // On ne peut pas modifier un utilisateur de niveau supérieur ou égal
    if (
      targetRole !== sessionRole &&
      !canManageRole(sessionRole, targetRole)
    ) {
      return NextResponse.json(
        {
          error:
            "Vous ne pouvez pas modifier un utilisateur avec un rôle supérieur ou égal au vôtre",
        },
        { status: 403 }
      );
    }

    // Empêcher la modification vers ADMIN_ROOT
    if (data.role) {
      const newRole = getMappedRole(data.role);
      if (newRole === RoleId.ADMIN_ROOT) {
        return NextResponse.json(
          { error: "Impossible de promouvoir en administrateur root" },
          { status: 403 }
        );
      }

      // On ne peut pas promouvoir à un rôle supérieur ou égal au sien
      if (!canManageRole(sessionRole, newRole)) {
        return NextResponse.json(
          {
            error:
              "Vous ne pouvez pas attribuer un rôle supérieur ou égal au vôtre",
          },
          { status: 403 }
        );
      }
    }

    // Vérifier si l'email existe déjà
    if (data.email && data.email !== targetUser?.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: "Cet email est déjà utilisé" },
          { status: 409 }
        );
      }
    }

    // Préparer les données à mettre à jour
    const updateData: Record<string, unknown> = {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      updatedAt: new Date(),
    };

    // Si permission de modifier, peut changer le rôle et le statut
    if (canModifyMembers) {
      if (data.role !== undefined) updateData.role = data.role;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
    }

    // Hasher le nouveau mot de passe si fourni
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Mettre à jour l'utilisateur
    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Utilisateur mis à jour avec succès",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("PATCH /api/users/:id error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'utilisateur" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/:id
 * Désactiver un membre
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Vérifier la permission de désactiver un membre
    const permissionResult = await requirePermission(MEMBRES_ACTIONS.DESACTIVER);
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user: sessionUser } = permissionResult;

    const { hasAccess, user: targetUser, error } = await checkUserAccess(
      id,
      sessionUser.id,
      sessionUser.role
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: error || "Accès refusé" },
        { status: error === "Utilisateur non trouvé" ? 404 : 403 }
      );
    }

    // Ne peut pas se désactiver soi-même
    if (id === sessionUser.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas vous désactiver vous-même" },
        { status: 403 }
      );
    }

    // Vérifier la hiérarchie des rôles
    const sessionRole = getMappedRole(sessionUser.role);
    const targetRole = getMappedRole(targetUser?.role || "");

    // On ne peut pas désactiver un utilisateur de niveau supérieur ou égal
    if (!canManageRole(sessionRole, targetRole)) {
      return NextResponse.json(
        {
          error:
            "Vous ne pouvez pas désactiver un utilisateur avec un rôle supérieur ou égal au vôtre",
        },
        { status: 403 }
      );
    }

    // Ne peut pas désactiver un ADMIN_ROOT
    if (targetRole === RoleId.ADMIN_ROOT) {
      return NextResponse.json(
        { error: "Impossible de désactiver un administrateur root" },
        { status: 403 }
      );
    }

    // Désactiver l'utilisateur (soft delete)
    await prisma.user.update({
      where: { id: id },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: "Utilisateur désactivé avec succès",
    });
  } catch (error) {
    console.error("DELETE /api/users/:id error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la désactivation de l'utilisateur" },
      { status: 500 }
    );
  }
}
