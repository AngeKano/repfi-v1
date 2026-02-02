// app/users/[id]/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync, getMappedRole } from "@/lib/permissions/middleware";
import { MEMBRES_ACTIONS } from "@/lib/permissions/actions";
import { ROLES, canManageRole } from "@/lib/permissions/roles";

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

  // Verifier les permissions via RBAC
  const isSelf = id === session.user.id;
  const canViewMembers = checkPermissionSync(session.user.role, MEMBRES_ACTIONS.VOIR);
  const canEditMembers = checkPermissionSync(session.user.role, MEMBRES_ACTIONS.MODIFIER);
  const canDeactivateMembers = checkPermissionSync(session.user.role, MEMBRES_ACTIONS.DESACTIVER);
  const canCreateMembers = checkPermissionSync(session.user.role, MEMBRES_ACTIONS.CREER);

  // L'utilisateur peut voir s'il a la permission ou si c'est lui-meme
  if (!canViewMembers && !isSelf) {
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

  // Determiner les roles disponibles pour la modification
  const currentUserRole = getMappedRole(session.user.role);
  const targetUserRole = getMappedRole(user.role);

  // Peut editer si: a la permission ET (est admin OU c'est soi-meme)
  const canEdit = (canEditMembers || isSelf);

  // Peut desactiver si: a la permission ET n'est pas soi-meme ET l'utilisateur n'est pas ADMIN_ROOT
  const canDeactivate = canDeactivateMembers && !isSelf && user.role !== "ADMIN_ROOT";

  // Peut changer le role si: peut creer des membres ET peut gerer le role cible
  const canChangeRole = canCreateMembers && canManageRole(currentUserRole, targetUserRole);

  // Roles disponibles: seulement ceux que l'utilisateur peut gerer
  const availableRoles = Object.values(ROLES)
    .filter((role) => canManageRole(currentUserRole, role.id))
    .map((role) => ({
      value: role.id,
      label: role.title,
    }));

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
      canEdit={canEdit}
      canDeactivate={canDeactivate}
      canChangeRole={canChangeRole}
      availableRoles={availableRoles}
      isSelf={isSelf}
    />
  );
}
