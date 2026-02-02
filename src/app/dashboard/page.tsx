// app/dashboard/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import { CLIENTS_ACTIONS, MEMBRES_ACTIONS, FICHIERS_ACTIONS } from "@/lib/permissions/actions";

import DashboardClient from "./dashboard-client";

import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Verifier les permissions via le systeme RBAC
  const canViewAllClients = checkPermissionSync(session.user.role, CLIENTS_ACTIONS.VOIR_TOUS);
  const canViewMembers = checkPermissionSync(session.user.role, MEMBRES_ACTIONS.VOIR);
  const canViewFiles = checkPermissionSync(session.user.role, FICHIERS_ACTIONS.VOIR);
  const canCreateClient = checkPermissionSync(session.user.role, CLIENTS_ACTIONS.CREER)
    && session.user.companyPackType === "ENTREPRISE";

  // Recuperer les stats
  let clientsCount = 0;
  let filesCount = 0;
  let membersCount = 0;

  if (canViewAllClients) {
    // L'utilisateur peut voir tous les clients
    clientsCount = await prisma.client.count({
      where: { companyId: session.user.companyId },
    });

    if (canViewFiles) {
      filesCount = await prisma.normalFile.count({
        where: {
          client: { companyId: session.user.companyId },
          deletedAt: null,
        },
      });
    }

    if (canViewMembers) {
      membersCount = await prisma.user.count({
        where: { companyId: session.user.companyId },
      });
    }
  } else {
    // L'utilisateur voit seulement ses clients assignes
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: session.user.id },
      include: { client: true },
    });

    clientsCount = assignments.length;

    if (canViewFiles) {
      filesCount = await prisma.normalFile.count({
        where: {
          clientId: { in: assignments.map((a) => a.clientId) },
          deletedAt: null,
        },
      });
    }
  }

  // Recuperer les clients recents
  let recentClients;
  if (canViewAllClients) {
    recentClients = await prisma.client.findMany({
      where: { companyId: session.user.companyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        companyType: true,
        isSelfEntity: true,
        createdAt: true,
      },
    });
  } else {
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: session.user.id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            companyType: true,
            isSelfEntity: true,
            createdAt: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
      take: 5,
    });
    recentClients = assignments.map((a) => a.client);
  }

  // Recuperer les fichiers recents (seulement si l'utilisateur peut voir les fichiers)
  let recentFiles: any[] = [];
  if (canViewFiles) {
    if (canViewAllClients) {
      recentFiles = await prisma.normalFile.findMany({
        where: {
          client: { companyId: session.user.companyId },
          deletedAt: null,
        },
        orderBy: { uploadedAt: "desc" },
        take: 5,
        include: {
          client: { select: { name: true } },
          uploadedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });
    } else {
      const assignments = await prisma.clientAssignment.findMany({
        where: { userId: session.user.id },
      });

      recentFiles = await prisma.normalFile.findMany({
        where: {
          clientId: { in: assignments.map((a) => a.clientId) },
          deletedAt: null,
        },
        orderBy: { uploadedAt: "desc" },
        take: 5,
        include: {
          client: { select: { name: true } },
          uploadedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });
    }
  }

  const stats = {
    clientsCount,
    filesCount,
    membersCount,
  };

  return (
    <DashboardClient
      session={session}
      stats={stats}
      recentClients={recentClients}
      recentFiles={recentFiles}
      canViewMembers={canViewMembers}
      canCreateClient={canCreateClient}
    />
  );
}
