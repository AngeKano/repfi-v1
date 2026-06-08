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
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

// Génère les mois de Janvier (01) jusqu'au mois sélectionné, dans l'année
// sélectionnée uniquement. Pas de débordement sur l'année précédente.
//   - endMonth = 12 → 12 mois (Jan → Déc)
//   - endMonth = 3  → 3 mois  (Jan → Mar)
function getYearToDateMonths(
  endYear: number,
  endMonth: number,
): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];

  for (let m = 1; m <= endMonth; m++) {
    months.push({
      year: endYear,
      month: m,
      label: `${MONTH_NAMES[m - 1]} ${endYear}`,
    });
  }

  return months;
}

async function recupererRecouvrementParYearMonth(
  dbName: string,
  batchIds: string[],
): Promise<Map<string, { caTTCTotal: number; caEncaisseTTC: number }>> {
  const result = new Map<
    string,
    { caTTCTotal: number; caEncaisseTTC: number }
  >();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 7, 4) as year,
        substring(date_transaction, 4, 2) as month,
        sum(CASE WHEN startsWith(compte, '41') AND NOT startsWith(compte, '418') AND NOT startsWith(compte, '419') THEN debit ELSE 0 END) as ca_ttc_total,
        sum(CASE WHEN startsWith(compte, '41') AND NOT startsWith(compte, '418') AND NOT startsWith(compte, '419') THEN credit ELSE 0 END) as ca_encaisse_ttc
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
// Créance = Créances Clients TTC (débit 41* hors 418/419) - Encaissements Clients TTC (crédit 41* hors 418/419)
// Le filtre période est défini par (startYear, startMonth) → (endYear, endMonth).
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
  batchIds: string[],
  endYear?: number,
  endMonth?: number,
  startYear?: number,
  startMonth?: number,
): Promise<TopCreance[]> {
  if (batchIds.length === 0) return [];

  // Filtre période borné par (startYear, startMonth) → (endYear, endMonth).
  // Si startYear/startMonth absent, on prend Janvier de l'année de fin (YTD).
  // date_transaction format: DD/MM/YYYY → year=substr(7,4), month=substr(4,2),
  // donc on compare sur la concat YYYYMM (= substr(7,4) || substr(4,2)).
  let periodFilter = "";
  const queryParams: Record<string, unknown> = { batchIds };

  if (endYear && endMonth) {
    const effectiveStartYear = startYear ?? endYear;
    const effectiveStartMonth = startMonth ?? 1;
    queryParams.startYM = `${effectiveStartYear}${effectiveStartMonth.toString().padStart(2, "0")}`;
    queryParams.endYM = `${endYear}${endMonth.toString().padStart(2, "0")}`;
    periodFilter = `
      AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) >= {startYM:String}
      AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) <= {endYM:String}
    `;
  }

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
          AND NOT startsWith(compte, '418')
          AND NOT startsWith(compte, '419')
          AND n_tiers != ''
          AND intitule_tiers != ''
          ${periodFilter}
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
    query_params: queryParams,
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
    0,
  );

  return rows.map((row) => {
    const soldeCreance = parseFloat(row.solde_creance) || 0;
    return {
      numeroClient: row.numero_client,
      nomClient: row.nom_client,
      caTTCTotal: parseFloat(row.ca_ttc_total) || 0,
      caEncaisseTTC: parseFloat(row.ca_encaisse_ttc) || 0,
      soldeCreance,
      pourcentageTotal:
        totalCreances > 0 ? (soldeCreance / totalCreances) * 100 : 0,
    };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    // Mois de début optionnel (format: YYYY-MM). Si absent → Janvier de endYear (YTD)
    const startPeriod = searchParams.get("startPeriod");

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

    let startYear: number | undefined;
    let startMonth: number | undefined;
    if (startPeriod) {
      const [yearStr, monthStr] = startPeriod.split("-");
      startYear = parseInt(yearStr);
      startMonth = parseInt(monthStr);
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
        { status: 403 },
      );
    }

    const dbName = getClickhouseDbName(id);

    // Générer les mois Janvier → mois sélectionné de l'année courante uniquement
    const ytdMonths = getYearToDateMonths(endYear, endMonth);

    // Récupérer toutes les périodes disponibles pour ce client
    const allPeriods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true, periodStart: true },
    });

    const allBatchIds = allPeriods
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);

    // Récupérer les données de recouvrement
    const recouvrementData = await recupererRecouvrementParYearMonth(
      dbName,
      allBatchIds,
    );

    // Construire les données du graphique
    const chartData: RecouvrementDataPoint[] = [];
    let cumulativeCaTTC = 0;
    let cumulativeCaEncaisse = 0;

    for (const monthInfo of ytdMonths) {
      const key = `${monthInfo.year}-${monthInfo.month.toString().padStart(2, "0")}`;
      const data = recouvrementData.get(key) || {
        caTTCTotal: 0,
        caEncaisseTTC: 0,
      };

      cumulativeCaTTC += data.caTTCTotal;
      cumulativeCaEncaisse += data.caEncaisseTTC;

      const tauxRecouvrement =
        data.caTTCTotal !== 0
          ? (data.caEncaisseTTC / data.caTTCTotal) * 100
          : 0;

      const tauxRecouvrementCumule =
        cumulativeCaTTC !== 0
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
      tauxRecouvrement:
        cumulativeCaTTC !== 0
          ? (cumulativeCaEncaisse / cumulativeCaTTC) * 100
          : 0,
      soldeCreances: cumulativeCaTTC - cumulativeCaEncaisse,
    };

    // Top 10 des créances clients (filtré par la période sélectionnée)
    const topCreances = await recupererTop10Creances(
      dbName,
      allBatchIds,
      endYear,
      endMonth,
      startYear,
      startMonth,
    );

    // Calculer le total des créances pour les stats
    const totalCreances = topCreances.reduce(
      (sum, c) => sum + c.soldeCreance,
      0,
    );

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      endPeriod: `${endYear}-${endMonth.toString().padStart(2, "0")}`,
      endYear,
      endMonth,
      chartData,
      totals,
      periodRange: {
        start: ytdMonths[0],
        end: ytdMonths[ytdMonths.length - 1],
      },
      topCreances,
      totalCreances,
    });
  } catch (error) {
    console.error("Recouvrement API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données de recouvrement" },
      { status: 500 },
    );
  }
}
