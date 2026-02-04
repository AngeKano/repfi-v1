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

// ============================================================================
// TOP 10 CRÉANCES - Clients avec les créances les plus élevées
// Créance = CA TTC Total (débit 41*) - CA Encaissé TTC (crédit 41*)
// ============================================================================

interface TopCreance {
  numeroClient: string;
  nomClient: string;
  caTTCTotal: number;
  caEncaisseTTC: number;
  soldeCreance: number;
  pourcentageTotal: number;
}

async function recupererTop10Creances(
  dbName: string,
  batchIds: string[]
): Promise<TopCreance[]> {
  if (batchIds.length === 0) return [];

  // Requête pour récupérer les créances par client
  const data = await clickhouseClient.query({
    query: `
      WITH creances_clients AS (
        SELECT
          n_tiers AS numero_client,
          intitule_tiers AS nom_client,
          sum(debit) AS ca_ttc_total,
          sum(credit) AS ca_encaisse_ttc,
          sum(debit) - sum(credit) AS solde_creance
        FROM ${dbName}.grand_livre
        WHERE batch_id IN ({batchIds:Array(String)})
          AND startsWith(compte, '41')
          AND n_tiers != ''
          AND intitule_tiers != ''
        GROUP BY n_tiers, intitule_tiers
        HAVING solde_creance > 0
      )
      SELECT
        numero_client,
        nom_client,
        ca_ttc_total,
        ca_encaisse_ttc,
        solde_creance
      FROM creances_clients
      ORDER BY solde_creance DESC
      LIMIT 10
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    numero_client: string;
    nom_client: string;
    ca_ttc_total: string;
    ca_encaisse_ttc: string;
    solde_creance: string;
  }>;

  // Calculer le total des créances pour les pourcentages
  const totalCreances = rows.reduce(
    (sum, row) => sum + (parseFloat(row.solde_creance) || 0),
    0
  );

  return rows.map((row) => {
    const soldeCreance = parseFloat(row.solde_creance) || 0;
    return {
      numeroClient: row.numero_client,
      nomClient: row.nom_client,
      caTTCTotal: parseFloat(row.ca_ttc_total) || 0,
      caEncaisseTTC: parseFloat(row.ca_encaisse_ttc) || 0,
      soldeCreance,
      pourcentageTotal: totalCreances > 0 ? (soldeCreance / totalCreances) * 100 : 0,
    };
  });
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
      soldeCreances: cumulativeCaTTC - cumulativeCaEncaisse,
    };

    // Top 10 des créances clients
    const topCreances = await recupererTop10Creances(dbName, allBatchIds);

    // Calculer le total des créances pour les stats
    const totalCreances = topCreances.reduce((sum, c) => sum + c.soldeCreance, 0);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      endPeriod: `${endYear}-${endMonth.toString().padStart(2, "0")}`,
      endYear,
      endMonth,
      chartData,
      totals,
      periodRange: {
        start: last12Months[0],
        end: last12Months[last12Months.length - 1],
      },
      topCreances,
      totalCreances,
    });
  } catch (error) {
    console.error("Recouvrement API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données de recouvrement" },
      { status: 500 }
    );
  }
}
