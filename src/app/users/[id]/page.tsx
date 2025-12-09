// app/users/[id]/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

import UserDetailsClient from "./user-details-client";

import { prisma } from "@/lib/prisma";

export default async function UserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const { id } = await params;

  // Vérifier l'accès
  const isAdmin =
    session.user.role === "ADMIN_ROOT" || session.user.role === "ADMIN";
  const isSelf = id === session.user.id;

  if (!isAdmin && !isSelf) {
    redirect("/users");
  }

  // Récupérer l'utilisateur
  const user = await prisma.user.findFirst({
    where: {
      id,
      companyId: session.user.companyId,
    },
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
    redirect("/users");
  }

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

  // Retirer le mot de passe
  const { password, ...userWithoutPassword } = user;

  return (
    <UserDetailsClient
      session={session}
      user={{
        ...userWithoutPassword,
        clientAssignments: clientAssignments.map((a) => ({
          ...a.client,
          assignedAt: a.assignedAt,
        })),
      }}
      isAdmin={isAdmin}
      isSelf={isSelf}
    />
  );
}
