// app/clients/[id]/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import { CLIENTS_ACTIONS } from "@/lib/permissions/actions";

import ClientDetailsClient from "./client-details-client";

import { prisma } from "@/lib/prisma";

export default async function ClientDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const { id } = await params;

  // ✅ Vérifier l'accès au client
  const client = await prisma.client.findFirst({
    where: {
      id,
      companyId: session.user.companyId,
    },
    include: {
      socialNetworks: true,
      createdBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      assignments: {
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
      },
      normalFiles: {
        where: { deletedAt: null },
        orderBy: { uploadedAt: "desc" },
        take: 10,
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          uploadedAt: true,
          uploadedBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      comptablePeriods: {
        orderBy: { periodStart: "desc" },
        take: 5,
        include: {
          files: {
            select: {
              id: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              uploadedAt: true,
              uploadedBy: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          normalFiles: {
            where: { deletedAt: null },
          },
          comptablePeriods: true,
          assignments: true,
        },
      },
    },
  });

  // Client non trouve
  if (!client) {
    redirect("/clients");
  }

  // Verifier les permissions RBAC
  const canViewAllClients = checkPermissionSync(session.user.role, CLIENTS_ACTIONS.VOIR_TOUS);
  const canEdit = checkPermissionSync(session.user.role, CLIENTS_ACTIONS.MODIFIER);
  const canDelete = checkPermissionSync(session.user.role, CLIENTS_ACTIONS.DESACTIVER);
  const canAssignMembers = checkPermissionSync(session.user.role, CLIENTS_ACTIONS.ASSIGNER_MEMBRE);

  // Si l'utilisateur ne peut pas voir tous les clients, verifier qu'il est assigne
  if (!canViewAllClients) {
    const assignment = await prisma.clientAssignment.findFirst({
      where: {
        clientId: id,
        userId: session.user.id,
      },
    });

    if (!assignment) {
      redirect("/clients");
    }
  }

  // Formater les données pour le composant client
  const clientData = {
    ...client,
    assignedMembers: client.assignments.map((a) => a.user),
    recentFiles: client.normalFiles,
    stats: {
      totalFiles: client._count.normalFiles || 0,
      totalMembers: client._count.assignments || 0,
      totalComptablePeriods: client._count.comptablePeriods || 0,
    },
  };

  return (
    <ClientDetailsClient
      session={session}
      initialClient={clientData}
      canEdit={canEdit}
      canDelete={canDelete}
      canAssignMembers={canAssignMembers}
    />
  );
}
