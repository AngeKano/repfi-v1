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

interface IndicateursFinanciers {
  chiffreAffaires: number;
  masseSalariale: number;
  resultatExploitation: number;
  resultatNet: number;
  soldeTresorerie: number;
}

async function calculerIndicateurs(
  dbName: string,
  batchIds: string[]
): Promise<IndicateursFinanciers> {
  if (batchIds.length === 0) {
    return {
      chiffreAffaires: 0,
      masseSalariale: 0,
      resultatExploitation: 0,
      resultatNet: 0,
      soldeTresorerie: 0,
    };
  }

  const data = await clickhouseClient.query({
    query: `
      SELECT
        -- Chiffre d'affaires: rubriques TA, TB, TC, TD
        sum(CASE WHEN rubrique IN ('TA', 'TB', 'TC', 'TD') THEN credit - debit ELSE 0 END) as chiffre_affaires,
        
        -- Masse salariale: rubrique RK
        ABS(sum(CASE WHEN rubrique = 'RK' THEN credit - debit ELSE 0 END)) as masse_salariale,
        
        -- Valeur Ajoutée pour calcul Rex
        sum(CASE WHEN rubrique IN ('TA', 'TB', 'TC', 'TD', 'TE', 'TF', 'TG', 'TH') THEN credit - debit ELSE 0 END)
        - ABS(sum(CASE WHEN rubrique IN ('RA', 'RB', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH') THEN credit - debit ELSE 0 END)) as valeur_ajoutee,
        
        -- Composants Rex: RK, TJ, RL
        sum(CASE WHEN rubrique IN ('RK', 'TJ', 'RL') THEN credit - debit ELSE 0 END) as composant_rex,
        
        --------------------------------------------------------------
        -- Résultat Financier

        -- Produit financier: TK, TL, TM
        sum(CASE WHEN rubrique IN ('TK', 'TL', 'TM') THEN credit - debit ELSE 0 END) as produit_financier,
        -- Charges financieres: RM, RN
        sum(CASE WHEN rubrique IN ('RM', 'RN') THEN credit - debit ELSE 0 END) as charges_financieres,


    --------------------------------------------------------------
        -- Résultat HAO

        -- Produit HAO: TO, TN
        sum(CASE WHEN rubrique IN ('TO', 'TN') THEN credit - debit ELSE 0 END) as produit_HAO,
        -- Charges HAO: RO, RP
        sum(CASE WHEN rubrique IN ('RO', 'RP') THEN credit - debit ELSE 0 END) as charges_HAO,

    --------------------------------------------------------------
      
        -- Composant RN: RQ, RS
        sum(CASE WHEN rubrique IN ('RQ', 'RS') THEN credit - debit ELSE 0 END) as composant_rn,
        
        -- Solde Trésorerie: comptes 52 et 57
        -(sum(CASE WHEN substring(compte, 1, 2) = '57' THEN credit - debit ELSE 0 END))
        -(sum(CASE WHEN substring(compte, 1, 2) = '52' THEN credit - debit ELSE 0 END)) as solde_tresorerie
        
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as any[];
  const row = rows[0] || {};

  const chiffreAffaires = parseFloat(row.chiffre_affaires) || 0;
  const masseSalariale = parseFloat(row.masse_salariale) || 0;
  const valeurAjoutee = parseFloat(row.valeur_ajoutee) || 0;
  const composantRex = parseFloat(row.composant_rex) || 0;
 

  // Resultat NET = Résultat Exploitation + Résultat Financier + Résultat HAO + Composant RN
  // const resultatFinancier = parseFloat(row.resultat_financier) || 0;
  // const resultatHAO = parseFloat(row.resultat_hao) || 0;

  const composantRN = parseFloat(row.composant_rn) || 0;

  const soldeTresorerie = parseFloat(row.solde_tresorerie) || 0;

  const resultatExploitation = valeurAjoutee + composantRex;

  

  // RESULTAT HAO
  const produitHAO = parseFloat(row.produit_HAO) || 0;
  const chargesHAO = parseFloat(row.charges_HAO) || 0;
  const resultatHAO = produitHAO + chargesHAO;


// RESULTAT NET
const produitFinancier = parseFloat(row.produit_financier) || 0;
const chargesFinancieres = parseFloat(row.charges_financieres) || 0;
const resultatFinancier = produitFinancier + chargesFinancieres;
const resultatNet = resultatFinancier + resultatHAO + composantRN;


  return {
    chiffreAffaires,
    masseSalariale,
    resultatExploitation,
    resultatNet,
    soldeTresorerie,
  };
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
    const year =
      searchParams.get("year") || new Date().getFullYear().toString();

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
    const yearN = parseInt(year);
    const yearN1 = yearN - 1;

    // Périodes année N
    const postgresPeriodsData = await prisma.comptablePeriod.findMany({
      where: {
        clientId: id,
        periodStart: {
          gte: new Date(`${yearN}-01-01`),
          lt: new Date(`${yearN + 1}-01-01`),
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

    // Périodes année N-1
    const postgresPeriodsN1 = await prisma.comptablePeriod.findMany({
      where: {
        clientId: id,
        periodStart: {
          gte: new Date(`${yearN1}-01-01`),
          lt: new Date(`${yearN}-01-01`),
        },
      },
      select: { batchId: true },
    });

    // Années disponibles
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

    const batchIds = postgresPeriodsData
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);
    const batchIdsN1 = postgresPeriodsN1
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);

    // Calcul des indicateurs N et N-1
    const indicateursN = await calculerIndicateurs(dbName, batchIds);
    const indicateursN1 = await calculerIndicateurs(dbName, batchIdsN1);

    // Calcul des variations (%)
    const calculerVariation = (n: number, n1: number) =>
      n1 !== 0 ? ((n - n1) / Math.abs(n1)) * 100 : 0;

    const variations = {
      chiffreAffaires: calculerVariation(
        indicateursN.chiffreAffaires,
        indicateursN1.chiffreAffaires
      ),
      masseSalariale: calculerVariation(
        indicateursN.masseSalariale,
        indicateursN1.masseSalariale
      ),
      resultatExploitation: calculerVariation(
        indicateursN.resultatExploitation,
        indicateursN1.resultatExploitation
      ),
      resultatNet: calculerVariation(
        indicateursN.resultatNet,
        indicateursN1.resultatNet
      ),
      soldeTresorerie: calculerVariation(
        indicateursN.soldeTresorerie,
        indicateursN1.soldeTresorerie
      ),
    };

    // Données mensuelles
    let monthlyRows: any[] = [];
    if (batchIds.length > 0) {
      const monthlyData = await clickhouseClient.query({
        query: `
          SELECT 
            substring(date_transaction, 4, 2) as month,
            sum(CASE WHEN substring(compte, 1, 1) = '6' THEN debit ELSE 0 END) as charges,
            sum(CASE WHEN substring(compte, 1, 1) = '7' THEN credit ELSE 0 END) as produits,
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

    const monthNames = [
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

    let cumulativeBalance = 0;
    const monthlyWithCumulative = allMonths.map((row) => {
      const resultat = row.produits - row.charges;
      cumulativeBalance += resultat;
      return { ...row, resultat, cumulativeBalance };
    });

    // Périodes enrichies
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
            if (statsRows.length > 0) stats = statsRows[0];
          } catch (e) {
            console.error("Stats error:", e);
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
      indicateurs: {
        anneeN: indicateursN,
        anneeN1: indicateursN1,
        variations,
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
