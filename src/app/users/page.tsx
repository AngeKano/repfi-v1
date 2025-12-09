// app/users/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

import UsersListClient from "./users-list-client";

import { prisma } from "@/lib/prisma";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; role?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  const page = parseInt(params.page || "1");
  const limit = 20;
  const search = params.search || "";
  const role = params.role || "";

  const skip = (page - 1) * limit;

  // Construction du where
  let whereClause: any = {
    companyId: session.user.companyId,
  };

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

  // Récupérer les données
  const [total, users] = await Promise.all([
    prisma.user.count({ where: whereClause }),
    prisma.user.findMany({
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
    }),
  ]);

  const pagination = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };

  return (
    <UsersListClient
      session={session}
      initialUsers={users}
      pagination={pagination}
      initialSearch={search}
      initialRole={role}
    />
  );
}
