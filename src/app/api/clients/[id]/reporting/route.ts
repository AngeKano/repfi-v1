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
  tauxRecouvrement: number;
  caTTCTotal: number;
  caEncaisseTTC: number;
}

interface DataPoint {
  label: string;
  period: string;
  periodNumber: string;
  charges: number;
  produits: number;
  resultat: number;
  cumulativeBalance: number;
  nbTransactions: number;
  chiffreAffaires: number;
  chiffreAffairesN1: number;
  soldeTresorerie: number;
  soldeTresorerieN1: number;
  margeCommerciale: number;
  margeCommercialeN1: number;
  tauxRecouvrement: number;
  tauxRecouvrementN1: number;
  caTTCTotal: number;
  caEncaisseTTC: number;
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

const RUBRIQUES_LIST = [
  "TA",
  "TB",
  "TC",
  "TD",
  "RA",
  "RB",
  "TE",
  "TF",
  "TG",
  "TH",
  "TI",
  "RC",
  "RD",
  "RE",
  "RF",
  "RG",
  "RH",
  "RI",
  "RJ",
  "RK",
  "TJ",
  "RL",
  "TK",
  "TL",
  "TM",
  "RM",
  "RN",
  "TN",
  "TO",
  "RO",
  "RP",
  "RQ",
  "RS",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

async function recupererRubriquesParMois(
  dbName: string,
  batchIds: string[]
): Promise<Map<string, RubriquesOHADA>> {
  const result = new Map<string, RubriquesOHADA>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 4, 2) as period,
        rubrique,
        sum(credit - debit) as solde
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND rubrique IN ({rubriques:Array(String)})
      GROUP BY period, rubrique
      ORDER BY period
    `,
    query_params: { batchIds, rubriques: RUBRIQUES_LIST },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    rubrique: string;
    solde: string;
  }>;

  for (const row of rows) {
    if (!result.has(row.period)) {
      result.set(row.period, { ...RUBRIQUES_VIDES });
    }
    const rubriques = result.get(row.period)!;
    const key = row.rubrique as keyof RubriquesOHADA;
    if (key in rubriques) {
      rubriques[key] = parseFloat(row.solde) || 0;
    }
  }

  return result;
}

async function recupererRubriquesParJour(
  dbName: string,
  batchIds: string[],
  monthFilter: string
): Promise<Map<string, RubriquesOHADA>> {
  const result = new Map<string, RubriquesOHADA>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 1, 2) as period,
        rubrique,
        sum(credit - debit) as solde
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND substring(date_transaction, 4, 2) = {monthFilter:String}
        AND rubrique IN ({rubriques:Array(String)})
      GROUP BY period, rubrique
      ORDER BY period
    `,
    query_params: { batchIds, monthFilter, rubriques: RUBRIQUES_LIST },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    rubrique: string;
    solde: string;
  }>;

  for (const row of rows) {
    if (!result.has(row.period)) {
      result.set(row.period, { ...RUBRIQUES_VIDES });
    }
    const rubriques = result.get(row.period)!;
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
        substring(date_transaction, 4, 2) as period,
        sum(CASE WHEN startsWith(compte, '52') THEN debit - credit ELSE 0 END) +
        sum(CASE WHEN startsWith(compte, '57') THEN debit - credit ELSE 0 END) as solde_tresorerie
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
      GROUP BY period
      ORDER BY period
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    solde_tresorerie: string;
  }>;

  for (const row of rows) {
    result.set(row.period, parseFloat(row.solde_tresorerie) || 0);
  }

  return result;
}

async function recupererTresorerieParJour(
  dbName: string,
  batchIds: string[],
  monthFilter: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 1, 2) as period,
        sum(CASE WHEN startsWith(compte, '52') THEN debit - credit ELSE 0 END) +
        sum(CASE WHEN startsWith(compte, '57') THEN debit - credit ELSE 0 END) as solde_tresorerie
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND substring(date_transaction, 4, 2) = {monthFilter:String}
      GROUP BY period
      ORDER BY period
    `,
    query_params: { batchIds, monthFilter },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    solde_tresorerie: string;
  }>;

  for (const row of rows) {
    result.set(row.period, parseFloat(row.solde_tresorerie) || 0);
  }

  return result;
}

// ============================================================================
// RECOUVREMENT - Comptes clients (41*)
// CA TTC Total = Somme des montants au débit des comptes 41*
// CA Encaissé TTC = Somme des montants au crédit des comptes 41*
// Taux de recouvrement = (CA Encaissé TTC / CA TTC Total) * 100
// ============================================================================

async function recupererRecouvrementParMois(
  dbName: string,
  batchIds: string[]
): Promise<Map<string, { caTTCTotal: number; caEncaisseTTC: number }>> {
  const result = new Map<string, { caTTCTotal: number; caEncaisseTTC: number }>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 4, 2) as period,
        sum(CASE WHEN startsWith(compte, '41') THEN debit ELSE 0 END) as ca_ttc_total,
        sum(CASE WHEN startsWith(compte, '41') THEN credit ELSE 0 END) as ca_encaisse_ttc
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
      GROUP BY period
      ORDER BY period
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    ca_ttc_total: string;
    ca_encaisse_ttc: string;
  }>;

  for (const row of rows) {
    result.set(row.period, {
      caTTCTotal: parseFloat(row.ca_ttc_total) || 0,
      caEncaisseTTC: parseFloat(row.ca_encaisse_ttc) || 0,
    });
  }

  return result;
}

async function recupererRecouvrementParJour(
  dbName: string,
  batchIds: string[],
  monthFilter: string
): Promise<Map<string, { caTTCTotal: number; caEncaisseTTC: number }>> {
  const result = new Map<string, { caTTCTotal: number; caEncaisseTTC: number }>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 1, 2) as period,
        sum(CASE WHEN startsWith(compte, '41') THEN debit ELSE 0 END) as ca_ttc_total,
        sum(CASE WHEN startsWith(compte, '41') THEN credit ELSE 0 END) as ca_encaisse_ttc
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND substring(date_transaction, 4, 2) = {monthFilter:String}
      GROUP BY period
      ORDER BY period
    `,
    query_params: { batchIds, monthFilter },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    ca_ttc_total: string;
    ca_encaisse_ttc: string;
  }>;

  for (const row of rows) {
    result.set(row.period, {
      caTTCTotal: parseFloat(row.ca_ttc_total) || 0,
      caEncaisseTTC: parseFloat(row.ca_encaisse_ttc) || 0,
    });
  }

  return result;
}

async function recupererFluxParMois(
  dbName: string,
  batchIds: string[]
): Promise<
  Map<string, { charges: number; produits: number; nbTransactions: number }>
> {
  const result = new Map<
    string,
    { charges: number; produits: number; nbTransactions: number }
  >();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT 
        substring(date_transaction, 4, 2) as period,
        sum(CASE WHEN startsWith(compte, '6') THEN debit - credit ELSE 0 END) as charges,
        sum(CASE WHEN startsWith(compte, '7') THEN credit - debit ELSE 0 END) as produits,
        count(*) as nb_transactions
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
      GROUP BY period
      ORDER BY period
    `,
    query_params: { batchIds },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    charges: string;
    produits: string;
    nb_transactions: string;
  }>;

  for (const row of rows) {
    result.set(row.period, {
      charges: parseFloat(row.charges) || 0,
      produits: parseFloat(row.produits) || 0,
      nbTransactions: parseInt(row.nb_transactions) || 0,
    });
  }

  return result;
}

async function recupererFluxParJour(
  dbName: string,
  batchIds: string[],
  monthFilter: string
): Promise<
  Map<string, { charges: number; produits: number; nbTransactions: number }>
> {
  const result = new Map<
    string,
    { charges: number; produits: number; nbTransactions: number }
  >();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT 
        substring(date_transaction, 1, 2) as period,
        sum(CASE WHEN startsWith(compte, '6') THEN debit - credit ELSE 0 END) as charges,
        sum(CASE WHEN startsWith(compte, '7') THEN credit - debit ELSE 0 END) as produits,
        count(*) as nb_transactions
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND substring(date_transaction, 4, 2) = {monthFilter:String}
      GROUP BY period
      ORDER BY period
    `,
    query_params: { batchIds, monthFilter },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    period: string;
    charges: string;
    produits: string;
    nb_transactions: string;
  }>;

  for (const row of rows) {
    result.set(row.period, {
      charges: parseFloat(row.charges) || 0,
      produits: parseFloat(row.produits) || 0,
      nbTransactions: parseInt(row.nb_transactions) || 0,
    });
  }

  return result;
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

function calculerIndicateursPeriode(
  rubriquesParPeriode: Map<string, RubriquesOHADA>,
  tresorerieParPeriode: Map<string, number>,
  recouvrementParPeriode: Map<string, { caTTCTotal: number; caEncaisseTTC: number }>,
  periodesToInclude: string[]
): IndicateursFinanciers {
  const rubriquesAgregees = { ...RUBRIQUES_VIDES };
  let tresorerieTotal = 0;
  let caTTCTotalSum = 0;
  let caEncaisseTTCSum = 0;

  for (const period of periodesToInclude) {
    const rubriques = rubriquesParPeriode.get(period);
    if (rubriques) {
      for (const key of Object.keys(
        rubriquesAgregees
      ) as (keyof RubriquesOHADA)[]) {
        rubriquesAgregees[key] += rubriques[key];
      }
    }
    tresorerieTotal += tresorerieParPeriode.get(period) || 0;

    const recouvrement = recouvrementParPeriode.get(period);
    if (recouvrement) {
      caTTCTotalSum += recouvrement.caTTCTotal;
      caEncaisseTTCSum += recouvrement.caEncaisseTTC;
    }
  }

  const sig = calculerSIG(rubriquesAgregees);
  const tauxRecouvrement = caTTCTotalSum !== 0
    ? (caEncaisseTTCSum / caTTCTotalSum) * 100
    : 0;

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
    tauxRecouvrement,
    caTTCTotal: caTTCTotalSum,
    caEncaisseTTC: caEncaisseTTCSum,
  };
}

const calculerVariation = (n: number, n1: number): number =>
  n1 !== 0 ? ((n - n1) / Math.abs(n1)) * 100 : n !== 0 ? 100 : 0;

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
    const periodType = searchParams.get("periodType") || "year";
    const selectedMonth = searchParams.get("month");

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

    let chartData: DataPoint[] = [];
    let periodsToIncludeN: string[] = [];
    let periodsToIncludeN1: string[] = [];

    // ========================================================================
    // MODE MOIS : Données journalières
    // ========================================================================
    if (periodType === "month" && selectedMonth) {
      const monthNum = parseInt(selectedMonth);
      const daysInMonthN = getDaysInMonth(yearN, monthNum);
      const daysInMonthN1 = getDaysInMonth(yearN1, monthNum);
      const maxDays = Math.max(daysInMonthN, daysInMonthN1);

      const rubriquesParJourN = await recupererRubriquesParJour(
        dbName,
        batchIds,
        selectedMonth
      );
      const rubriquesParJourN1 = await recupererRubriquesParJour(
        dbName,
        batchIdsN1,
        selectedMonth
      );
      const tresorerieParJourN = await recupererTresorerieParJour(
        dbName,
        batchIds,
        selectedMonth
      );
      const tresorerieParJourN1 = await recupererTresorerieParJour(
        dbName,
        batchIdsN1,
        selectedMonth
      );
      const fluxParJourN = await recupererFluxParJour(
        dbName,
        batchIds,
        selectedMonth
      );
      const recouvrementParJourN = await recupererRecouvrementParJour(
        dbName,
        batchIds,
        selectedMonth
      );
      const recouvrementParJourN1 = await recupererRecouvrementParJour(
        dbName,
        batchIdsN1,
        selectedMonth
      );

      let cumulativeBalanceN = 0;
      let cumulativeTresoN = 0;
      let cumulativeTresoN1 = 0;
      let cumulativeCaTTCN = 0;
      let cumulativeCaEncaisseN = 0;
      let cumulativeCaTTCN1 = 0;
      let cumulativeCaEncaisseN1 = 0;

      for (let d = 1; d <= maxDays; d++) {
        const dayStr = d.toString().padStart(2, "0");

        const rubriquesN = rubriquesParJourN.get(dayStr) || {
          ...RUBRIQUES_VIDES,
        };
        const rubriquesN1Jour = rubriquesParJourN1.get(dayStr) || {
          ...RUBRIQUES_VIDES,
        };

        const sigN = calculerSIG(rubriquesN);
        const sigN1 = calculerSIG(rubriquesN1Jour);

        const tresoJourN = tresorerieParJourN.get(dayStr) || 0;
        const tresoJourN1 = tresorerieParJourN1.get(dayStr) || 0;

        cumulativeTresoN += tresoJourN;
        cumulativeTresoN1 += tresoJourN1;

        const fluxN = fluxParJourN.get(dayStr) || {
          charges: 0,
          produits: 0,
          nbTransactions: 0,
        };
        const resultatN = fluxN.produits - fluxN.charges;
        cumulativeBalanceN += resultatN;

        // Recouvrement
        const recouvrementN = recouvrementParJourN.get(dayStr) || { caTTCTotal: 0, caEncaisseTTC: 0 };
        const recouvrementN1Jour = recouvrementParJourN1.get(dayStr) || { caTTCTotal: 0, caEncaisseTTC: 0 };
        cumulativeCaTTCN += recouvrementN.caTTCTotal;
        cumulativeCaEncaisseN += recouvrementN.caEncaisseTTC;
        cumulativeCaTTCN1 += recouvrementN1Jour.caTTCTotal;
        cumulativeCaEncaisseN1 += recouvrementN1Jour.caEncaisseTTC;

        const tauxRecouvrementN = cumulativeCaTTCN !== 0
          ? (cumulativeCaEncaisseN / cumulativeCaTTCN) * 100
          : 0;
        const tauxRecouvrementN1 = cumulativeCaTTCN1 !== 0
          ? (cumulativeCaEncaisseN1 / cumulativeCaTTCN1) * 100
          : 0;

        chartData.push({
          label: `${d}`,
          period: `${year}${selectedMonth}${dayStr}`,
          periodNumber: dayStr,
          charges: fluxN.charges,
          produits: fluxN.produits,
          resultat: resultatN,
          cumulativeBalance: cumulativeBalanceN,
          nbTransactions: fluxN.nbTransactions,
          chiffreAffaires: sigN.XB,
          chiffreAffairesN1: sigN1.XB,
          soldeTresorerie: cumulativeTresoN,
          soldeTresorerieN1: cumulativeTresoN1,
          margeCommerciale: sigN.XA,
          margeCommercialeN1: sigN1.XA,
          tauxRecouvrement: tauxRecouvrementN,
          tauxRecouvrementN1: tauxRecouvrementN1,
          caTTCTotal: cumulativeCaTTCN,
          caEncaisseTTC: cumulativeCaEncaisseN,
        });
      }

      periodsToIncludeN = chartData.map((d) => d.periodNumber);
      periodsToIncludeN1 = periodsToIncludeN;

      const indicateursN = calculerIndicateursPeriode(
        rubriquesParJourN,
        tresorerieParJourN,
        recouvrementParJourN,
        periodsToIncludeN
      );
      const indicateursN1 = calculerIndicateursPeriode(
        rubriquesParJourN1,
        tresorerieParJourN1,
        recouvrementParJourN1,
        periodsToIncludeN1
      );

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
        tauxRecouvrement: indicateursN.tauxRecouvrement - indicateursN1.tauxRecouvrement,
      };

      const totals = chartData.reduce(
        (acc, row) => ({
          totalCharges: acc.totalCharges + row.charges,
          totalProduits: acc.totalProduits + row.produits,
          totalTransactions: acc.totalTransactions + row.nbTransactions,
        }),
        { totalCharges: 0, totalProduits: 0, totalTransactions: 0 }
      );

      const periods = await enrichirPeriodes(postgresPeriodsData, dbName);

      return NextResponse.json({
        client: { id: client.id, name: client.name },
        year,
        yearN1: yearN1.toString(),
        periodType,
        selectedMonth,
        availableYears: availableYears.length > 0 ? availableYears : [year],
        chartData,
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
    }

    // ========================================================================
    // MODE ANNÉE ou YTD : Données mensuelles
    // ========================================================================
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
    const fluxParMoisN = await recupererFluxParMois(dbName, batchIds);
    const recouvrementParMoisN = await recupererRecouvrementParMois(dbName, batchIds);
    const recouvrementParMoisN1 = await recupererRecouvrementParMois(dbName, batchIdsN1);

    let cumulativeBalance = 0;
    let cumulativeTresorerieN = 0;
    let cumulativeTresorerieN1 = 0;
    let cumulativeCaTTCN = 0;
    let cumulativeCaEncaisseN = 0;
    let cumulativeCaTTCN1 = 0;
    let cumulativeCaEncaisseN1 = 0;

    const endMonth =
      periodType === "ytd" && selectedMonth ? parseInt(selectedMonth) : 12;

    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, "0");

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

      const fluxN = fluxParMoisN.get(monthStr) || {
        charges: 0,
        produits: 0,
        nbTransactions: 0,
      };
      const resultat = fluxN.produits - fluxN.charges;
      cumulativeBalance += resultat;

      // Recouvrement
      const recouvrementN = recouvrementParMoisN.get(monthStr) || { caTTCTotal: 0, caEncaisseTTC: 0 };
      const recouvrementN1Mois = recouvrementParMoisN1.get(monthStr) || { caTTCTotal: 0, caEncaisseTTC: 0 };
      cumulativeCaTTCN += recouvrementN.caTTCTotal;
      cumulativeCaEncaisseN += recouvrementN.caEncaisseTTC;
      cumulativeCaTTCN1 += recouvrementN1Mois.caTTCTotal;
      cumulativeCaEncaisseN1 += recouvrementN1Mois.caEncaisseTTC;

      const tauxRecouvrementN = cumulativeCaTTCN !== 0
        ? (cumulativeCaEncaisseN / cumulativeCaTTCN) * 100
        : 0;
      const tauxRecouvrementN1 = cumulativeCaTTCN1 !== 0
        ? (cumulativeCaEncaisseN1 / cumulativeCaTTCN1) * 100
        : 0;

      chartData.push({
        label: monthNames[m - 1],
        period: `${year}${monthStr}`,
        periodNumber: monthStr,
        charges: fluxN.charges,
        produits: fluxN.produits,
        resultat,
        cumulativeBalance,
        nbTransactions: fluxN.nbTransactions,
        chiffreAffaires: sigN.XB,
        chiffreAffairesN1: sigN1.XB,
        soldeTresorerie: cumulativeTresorerieN,
        soldeTresorerieN1: cumulativeTresorerieN1,
        margeCommerciale: sigN.XA,
        margeCommercialeN1: sigN1.XA,
        tauxRecouvrement: tauxRecouvrementN,
        tauxRecouvrementN1: tauxRecouvrementN1,
        caTTCTotal: cumulativeCaTTCN,
        caEncaisseTTC: cumulativeCaEncaisseN,
      });
    }

    // Filtrage YTD
    if (periodType === "ytd" && selectedMonth) {
      chartData = chartData.filter((d) => parseInt(d.periodNumber) <= endMonth);
    }

    periodsToIncludeN = chartData.map((m) => m.periodNumber);
    periodsToIncludeN1 = periodsToIncludeN;

    const indicateursN = calculerIndicateursPeriode(
      rubriquesParMoisN,
      tresorerieParMoisN,
      recouvrementParMoisN,
      periodsToIncludeN
    );
    const indicateursN1 = calculerIndicateursPeriode(
      rubriquesParMoisN1,
      tresorerieParMoisN1,
      recouvrementParMoisN1,
      periodsToIncludeN1
    );

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
      tauxRecouvrement: indicateursN.tauxRecouvrement - indicateursN1.tauxRecouvrement,
    };

    const totals = chartData.reduce(
      (acc, row) => ({
        totalCharges: acc.totalCharges + row.charges,
        totalProduits: acc.totalProduits + row.produits,
        totalTransactions: acc.totalTransactions + row.nbTransactions,
      }),
      { totalCharges: 0, totalProduits: 0, totalTransactions: 0 }
    );

    const periods = await enrichirPeriodes(postgresPeriodsData, dbName);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      year,
      yearN1: yearN1.toString(),
      periodType,
      selectedMonth,
      availableYears: availableYears.length > 0 ? availableYears : [year],
      chartData,
      periods,
      totals: {
        ...totals,
        resultat: totals.totalProduits - totals.totalCharges,
      },
      indicateurs: { anneeN: indicateursN, anneeN1: indicateursN1, variations },
    });
  } catch (error) {
    console.error("Reporting API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données" },
      { status: 500 }
    );
  }
}

async function enrichirPeriodes(postgresPeriodsData: any[], dbName: string) {
  return Promise.all(
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
}
