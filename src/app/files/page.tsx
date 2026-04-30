import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { checkPermissionSync } from "@/lib/permissions/middleware";
import {
  CLIENTS_ACTIONS,
  FICHIERS_ACTIONS,
} from "@/lib/permissions/actions";
import { prisma } from "@/lib/prisma";
import FilesListClient from "./files-list-client";

export default async function FilesPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const canViewFiles = checkPermissionSync(
    session.user.role,
    FICHIERS_ACTIONS.VOIR,
  );

  if (!canViewFiles) {
    redirect("/dashboard");
  }

  const canViewAllClients = checkPermissionSync(
    session.user.role,
    CLIENTS_ACTIONS.VOIR_TOUS,
  );

  let files: any[] = [];
  let availableClients: { id: string; name: string; email: string }[] = [];

  if (canViewAllClients) {
    files = await prisma.normalFile.findMany({
      where: {
        client: { companyId: session.user.companyId },
        deletedAt: null,
      },
      orderBy: { uploadedAt: "desc" },
      take: 50,
      include: {
        client: { select: { name: true, email: true } },
        uploadedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    availableClients = await prisma.client.findMany({
      where: { companyId: session.user.companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
  } else {
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: session.user.id },
      include: {
        client: { select: { id: true, name: true, email: true } },
      },
      orderBy: { assignedAt: "desc" },
    });

    const clientIds = assignments.map((a) => a.clientId);

    files = await prisma.normalFile.findMany({
      where: {
        clientId: { in: clientIds },
        deletedAt: null,
      },
      orderBy: { uploadedAt: "desc" },
      take: 50,
      include: {
        client: { select: { name: true, email: true } },
        uploadedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    availableClients = assignments
      .map((a) => a.client)
      .filter(
        (c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx,
      );
  }

  return (
    <FilesListClient
      files={files}
      session={session}
      availableClients={availableClients}
    />
  );
}
