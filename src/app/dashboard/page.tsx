// app/dashboard/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

import DashboardClient from "./dashboard-client";

import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Récupérer les stats
  let clientsCount = 0;
  let filesCount = 0;
  let membersCount = 0;

  if (session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN") {
    // Admin voit tout
    clientsCount = await prisma.client.count({
      where: { companyId: session.user.companyId },
    });

    filesCount = await prisma.normalFile.count({
      where: {
        client: { companyId: session.user.companyId },
        deletedAt: null,
      },
    });

    membersCount = await prisma.user.count({
      where: { companyId: session.user.companyId },
    });
  } else {
    // User voit seulement ses clients
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: session.user.id },
      include: { client: true },
    });

    clientsCount = assignments.length;

    filesCount = await prisma.normalFile.count({
      where: {
        clientId: { in: assignments.map((a) => a.clientId) },
        deletedAt: null,
      },
    });
  }

  // Récupérer les clients récents
  let recentClients;
  if (session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN") {
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

  // Récupérer les fichiers récents
  let recentFiles;
  if (session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN") {
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
    />
  );
}
