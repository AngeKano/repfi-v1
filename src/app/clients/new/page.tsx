// app/clients/new/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import { CLIENTS_ACTIONS } from "@/lib/permissions/actions";
import NewClientForm from "./new-client-form";

export default async function NewClientPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Vérifier la permission de créer un client
  const canCreate = checkPermissionSync(session.user.role, CLIENTS_ACTIONS.CREER);

  if (!canCreate) {
    redirect("/clients?error=permission_denied");
  }

  // Vérifier aussi le pack type (ENTREPRISE requis)
  if (session.user.companyPackType !== "ENTREPRISE") {
    redirect("/clients?error=pack_required");
  }

  return <NewClientForm />;
}
