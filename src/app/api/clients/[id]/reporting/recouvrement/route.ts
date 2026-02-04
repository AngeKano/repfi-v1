import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";

const clickhouseClient = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

function getClickhouseDbName(id: string): string {
  const cleanId = id.replace(/[^a-zA-Z0-9]/g, "_");
  return `repfi_${cleanId}`;
}

interface RecouvrementDataPoint {
  label: string;
  period: string;
  yearMonth: string;
  caTTCTotal: number;
  caEncaisseTTC: number;
  tauxRecouvrement: number;
  cumulativeCaTTC: number;
  cumulativeCaEncaisse: number;
  tauxRecouvrementCumule: number;
}

const MONTH_NAMES = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc"
];

// Génère les 12 derniers mois à partir d'un mois/année donné (inclus)
function getLast12Months(endYear: number, endMonth: number): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];

  let currentYear = endYear;
  let currentMonth = endMonth;

  for (let i = 0; i < 12; i++) {
    months.unshift({
      year: currentYear,
      month: currentMonth,
      label: `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`
    });

    currentMonth--;
    if (currentMonth === 0) {
      currentMonth = 12;
      currentYear--;
    }
  }

  return months;
}

async function recupererRecouvrementParYearMonth(
  dbName: string,
  batchIds: string[]
): Promise<Map<string, { caTTCTotal: number; caEncaisseTTC: number }>> {
  const result = new Map<string, { caTTCTotal: number; caEncaisseTTC: number }>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 7, 4) as year,
        substring(date_transaction, 4, 2) as month,
        sum(CASE WHEN startsWith(compte, '41') THEN debit ELSE 0 END) as ca_ttc_total,
        sum(CASE WHEN startsWith(compte, '41') THEN credit ELSE 0 END) as ca_encaisse_ttc
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
      GROUP BY year, month
      ORDER BY year, month
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    year: string;
    month: string;
    ca_ttc_total: string;
    ca_encaisse_ttc: string;
  }>;

  for (const row of rows) {
    const key = `${row.year}-${row.month}`;
    result.set(key, {
      caTTCTotal: parseFloat(row.ca_ttc_total) || 0,
      caEncaisseTTC: parseFloat(row.ca_encaisse_ttc) || 0,
    });
  }

  return result;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);

    // Mois de fin sélectionné (format: YYYY-MM)
    const endPeriod = searchParams.get("endPeriod");

    let endYear: number;
    let endMonth: number;

    if (endPeriod) {
      const [yearStr, monthStr] = endPeriod.split("-");
      endYear = parseInt(yearStr);
      endMonth = parseInt(monthStr);
    } else {
      // Par défaut: mois courant
      const now = new Date();
      endYear = now.getFullYear();
      endMonth = now.getMonth() + 1;
    }

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    if (client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    const dbName = getClickhouseDbName(id);

    // Générer les 12 derniers mois
    const last12Months = getLast12Months(endYear, endMonth);

    // Récupérer toutes les périodes disponibles pour ce client
    const allPeriods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true, periodStart: true },
    });

    const allBatchIds = allPeriods
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);

    // Récupérer les données de recouvrement
    const recouvrementData = await recupererRecouvrementParYearMonth(dbName, allBatchIds);

    // Construire les données du graphique
    const chartData: RecouvrementDataPoint[] = [];
    let cumulativeCaTTC = 0;
    let cumulativeCaEncaisse = 0;

    for (const monthInfo of last12Months) {
      const key = `${monthInfo.year}-${monthInfo.month.toString().padStart(2, "0")}`;
      const data = recouvrementData.get(key) || { caTTCTotal: 0, caEncaisseTTC: 0 };

      cumulativeCaTTC += data.caTTCTotal;
      cumulativeCaEncaisse += data.caEncaisseTTC;

      const tauxRecouvrement = data.caTTCTotal !== 0
        ? (data.caEncaisseTTC / data.caTTCTotal) * 100
        : 0;

      const tauxRecouvrementCumule = cumulativeCaTTC !== 0
        ? (cumulativeCaEncaisse / cumulativeCaTTC) * 100
        : 0;

      chartData.push({
        label: monthInfo.label,
        period: `${monthInfo.year}${monthInfo.month.toString().padStart(2, "0")}`,
        yearMonth: key,
        caTTCTotal: data.caTTCTotal,
        caEncaisseTTC: data.caEncaisseTTC,
        tauxRecouvrement,
        cumulativeCaTTC,
        cumulativeCaEncaisse,
        tauxRecouvrementCumule,
      });
    }

    // Calculer les totaux sur la période
    const totals = {
      caTTCTotal: cumulativeCaTTC,
      caEncaisseTTC: cumulativeCaEncaisse,
      tauxRecouvrement: cumulativeCaTTC !== 0
        ? (cumulativeCaEncaisse / cumulativeCaTTC) * 100
        : 0,
    };

    // Récupérer les années/mois disponibles pour le sélecteur
    const availableMonths = allPeriods
      .map((p) => {
        const date = new Date(p.periodStart);
        return {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
          value: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`
        };
      })
      .filter((v, i, a) => a.findIndex((t) => t.value === v.value) === i)
      .sort((a, b) => b.value.localeCompare(a.value));

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      endPeriod: `${endYear}-${endMonth.toString().padStart(2, "0")}`,
      chartData,
      totals,
      availableMonths,
      periodRange: {
        start: last12Months[0],
        end: last12Months[last12Months.length - 1],
      },
    });
  } catch (error) {
    console.error("Recouvrement API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données de recouvrement" },
      { status: 500 }
    );
  }
}
