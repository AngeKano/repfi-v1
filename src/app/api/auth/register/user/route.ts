import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  getMappedRole,
  canManageRole,
  ENTREPRISE_ACTIONS,
} from "@/lib/permissions";

// Route sans appelant dans l'application (les membres se créent par POST /api/users)
// et qui était ouverte à tous, pour n'importe quelle entreprise et n'importe quel rôle.
export async function POST(request: Request) {
  try {
    const permission = await requirePermission(ENTREPRISE_ACTIONS.CREER_COMPTE);
    if (permission instanceof NextResponse) return permission;
    const { user: sessionUser } = permission;

    const body = await request.json();
    const { email, password, name, companyId, role = "user" } = body;

    // Validation des champs obligatoires
    if (!email || !password || !name || !companyId) {
      return NextResponse.json(
        { error: "Tous les champs obligatoires doivent être remplis" },
        { status: 400 },
      );
    }

    // Uniquement dans sa propre entreprise, pour un rôle inférieur au sien.
    if (
      companyId !== sessionUser.companyId ||
      !canManageRole(getMappedRole(sessionUser.role), getMappedRole(role))
    ) {
      return NextResponse.json(
        { error: "Entreprise ou rôle non autorisé" },
        { status: 403 },
      );
    }

    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 400 },
      );
    }

    // Vérifier que l'entreprise existe
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Entreprise introuvable" },
        { status: 404 },
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Créer l'utilisateur
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: name, // Enregistre le prénom dans "firstName"
        companyId,
        role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "Utilisateur créé avec succès",
        user,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de la création de l'utilisateur" },
      { status: 500 },
    );
  }
}
