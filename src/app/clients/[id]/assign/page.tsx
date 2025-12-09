// app/clients/[id]/assign/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

import ClientAssignmentClient from "./client-assignment-client";

import { prisma } from "@/lib/prisma";

export default async function ClientAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Vérifier permissions (admin uniquement)
  if (session.user.role === "USER") {
    redirect("/clients");
  }

  const { id } = await params;

  // Récupérer le client
  const client = await prisma.client.findFirst({
    where: {
      id,
      companyId: session.user.companyId,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!client) {
    redirect("/clients");
  }

  // Récupérer les membres assignés
  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId: id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  // Récupérer les membres disponibles (non assignés et actifs)
  const assignedUserIds = assignments.map((a) => a.userId);

  const availableMembers = await prisma.user.findMany({
    where: {
      companyId: session.user.companyId,
      isActive: true,
      id: { notIn: assignedUserIds },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
    orderBy: { email: "asc" },
  });

  return (
    <ClientAssignmentClient
      session={session}
      client={client}
      initialAssignments={assignments}
      availableMembers={availableMembers}
    />
  );
}
