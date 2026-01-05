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

// ============================================================================
// STRUCTURE OHADA - COMPTE DE RÉSULTAT (SYSCOHADA)
// ============================================================================

interface RubriquesOHADA {
  TA: number;
  TB: number;
  TC: number;
  TD: number;
  RA: number;
  RB: number;
  TE: number;
  TF: number;
  TG: number;
  TH: number;
  TI: number;
  RC: number;
  RD: number;
  RE: number;
  RF: number;
  RG: number;
  RH: number;
  RI: number;
  RJ: number;
  RK: number;
  TJ: number;
  RL: number;
  TK: number;
  TL: number;
  TM: number;
  RM: number;
  RN: number;
  TN: number;
  TO: number;
  RO: number;
  RP: number;
  RQ: number;
  RS: number;
}

interface SoldesIntermediairesGestion {
  XA: number;
  XB: number;
  XC: number;
  XD: number;
  XE: number;
  XF: number;
  XG: number;
  XH: number;
  XI: number;
}

interface IndicateursFinanciers {
  chiffreAffaires: number;
  masseSalariale: number;
  resultatExploitation: number;
  resultatNet: number;
  soldeTresorerie: number;
  margeCommerciale: number;
  valeurAjoutee: number;
  ebe: number;
  resultatFinancier: number;
  resultatHAO: number;
}

interface MonthlyDataExtended {
  month: string;
  monthLabel: string;
  monthNumber: string;
  charges: number;
  produits: number;
  resultat: number;
  cumulativeBalance: number;
  nbTransactions: number;
  // Nouvelles données mensuelles
  chiffreAffaires: number;
  chiffreAffairesN1: number;
  soldeTresorerie: number;
  soldeTresorerieN1: number;
  margeCommerciale: number;
  margeCommercialeN1: number;
}

const RUBRIQUES_VIDES: RubriquesOHADA = {
  TA: 0,
  TB: 0,
  TC: 0,
  TD: 0,
  RA: 0,
  RB: 0,
  TE: 0,
  TF: 0,
  TG: 0,
  TH: 0,
  TI: 0,
  RC: 0,
  RD: 0,
  RE: 0,
  RF: 0,
  RG: 0,
  RH: 0,
  RI: 0,
  RJ: 0,
  RK: 0,
  TJ: 0,
  RL: 0,
  TK: 0,
  TL: 0,
  TM: 0,
  RM: 0,
  RN: 0,
  TN: 0,
  TO: 0,
  RO: 0,
  RP: 0,
  RQ: 0,
  RS: 0,
};

async function recupererRubriquesParMois(
  dbName: string,
  batchIds: string[]
): Promise<Map<string, RubriquesOHADA>> {
  const result = new Map<string, RubriquesOHADA>();

  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 4, 2) as month,
        rubrique,
        sum(credit - debit) as solde
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND rubrique IN (
          'TA', 'TB', 'TC', 'TD',
          'RA', 'RB',
          'TE', 'TF', 'TG', 'TH', 'TI',
          'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ',
          'RK',
          'TJ', 'RL',
          'TK', 'TL', 'TM', 'RM', 'RN',
          'TN', 'TO', 'RO', 'RP',
          'RQ', 'RS'
        )
      GROUP BY month, rubrique
      ORDER BY month
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    month: string;
    rubrique: string;
    solde: string;
  }>;

  for (const row of rows) {
    if (!result.has(row.month)) {
      result.set(row.month, { ...RUBRIQUES_VIDES });
    }
    const rubriques = result.get(row.month)!;
    const key = row.rubrique as keyof RubriquesOHADA;
    if (key in rubriques) {
      rubriques[key] = parseFloat(row.solde) || 0;
    }
  }

  return result;
}

async function recupererTresorerieParMois(
  dbName: string,
  batchIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 4, 2) as month,
        sum(CASE WHEN startsWith(compte, '52') THEN debit - credit ELSE 0 END) +
        sum(CASE WHEN startsWith(compte, '57') THEN debit - credit ELSE 0 END) as solde_tresorerie
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
      GROUP BY month
      ORDER BY month
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    month: string;
    solde_tresorerie: string;
  }>;

  for (const row of rows) {
    result.set(row.month, parseFloat(row.solde_tresorerie) || 0);
  }

  return result;
}

async function recupererRubriques(
  dbName: string,
  batchIds: string[]
): Promise<RubriquesOHADA> {
  if (batchIds.length === 0) return { ...RUBRIQUES_VIDES };

  const data = await clickhouseClient.query({
    query: `
      SELECT
        rubrique,
        sum(credit - debit) as solde
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND rubrique IN (
          'TA', 'TB', 'TC', 'TD',
          'RA', 'RB',
          'TE', 'TF', 'TG', 'TH', 'TI',
          'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ',
          'RK',
          'TJ', 'RL',
          'TK', 'TL', 'TM', 'RM', 'RN',
          'TN', 'TO', 'RO', 'RP',
          'RQ', 'RS'
        )
      GROUP BY rubrique
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    rubrique: string;
    solde: string;
  }>;
  const rubriques = { ...RUBRIQUES_VIDES };

  for (const row of rows) {
    const key = row.rubrique as keyof RubriquesOHADA;
    if (key in rubriques) {
      rubriques[key] = parseFloat(row.solde) || 0;
    }
  }

  return rubriques;
}

async function recupererSoldeTresorerie(
  dbName: string,
  batchIds: string[]
): Promise<number> {
  if (batchIds.length === 0) return 0;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        sum(CASE WHEN startsWith(compte, '52') THEN debit - credit ELSE 0 END) as banques,
        sum(CASE WHEN startsWith(compte, '57') THEN debit - credit ELSE 0 END) as caisse
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as any[];
  const row = rows[0] || {};

  return (parseFloat(row.banques) || 0) + (parseFloat(row.caisse) || 0);
}

function calculerSIG(rubriques: RubriquesOHADA): SoldesIntermediairesGestion {
  const {
    TA,
    TB,
    TC,
    TD,
    RA,
    RB,
    TE,
    TF,
    TG,
    TH,
    TI,
    RC,
    RD,
    RE,
    RF,
    RG,
    RH,
    RI,
    RJ,
    RK,
    TJ,
    RL,
    TK,
    TL,
    TM,
    RM,
    RN,
    TN,
    TO,
    RO,
    RP,
    RQ,
    RS,
  } = rubriques;

  const XB = TA + TB + TC + TD;
  const XA = TA + RA + RB;
  const XC =
    XA +
    TB +
    TC +
    TD +
    TE +
    TF +
    TG +
    TH +
    TI +
    RC +
    RD +
    RE +
    RF +
    RG +
    RH +
    RI +
    RJ;
  const XD = XC + RK;
  const XE = XD + TJ + RL;
  const XF = TK + TL + TM + RM + RN;
  const XG = XE + XF;
  const XH = TN + TO + RO + RP;
  const XI = XG + XH + RQ + RS;

  return { XA, XB, XC, XD, XE, XF, XG, XH, XI };
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
      margeCommerciale: 0,
      valeurAjoutee: 0,
      ebe: 0,
      resultatFinancier: 0,
      resultatHAO: 0,
    };
  }

  const rubriques = await recupererRubriques(dbName, batchIds);
  const sig = calculerSIG(rubriques);
  const soldeTresorerie = await recupererSoldeTresorerie(dbName, batchIds);

  return {
    chiffreAffaires: sig.XB,
    masseSalariale: Math.abs(rubriques.RK),
    resultatExploitation: sig.XE,
    resultatNet: sig.XI,
    soldeTresorerie,
    margeCommerciale: sig.XA,
    valeurAjoutee: sig.XC,
    ebe: sig.XD,
    resultatFinancier: sig.XF,
    resultatHAO: sig.XH,
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
    const periodType = searchParams.get("periodType") || "year"; // year, month, ytd
    const selectedMonth = searchParams.get("month"); // 01-12

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

    // Données mensuelles détaillées N et N-1
    const rubriquesParMoisN = await recupererRubriquesParMois(dbName, batchIds);
    const rubriquesParMoisN1 = await recupererRubriquesParMois(
      dbName,
      batchIdsN1
    );
    const tresorerieParMoisN = await recupererTresorerieParMois(
      dbName,
      batchIds
    );
    const tresorerieParMoisN1 = await recupererTresorerieParMois(
      dbName,
      batchIdsN1
    );

    // Données mensuelles charges/produits
    let monthlyRows: any[] = [];
    if (batchIds.length > 0) {
      const monthlyData = await clickhouseClient.query({
        query: `
          SELECT 
            substring(date_transaction, 4, 2) as month,
            sum(CASE WHEN startsWith(compte, '6') THEN debit - credit ELSE 0 END) as charges,
            sum(CASE WHEN startsWith(compte, '7') THEN credit - debit ELSE 0 END) as produits,
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

    // Construction des données mensuelles étendues
    const allMonths: MonthlyDataExtended[] = [];
    let cumulativeBalance = 0;
    let cumulativeTresorerieN = 0;
    let cumulativeTresorerieN1 = 0;

    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, "0");
      const found = monthlyRows.find((r: any) => r.month === monthStr);

      const rubriquesN = rubriquesParMoisN.get(monthStr) || {
        ...RUBRIQUES_VIDES,
      };
      const rubriquesN1Mois = rubriquesParMoisN1.get(monthStr) || {
        ...RUBRIQUES_VIDES,
      };

      const sigN = calculerSIG(rubriquesN);
      const sigN1 = calculerSIG(rubriquesN1Mois);

      const tresoMoisN = tresorerieParMoisN.get(monthStr) || 0;
      const tresoMoisN1 = tresorerieParMoisN1.get(monthStr) || 0;

      cumulativeTresorerieN += tresoMoisN;
      cumulativeTresorerieN1 += tresoMoisN1;

      const charges = found ? parseFloat(found.charges) || 0 : 0;
      const produits = found ? parseFloat(found.produits) || 0 : 0;
      const resultat = produits - charges;
      cumulativeBalance += resultat;

      allMonths.push({
        month: `${year}${monthStr}`,
        monthLabel: monthNames[m - 1],
        monthNumber: monthStr,
        charges,
        produits,
        resultat,
        cumulativeBalance,
        nbTransactions: found ? parseInt(found.nb_transactions) || 0 : 0,
        chiffreAffaires: sigN.XB,
        chiffreAffairesN1: sigN1.XB,
        soldeTresorerie: cumulativeTresorerieN,
        soldeTresorerieN1: cumulativeTresorerieN1,
        margeCommerciale: sigN.XA,
        margeCommercialeN1: sigN1.XA,
      });
    }

    // Filtrage selon le type de période
    let filteredMonths = allMonths;
    let monthsToIncludeN: string[] = [];
    let monthsToIncludeN1: string[] = [];

    if (periodType === "month" && selectedMonth) {
      filteredMonths = allMonths.filter((m) => m.monthNumber === selectedMonth);
      monthsToIncludeN = [selectedMonth];
      monthsToIncludeN1 = [selectedMonth];
    } else if (periodType === "ytd" && selectedMonth) {
      const endMonth = parseInt(selectedMonth);
      filteredMonths = allMonths.filter(
        (m) => parseInt(m.monthNumber) <= endMonth
      );
      monthsToIncludeN = filteredMonths.map((m) => m.monthNumber);
      monthsToIncludeN1 = monthsToIncludeN;
    } else {
      monthsToIncludeN = allMonths.map((m) => m.monthNumber);
      monthsToIncludeN1 = monthsToIncludeN;
    }

    // Calcul des indicateurs selon la période
    const calculerIndicateursPeriode = (
      rubriquesParMois: Map<string, RubriquesOHADA>,
      tresorerieParMois: Map<string, number>,
      monthsToInclude: string[]
    ): IndicateursFinanciers => {
      const rubriquesAgregees = { ...RUBRIQUES_VIDES };
      let tresorerieTotal = 0;

      for (const month of monthsToInclude) {
        const rubriques = rubriquesParMois.get(month);
        if (rubriques) {
          for (const key of Object.keys(
            rubriquesAgregees
          ) as (keyof RubriquesOHADA)[]) {
            rubriquesAgregees[key] += rubriques[key];
          }
        }
        tresorerieTotal += tresorerieParMois.get(month) || 0;
      }

      const sig = calculerSIG(rubriquesAgregees);

      return {
        chiffreAffaires: sig.XB,
        masseSalariale: Math.abs(rubriquesAgregees.RK),
        resultatExploitation: sig.XE,
        resultatNet: sig.XI,
        soldeTresorerie: tresorerieTotal,
        margeCommerciale: sig.XA,
        valeurAjoutee: sig.XC,
        ebe: sig.XD,
        resultatFinancier: sig.XF,
        resultatHAO: sig.XH,
      };
    };

    const indicateursN = calculerIndicateursPeriode(
      rubriquesParMoisN,
      tresorerieParMoisN,
      monthsToIncludeN
    );
    const indicateursN1 = calculerIndicateursPeriode(
      rubriquesParMoisN1,
      tresorerieParMoisN1,
      monthsToIncludeN1
    );

    // Calcul des variations (%)
    const calculerVariation = (n: number, n1: number): number =>
      n1 !== 0 ? ((n - n1) / Math.abs(n1)) * 100 : n !== 0 ? 100 : 0;

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
      margeCommerciale: calculerVariation(
        indicateursN.margeCommerciale,
        indicateursN1.margeCommerciale
      ),
      valeurAjoutee: calculerVariation(
        indicateursN.valeurAjoutee,
        indicateursN1.valeurAjoutee
      ),
      ebe: calculerVariation(indicateursN.ebe, indicateursN1.ebe),
      resultatFinancier: calculerVariation(
        indicateursN.resultatFinancier,
        indicateursN1.resultatFinancier
      ),
      resultatHAO: calculerVariation(
        indicateursN.resultatHAO,
        indicateursN1.resultatHAO
      ),
    };

    // Périodes enrichies
    const periods = await Promise.all(
      postgresPeriodsData.map(async (pgPeriod) => {
        let stats = { charges: 0, produits: 0, nb_transactions: 0 };
        if (pgPeriod.batchId) {
          try {
            const statsData = await clickhouseClient.query({
              query: `
                SELECT 
                  sum(CASE WHEN startsWith(compte, '6') THEN debit - credit ELSE 0 END) as charges,
                  sum(CASE WHEN startsWith(compte, '7') THEN credit - debit ELSE 0 END) as produits,
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

    const totals = filteredMonths.reduce(
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
      yearN1: yearN1.toString(),
      periodType,
      selectedMonth,
      availableYears: availableYears.length > 0 ? availableYears : [year],
      monthly: allMonths,
      filteredMonthly: filteredMonths,
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
