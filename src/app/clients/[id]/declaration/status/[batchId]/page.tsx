import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import StatusComponents from "./status";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import { FICHIERS_ACTIONS } from "@/lib/permissions/actions";
import { prisma } from "@/lib/prisma";
import { DashboardLayout } from "@/components/dashboard-layout";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Verifier permissions via RBAC
  const canViewFiles = checkPermissionSync(
    session.user.role,
    FICHIERS_ACTIONS.VOIR,
  );
  if (!canViewFiles) {
    redirect("/clients");
  }

  const { id, batchId } = await params;

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

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <Link href={`/clients/${client.id}`}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-[#D0E3F5] text-[#335890]"
            >
              <ChevronLeft className="w-4 h-4" />
              Retour au client
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#00122E]">
            Traitement du reporting
          </h1>
          <p className="text-sm text-[#335890] mt-1">{client.name}</p>
        </div>

        <StatusComponents
          params={Promise.resolve({ clientId: client.id, batchId })}
        />
      </div>
    </DashboardLayout>
  );
}
