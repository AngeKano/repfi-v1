// app/clients/[id]/assign/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

import DeclarationComptable from "./create-component";

import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function DeclarationComptablePage({
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
                  Ajouter des documents
                </h1>
                <p className="text-sm text-gray-500">{client.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>
      <DeclarationComptable session={session} client={client} />
    </div>
  );
}
