// app/clients/[id]/assign/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

import DeclarationComptable from "./declaration-comptable";

import { prisma } from "@/lib/prisma";

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

  return <DeclarationComptable session={session} client={client} />;
}
