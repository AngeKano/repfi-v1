// app/api/users/route.ts
/**
 * Routes Utilisateurs
 * GET /api/users - Liste des membres
 * POST /api/users - Ajouter un membre
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

// Schéma de validation pour la création
const createUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  firstName: z.string().min(2).max(100).optional(),
  lastName: z.string().min(2).max(100).optional(),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});

/**
 * GET /api/users
 * Liste des membres de l'entreprise
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
    const role = searchParams.get("role");
    const isActive = searchParams.get("isActive");

    const skip = (page - 1) * limit;

    // Construction du where
    let whereClause: any = {
      companyId: session.user.companyId,
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
      { status: 500 }
    );
  }
}

/**
 * POST /api/users
 * Ajouter un nouveau membre
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les admins peuvent créer des utilisateurs
    if (session.user.role !== "ADMIN_ROOT" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }
    // NEW
    // Vérifier le pack ENTREPRISE pour ajouter des membres
    // if (session.user.companyPackType !== 'ENTREPRISE') {
    //   return NextResponse.json(
    //     {
    //       error: 'Cette fonctionnalité nécessite le pack ENTREPRISE',
    //     },
    //     { status: 403 }
    //   );
    // }

    const body = await req.json();
    const data = createUserSchema.parse(body);

    // ADMIN ne peut pas créer d'ADMIN_ROOT
    if (session.user.role === "ADMIN" && data.role === "ADMIN") {
      return NextResponse.json(
        { error: "Vous ne pouvez pas créer un administrateur" },
        { status: 403 }
      );
    }

    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 409 }
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Créer l'utilisateur
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        companyId: session.user.companyId,
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
        user,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/users error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erreur lors de l'ajout du membre" },
      { status: 500 }
    );
  }
}
