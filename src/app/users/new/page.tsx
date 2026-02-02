// app/users/new/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync, getMappedRole } from "@/lib/permissions/middleware";
import { MEMBRES_ACTIONS } from "@/lib/permissions/actions";
import { RoleId, ROLES, canManageRole } from "@/lib/permissions/roles";
import NewUserForm from "./new-user-form";

export default async function NewUserPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Verifier la permission de creer un membre
  const canCreate = checkPermissionSync(session.user.role, MEMBRES_ACTIONS.CREER);

  if (!canCreate) {
    redirect("/users?error=permission_denied");
  }

  // Determiner les roles que l'utilisateur peut creer (roles inferieurs uniquement)
  const userRole = getMappedRole(session.user.role);
  const availableRoles = Object.values(ROLES)
    .filter((role) => canManageRole(userRole, role.id))
    .map((role) => ({
      value: role.id,
      label: role.title,
      description: role.description,
    }));

  return <NewUserForm availableRoles={availableRoles} />;
}
