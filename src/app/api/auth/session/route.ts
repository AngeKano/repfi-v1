// app/api/auth/session/route.ts
/**
 * Route de session - Récupère la session active
 * Endpoint: GET /api/auth/session
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../[...nextauth]/route";
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    // Récupérer la session NextAuth
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Récupérer les infos complètes de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        companyId: true,
        lastLoginAt: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
            email: true,
            packType: true,
            companyType: true,
            website: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "Compte désactivé" }, { status: 403 });
    }

    // Compter les clients accessibles
    let accessibleClientsCount = 0;

    if (user.role === "ADMIN_ROOT" || user.role === "ADMIN") {
      // Admin voit tous les clients
      accessibleClientsCount = await prisma.client.count({
        where: { companyId: user.companyId },
      });
    } else {
      // User voit uniquement ses clients assignés
      accessibleClientsCount = await prisma.clientAssignment.count({
        where: { userId: user.id },
      });
    }

    return NextResponse.json({
      session: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          name:
            user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}`
              : user.email,
          role: user.role,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
        company: user.company,
        stats: {
          accessibleClientsCount,
        },
      },
    });
  } catch (error) {
    console.error("Session error:", error);

    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
