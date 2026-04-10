import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import {
  CLIENTS_ACTIONS,
  MEMBRES_ACTIONS,
  FICHIERS_ACTIONS,
} from "@/lib/permissions/actions";

import DashboardClient from "./dashboard-client";

import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Verifier les permissions via le systeme RBAC
  const canViewAllClients = checkPermissionSync(
    session.user.role,
    CLIENTS_ACTIONS.VOIR_TOUS,
  );
  const canViewMembers = checkPermissionSync(
    session.user.role,
    MEMBRES_ACTIONS.VOIR,
  );
  const canViewFiles = checkPermissionSync(
    session.user.role,
    FICHIERS_ACTIONS.VOIR,
  );
  const canCreateClient =
    checkPermissionSync(session.user.role, CLIENTS_ACTIONS.CREER) &&
    session.user.companyPackType === "ENTREPRISE";

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

  // Recuperer les reportings financiers recents (ComptablePeriod)
  let recentReportings: any[] = [];
  if (canViewAllClients) {
    recentReportings = await prisma.comptablePeriod.findMany({
      where: {
        client: { companyId: session.user.companyId },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        client: { select: { id: true, name: true, email: true } },
        _count: { select: { files: true } },
      },
    });
  } else {
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: session.user.id },
      select: { clientId: true },
    });

    recentReportings = await prisma.comptablePeriod.findMany({
      where: {
        clientId: { in: assignments.map((a) => a.clientId) },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        client: { select: { id: true, name: true, email: true } },
        _count: { select: { files: true } },
      },
    });
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
      recentReportings={recentReportings}
      canViewMembers={canViewMembers}
      canCreateClient={canCreateClient}
    />
  );
}
