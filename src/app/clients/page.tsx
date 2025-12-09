// app/clients/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

import ClientsListClient from "./clients-list-client";

import { prisma } from "@/lib/prisma";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; type?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  const page = parseInt(params.page || "1");
  const limit = 20;
  const search = params.search || "";
  const companyType = params.type || "";

  const skip = (page - 1) * limit;

  // ✅ Appeler Prisma directement (pas de fetch)
  let whereClause: any = {
    companyId: session.user.companyId,
  };

  // Si USER, filtrer par assignments
  if (session.user.role === "USER") {
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: session.user.id },
      select: { clientId: true },
    });

    whereClause.id = {
      in: assignments.map((a) => a.clientId),
    };
  }

  // Filtres
  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { denomination: { contains: search, mode: "insensitive" } },
    ];
  }

  if (companyType) {
    whereClause.companyType = companyType;
  }

  // Récupérer les données
  const [total, clients] = await Promise.all([
    prisma.client.count({ where: whereClause }),
    prisma.client.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        website: true,
        companyType: true,
        denomination: true,
        description: true,
        isSelfEntity: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            normalFiles: true,
            assignments: true,
          },
        },
      },
    }),
  ]);

  // Récupérer membres assignés (si admin)
  let clientsWithMembers = clients;
  if (session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN") {
    clientsWithMembers = await Promise.all(
      clients.map(async (client) => {
        const assignments = await prisma.clientAssignment.findMany({
          where: { clientId: client.id },
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

        return {
          ...client,
          assignedMembers: assignments.map((a) => a.user),
        };
      })
    );
  }

  const pagination = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };

  return (
    <ClientsListClient
      session={session}
      initialClients={clientsWithMembers}
      pagination={pagination}
      initialSearch={search}
      initialType={companyType}
    />
  );
}
