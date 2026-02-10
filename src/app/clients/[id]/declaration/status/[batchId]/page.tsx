import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import StatusComponents from "./status";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import { FICHIERS_ACTIONS } from "@/lib/permissions/actions";
import { prisma } from "@/lib/prisma";

export default async function StatusPage({
  params,
}: {
  params: { id: string; batchId: string };
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href={`/clients/${client.id}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Statut du Traitement ETL
                </h1>
                <p className="text-sm text-gray-500">{client.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>
      <StatusComponents
        params={Promise.resolve({ clientId: client.id, batchId })}
      />
    </div>
  );
}
