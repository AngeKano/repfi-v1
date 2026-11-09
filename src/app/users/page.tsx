// app/users/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync, getMappedRole } from "@/lib/permissions/middleware";
import { CLIENTS_ACTIONS, MEMBRES_ACTIONS } from "@/lib/permissions/actions";
import { hasPermission } from "@/lib/permissions/matrix";
import { ROLES, RoleId, canManageRole } from "@/lib/permissions/roles";
import type { InfoRole, MembreLigne } from "./types";

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

  // La liste des membres suit le droit « Voir les membres » de la matrice.
  const can = (action: Parameters<typeof checkPermissionSync>[1]) =>
    checkPermissionSync(session.user.role, action);
  if (!can(MEMBRES_ACTIONS.VOIR)) {
    redirect("/dashboard");
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

  const droits = {
    peutCreer: can(MEMBRES_ACTIONS.CREER),
    peutActiver: can(MEMBRES_ACTIONS.ACTIVER),
    peutAssigner: can(CLIENTS_ACTIONS.ASSIGNER_MEMBRE),
    peutRetirer: can(CLIENTS_ACTIONS.RETIRER_MEMBRE),
  };

  // Récupérer les données
  const [total, users, dossiers] = await Promise.all([
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
    // Dossiers attribuables depuis les fenêtres de création et de modification.
    prisma.client.findMany({
      where: { companyId: session.user.companyId },
      select: { id: true, name: true, denomination: true, isSelfEntity: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pagination = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };

  // Rôles : description et accès aux dossiers (d'office pour les administrateurs).
  const infosRoles: Record<string, InfoRole> = Object.fromEntries(
    Object.values(ROLES).map((r) => [
      r.id,
      {
        id: r.id,
        description: r.description,
        voitTousLesDossiers: hasPermission(r.id, CLIENTS_ACTIONS.VOIR_TOUS),
      },
    ]),
  );
  // On ne donne qu'un rôle de niveau inférieur au sien, jamais Administrateur Principal.
  const acteur = getMappedRole(session.user.role);
  const rolesAttribuables = Object.values(ROLES)
    .filter((r) => r.id !== RoleId.ADMIN_ROOT && canManageRole(acteur, r.id))
    .sort((a, b) => a.level - b.level)
    .map((r) => r.id);

  // Ce que l'utilisateur connecté peut faire sur chaque membre (mêmes règles que
  // l'API /api/users/:id).
  const peutModifierMembres = can(MEMBRES_ACTIONS.MODIFIER);
  const membres: MembreLigne[] = users.map((u) => {
    const roleMembre = getMappedRole(u.role);
    const estMoi = u.id === session.user.id;
    const hierarchie = canManageRole(acteur, roleMembre);
    return {
      ...u,
      voitTousLesDossiers: hasPermission(roleMembre, CLIENTS_ACTIONS.VOIR_TOUS),
      estMoi,
      // Un pair de même rôle n'est pas modifiable : seulement soi-même ou un rôle inférieur.
      peutModifier: estMoi || (peutModifierMembres && hierarchie),
      peutChangerRole: !estMoi && droits.peutCreer && hierarchie,
      peutChangerStatut: !estMoi && peutModifierMembres && hierarchie,
      peutDesactiver:
        !estMoi &&
        can(MEMBRES_ACTIONS.DESACTIVER) &&
        hierarchie &&
        roleMembre !== RoleId.ADMIN_ROOT,
    };
  });

  return (
    <UsersListClient
      session={session}
      initialUsers={membres}
      pagination={pagination}
      initialSearch={search}
      initialRole={role}
      droits={droits}
      infosRoles={infosRoles}
      rolesAttribuables={rolesAttribuables}
      dossiers={dossiers}
    />
  );
}
