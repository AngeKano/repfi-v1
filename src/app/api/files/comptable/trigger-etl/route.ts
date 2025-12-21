// app/api/files/comptable/trigger-etl/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { prisma } from "@/lib/prisma";
import { ProcessingStatus } from "../../../../../../prisma/generated/prisma/enums";

const triggerETLSchema = z.object({
  batchId: z.string().uuid(),
});

async function triggerAirflowDAG(
  batchId: string,
  clientId: string,
  s3Prefix: string
): Promise<string> {
  const airflowUrl = process.env.AIRFLOW_API_URL;
  const airflowUsername = process.env.AIRFLOW_USERNAME;
  const airflowPassword = process.env.AIRFLOW_PASSWORD;

  if (!airflowUrl || !airflowUsername || !airflowPassword) {
    throw new Error("Configuration Airflow manquante");
  }

  const basicAuth = Buffer.from(
    `${airflowUsername}:${airflowPassword}`
  ).toString("base64");

  const response = await fetch(
    `${airflowUrl}/api/v1/dags/etl_comptable_clickhouse/dagRuns`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conf: {
          client_id: clientId,
          batch_id: batchId,
          s3_prefix: s3Prefix,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Airflow: ${error.detail || response.statusText}`);
  }

  const data = await response.json();
  return data.dag_run_id;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { batchId } = triggerETLSchema.parse(body);

    const comptablePeriod = await prisma.comptablePeriod.findUnique({
      where: { batchId },
      include: {
        client: {
          select: { id: true, name: true, companyId: true },
        },
      },
    });

    if (!comptablePeriod) {
      return NextResponse.json(
        { error: "Période comptable non trouvée" },
        { status: 404 }
      );
    }

    if (comptablePeriod.client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    if (comptablePeriod.status === ProcessingStatus.PROCESSING) {
      return NextResponse.json(
        { error: "Période déjà en cours de traitement" },
        { status: 409 }
      );
    }

    if (comptablePeriod.status === ProcessingStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Période déjà traitée" },
        { status: 409 }
      );
    }

    const overlapping = await prisma.comptablePeriod.findFirst({
      where: {
        clientId: comptablePeriod.clientId,
        status: ProcessingStatus.PROCESSING,
        id: { not: comptablePeriod.id },
        AND: [
          { periodStart: { lte: comptablePeriod.periodEnd } },
          { periodEnd: { gte: comptablePeriod.periodStart } },
        ],
      },
    });

    if (overlapping) {
      return NextResponse.json(
        { error: "Période chevauchante en cours" },
        { status: 409 }
      );
    }

    const files = await prisma.comptableFile.findMany({
      where: { batchId },
    });

    if (files.length !== 5) {
      return NextResponse.json(
        { error: `Fichiers invalides: ${files.length}/5` },
        { status: 400 }
      );
    }

    const year = comptablePeriod.periodStart.getFullYear();
    const formatDate = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
        d.getDate()
      ).padStart(2, "0")}`;

    const clientName = comptablePeriod.client.name
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");
    const companyId = comptablePeriod.client.companyId;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, id: true },
    });
    const companyName = company
      ? company.name.replace(/\s+/g, "_").replace(/[^\w\-]/g, "")
      : "";
    const periodFolder = `periode-${formatDate(
      comptablePeriod.periodStart
    )}-${formatDate(comptablePeriod.periodEnd)}`;
    const s3Prefix = `${companyName}_${companyId}/${clientName}_${comptablePeriod.clientId}/declaration/${year}/${periodFolder}/`;

    const dagRunId = await triggerAirflowDAG(
      batchId,
      comptablePeriod.client.id,
      s3Prefix
    );

    await prisma.comptablePeriod.update({
      where: { id: comptablePeriod.id },
      data: { status: ProcessingStatus.PROCESSING },
    });

    await prisma.comptableFile.updateMany({
      where: { batchId },
      data: { processingStatus: ProcessingStatus.PROCESSING },
    });

    for (const file of files) {
      await prisma.comptableFileHistory.create({
        data: {
          fileId: file.id,
          fileName: file.fileName,
          action: "ETL_TRIGGERED",
          details: `DAG Run: ${dagRunId}`,
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });
    }

    return NextResponse.json({
      message: "ETL déclenché",
      batchId,
      dagRunId,
      status: ProcessingStatus.PROCESSING,
      s3Prefix,
    });
  } catch (error: any) {
    console.error("Trigger ETL error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erreur ETL", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    const processingPeriods = await prisma.comptablePeriod.findMany({
      where: {
        client: { companyId: session.user.companyId },
        ...(clientId && { clientId }),
        status: {
          in: [
            ProcessingStatus.PENDING,
            ProcessingStatus.PROCESSING,
            ProcessingStatus.VALIDATING,
          ],
        },
      },
      include: {
        client: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ processingPeriods });
  } catch (error) {
    console.error("GET error:", error);
    return NextResponse.json(
      { error: "Erreur récupération périodes" },
      { status: 500 }
    );
  }
}
