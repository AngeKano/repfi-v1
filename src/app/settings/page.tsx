import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import { ENTREPRISE_ACTIONS } from "@/lib/permissions/actions";

import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const canViewCompany = checkPermissionSync(
    session.user.role,
    ENTREPRISE_ACTIONS.VOIR_INFOS,
  );

  return <SettingsClient session={session} canViewCompany={canViewCompany} />;
}
