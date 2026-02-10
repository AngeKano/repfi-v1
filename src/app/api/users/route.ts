// app/api/users/route.ts
/**
 * Routes Utilisateurs
 * GET /api/users - Liste des membres
 * POST /api/users - Ajouter un membre
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  getMappedRole,
  canManageRole,
  RoleId,
  MEMBRES_ACTIONS,
} from "@/lib/permissions";

// Liste des rôles disponibles pour la création
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

// Schéma de validation pour la création
const createUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  firstName: z.string().min(2).max(100).optional(),
  lastName: z.string().min(2).max(100).optional(),
  role: z.enum(availableRoles).default("LOADER"),
});

/**
 * GET /api/users
 * Liste des membres de l'entreprise
 */
export async function GET(req: NextRequest) {
  try {
    // Vérifier la permission de voir les membres
    const permissionResult = await requirePermission(MEMBRES_ACTIONS.VOIR);
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role");
    const isActive = searchParams.get("isActive");

    const skip = (page - 1) * limit;

    // Construction du where
    const whereClause: Record<string, unknown> = {
      companyId: user.companyId,
    };

    // Filtres
    if (search) {
      whereClause.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role) {
      whereClause.role = role;
    }

    if (isActive !== null) {
      whereClause.isActive = isActive === "true";
    }

    // Compter le total
    const total = await prisma.user.count({ where: whereClause });

    // Récupérer les utilisateurs
    const users = await prisma.user.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            clientAssignments: true,
            normalFiles: true,
          },
        },
      },
    });

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des utilisateurs" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/users
 * Ajouter un nouveau membre
 */
export async function POST(req: NextRequest) {
  try {
    // Vérifier la permission de créer un membre
    const permissionResult = await requirePermission(MEMBRES_ACTIONS.CREER);
    if (permissionResult instanceof NextResponse) {
      return permissionResult;
    }
    const { user } = permissionResult;

    const body = await req.json();
    const data = createUserSchema.parse(body);

    // Vérifier que l'utilisateur peut créer un membre avec ce rôle
    const creatorRole = getMappedRole(user.role);
    const targetRole = getMappedRole(data.role);

    // On ne peut créer que des rôles de niveau inférieur au sien
    if (!canManageRole(creatorRole, targetRole)) {
      return NextResponse.json(
        {
          error:
            "Vous ne pouvez pas créer un membre avec un rôle supérieur ou égal au vôtre",
        },
        { status: 403 },
      );
    }

    // Empêcher la création d'ADMIN_ROOT
    if (targetRole === RoleId.ADMIN_ROOT) {
      return NextResponse.json(
        { error: "Impossible de créer un administrateur root" },
        { status: 403 },
      );
    }

    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 409 },
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Créer l'utilisateur
    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        companyId: user.companyId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Membre ajouté avec succès",
        user: newUser,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("POST /api/users error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Erreur lors de l'ajout du membre" },
      { status: 500 },
    );
  }
}
