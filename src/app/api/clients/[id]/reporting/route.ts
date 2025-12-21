import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";

const clickhouseClient = createClickhouseClient({
  url: `http://${process.env.CLICKHOUSE_HOST}:8123`,
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

function getClickhouseDbName(id: string): string {
  const cleanId = id.replace(/[^a-zA-Z0-9]/g, "_");
  return `repfi_${cleanId}`;
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
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    if (client.companyId !== session.user.companyId) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const dbName = getClickhouseDbName(id);

    // 1. Récupérer les périodes depuis PostgreSQL pour cette année
    const postgresPeriodsData = await prisma.comptablePeriod.findMany({
      where: {
        clientId: id,
        periodStart: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${parseInt(year) + 1}-01-01`),
        },
      },
      select: {
        id: true,
        batchId: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        excelFileUrl: true,
      },
      orderBy: { periodStart: "asc" },
    });

    // 2. Années disponibles depuis PostgreSQL
    const availableYearsData = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { periodStart: true },
      distinct: ["periodStart"],
    });

    const availableYears = [
      ...new Set(
        availableYearsData.map((p) => p.periodStart.getFullYear().toString())
      ),
    ].sort((a, b) => parseInt(b) - parseInt(a));

    // 3. Récupérer les batch_ids des périodes PostgreSQL
    const batchIds = postgresPeriodsData
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);

    // 4. Données agrégées par mois depuis ClickHouse (filtré par batch_ids)
    // Classe 6 = Charges (dépenses), Classe 7 = Produits (revenus)
    let monthlyRows: any[] = [];

    if (batchIds.length > 0) {
      const monthlyData = await clickhouseClient.query({
        query: `
          SELECT 
            substring(date_transaction, 4, 2) as month,
            -- Charges (classe 6) = Dépenses
            sum(CASE WHEN substring(compte, 1, 1) = '6' THEN debit ELSE 0 END) as charges,
            -- Produits (classe 7) = Revenus
            sum(CASE WHEN substring(compte, 1, 1) = '7' THEN credit ELSE 0 END) as produits,
            -- Nombre de transactions
            count(*) as nb_transactions
          FROM ${dbName}.grand_livre
          WHERE batch_id IN ({batchIds:Array(String)})
          GROUP BY month
          ORDER BY month
        `,
        query_params: { batchIds },
        format: "JSONEachRow",
      });

      monthlyRows = (await monthlyData.json()) as any[];
    }

    console.log("Monthly data from ClickHouse:", monthlyRows);

    // 5. Créer tous les mois (même vides)
    const monthNames = [
      "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
      "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
    ];

    const allMonths = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, "0");
      const found = monthlyRows.find((r: any) => r.month === monthStr);

      allMonths.push({
        month: `${year}${monthStr}`,
        monthLabel: monthNames[m - 1],
        charges: found ? parseFloat(found.charges) || 0 : 0,
        produits: found ? parseFloat(found.produits) || 0 : 0,
        nbTransactions: found ? parseInt(found.nb_transactions) || 0 : 0,
      });
    }

    // 6. Calculer solde cumulé (Résultat = Produits - Charges)
    let cumulativeBalance = 0;
    const monthlyWithCumulative = allMonths.map((row) => {
      const resultat = row.produits - row.charges;
      cumulativeBalance += resultat;
      return {
        ...row,
        resultat,
        cumulativeBalance,
      };
    });

    // 7. Enrichir les périodes PostgreSQL avec stats ClickHouse
    const periods = await Promise.all(
      postgresPeriodsData.map(async (pgPeriod) => {
        let stats = { charges: 0, produits: 0, nb_transactions: 0 };

        if (pgPeriod.batchId) {
          try {
            const statsData = await clickhouseClient.query({
              query: `
                SELECT 
                  sum(CASE WHEN substring(compte, 1, 1) = '6' THEN debit ELSE 0 END) as charges,
                  sum(CASE WHEN substring(compte, 1, 1) = '7' THEN credit ELSE 0 END) as produits,
                  count(*) as nb_transactions
                FROM ${dbName}.grand_livre
                WHERE batch_id = {batchId:String}
              `,
              query_params: { batchId: pgPeriod.batchId },
              format: "JSONEachRow",
            });
            const statsRows = (await statsData.json()) as any[];
            if (statsRows.length > 0) {
              stats = statsRows[0];
            }
          } catch (e) {
            console.error("Stats error for batch:", pgPeriod.batchId, e);
          }
        }

        return {
          id: pgPeriod.id,
          batch_id: pgPeriod.batchId,
          periodStart: pgPeriod.periodStart,
          periodEnd: pgPeriod.periodEnd,
          status: pgPeriod.status,
          excelFileUrl: pgPeriod.excelFileUrl,
          charges: parseFloat(stats.charges as any) || 0,
          produits: parseFloat(stats.produits as any) || 0,
          nb_transactions: stats.nb_transactions || 0,
        };
      })
    );

    // 8. Totaux
    const totals = monthlyWithCumulative.reduce(
      (acc, row) => ({
        totalCharges: acc.totalCharges + row.charges,
        totalProduits: acc.totalProduits + row.produits,
        totalTransactions: acc.totalTransactions + row.nbTransactions,
      }),
      { totalCharges: 0, totalProduits: 0, totalTransactions: 0 }
    );

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      year,
      availableYears: availableYears.length > 0 ? availableYears : [year],
      monthly: monthlyWithCumulative,
      periods,
      totals: {
        ...totals,
        resultat: totals.totalProduits - totals.totalCharges,
      },
    });
  } catch (error) {
    console.error("Reporting API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données" },
      { status: 500 }
    );
  }
}