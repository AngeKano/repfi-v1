import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "../../../../auth/[...nextauth]/route";

import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { batchId } = await params;

    const period = await prisma.comptablePeriod.findUnique({
      where: { batchId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyId: true,
          },
        },
        files: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            status: true,
            processingStatus: true,
          },
        },
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Période non trouvée" },
        { status: 404 }
      );
    }

    if (period.client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    const totalFiles = period.files.length;
    const processedFiles = period.files.filter(
      (f) => f.processingStatus === "COMPLETED"
    ).length;
    const progress = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0;

    return NextResponse.json({
      batchId: period.batchId,
      status: period.status,
      progress: Math.round(progress),
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      processedAt: period.processedAt?.toISOString(),
      files: period.files,
    });
  } catch (error) {
    console.error("GET status error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du statut" },
      { status: 500 }
    );
  }
}
