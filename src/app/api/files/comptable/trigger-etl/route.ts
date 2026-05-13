// app/api/files/comptable/trigger-etl/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/permissions/middleware";
import { FICHIERS_ACTIONS } from "@/lib/permissions/actions";

import { prisma } from "@/lib/prisma";
import { ProcessingStatus } from "../../../../../../prisma/generated/prisma/enums";

const triggerETLSchema = z.object({
  batchId: z.string().uuid(),
});

async function triggerAirflowDAG(
  batchId: string,
  clientId: string,
  s3Prefix: string,
): Promise<string> {
  const airflowUrl = process.env.AIRFLOW_API_URL;
  const airflowUsername = process.env.AIRFLOW_USERNAME;
  const airflowPassword = process.env.AIRFLOW_PASSWORD;

  if (!airflowUrl || !airflowUsername || !airflowPassword) {
    throw new Error("Configuration Airflow manquante");
  }

  const basicAuth = Buffer.from(
    `${airflowUsername}:${airflowPassword}`,
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
    },
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
    // Verifier la permission de charger des fichiers (requis pour declencher l'ETL)
    const permResult = await requirePermission(FICHIERS_ACTIONS.CHARGER);
    if (permResult instanceof NextResponse) {
      return permResult;
    }
    const { user } = permResult;

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
        { status: 404 },
      );
    }

    if (comptablePeriod.client.companyId !== user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 },
      );
    }

    if (comptablePeriod.status === ProcessingStatus.PROCESSING) {
      return NextResponse.json(
        { error: "Période déjà en cours de traitement" },
        { status: 409 },
      );
    }

    if (comptablePeriod.status === ProcessingStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Période déjà traitée" },
        { status: 409 },
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
        { status: 409 },
      );
    }

    const files = await prisma.comptableFile.findMany({
      where: { batchId },
    });

    const hasPnm = files.some((f) => f.fileType === "PNM");
    const excelFiles = files.filter((f) => f.fileType !== "PNM");

    // Si pas de PNM, on attend strictement les 4 fichiers Excel.
    if (!hasPnm && excelFiles.length !== 4) {
      return NextResponse.json(
        {
          error: `Fichiers invalides : ${excelFiles.length}/4 fichiers Excel`,
        },
        { status: 400 },
      );
    }

    const formatDate = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
        d.getDate(),
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

    // Construit le préfixe S3 d'une période donnée.
    const buildS3Prefix = (period: {
      periodStart: Date;
      periodEnd: Date;
    }): string => {
      const periodYear = period.periodStart.getFullYear();
      const periodFolder = `periode-${formatDate(period.periodStart)}-${formatDate(period.periodEnd)}`;
      return `${companyName}_${companyId}/${clientName}_${comptablePeriod.clientId}/declaration/${periodYear}/${periodFolder}/`;
    };

    let s3Prefix = buildS3Prefix(comptablePeriod);
    let fakeFromPeriodId: string | null = null;

    // MODE DÉMO : un PNM dans le batch déclenche un "faux" traitement —
    // Airflow est appelé avec le s3Prefix de la dernière période COMPLETED
    // de ce client, pas avec le préfixe de la nouvelle période. Les fichiers
    // qu'on vient d'uploader ne sont donc pas traités, mais le pipeline
    // tourne et la nouvelle période recevra des données.
    if (hasPnm) {
      const previousCompleted = await prisma.comptablePeriod.findFirst({
        where: {
          clientId: comptablePeriod.clientId,
          status: ProcessingStatus.COMPLETED,
          id: { not: comptablePeriod.id },
        },
        orderBy: { periodEnd: "desc" },
        select: { id: true, periodStart: true, periodEnd: true },
      });

      if (previousCompleted) {
        s3Prefix = buildS3Prefix(previousCompleted);
        fakeFromPeriodId = previousCompleted.id;
      } else {
        // Pas de période antérieure traitée : on marque simplement COMPLETED
        // sans appeler Airflow (rien à rejouer).
        await prisma.comptablePeriod.update({
          where: { id: comptablePeriod.id },
          data: { status: ProcessingStatus.COMPLETED },
        });
        await prisma.comptableFile.updateMany({
          where: { batchId },
          data: { processingStatus: ProcessingStatus.COMPLETED },
        });
        return NextResponse.json({
          message:
            "Fichier PNM enregistré (aucune période antérieure à rejouer pour ce client).",
          batchId,
          status: ProcessingStatus.COMPLETED,
          skipped: true,
        });
      }
    }

    const dagRunId = await triggerAirflowDAG(
      batchId,
      comptablePeriod.client.id,
      s3Prefix,
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
          details: fakeFromPeriodId
            ? `DAG Run: ${dagRunId} — mode démo, rejoué depuis la période ${fakeFromPeriodId}`
            : `DAG Run: ${dagRunId}`,
          userId: user.id,
          userEmail: user.email ?? "",
        },
      });
    }

    return NextResponse.json({
      message: fakeFromPeriodId
        ? "ETL déclenché en mode démo (rejouer des données d'une période antérieure)"
        : "ETL déclenché",
      batchId,
      dagRunId,
      status: ProcessingStatus.PROCESSING,
      s3Prefix,
      fakeFromPeriodId,
    });
  } catch (error: any) {
    console.error("Trigger ETL error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Erreur ETL", details: error.message },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Verifier la permission de voir les fichiers
    const permResult = await requirePermission(FICHIERS_ACTIONS.VOIR);
    if (permResult instanceof NextResponse) {
      return permResult;
    }
    const { user } = permResult;

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    const processingPeriods = await prisma.comptablePeriod.findMany({
      where: {
        client: { companyId: user.companyId },
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
      { status: 500 },
    );
  }
}
