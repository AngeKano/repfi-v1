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
// RUBRIQUES BILAN DES DETTES (SYSCOHADA)
// Convention dette (compte de passif) :
//   - crédit = dette née (augmentation du passif)
//   - débit  = remboursement de la dette
//   - solde dette (reste dû) = crédit - débit
// ============================================================================
const DEBT_RUBRIQUES = {
  fournisseurs: "DJ",
  personnel: "DK1",
  sociales: "DK2",
  fiscales: "DK3",
  hao: "DH",
} as const;

const ALL_DEBT_RUBRIQUE_CODES = Object.values(DEBT_RUBRIQUES);

const RUBRIQUE_LABELS: Record<string, string> = {
  DJ: "Dettes fournisseurs",
  DK1: "Dettes personnel",
  DK2: "Dettes sociales",
  DK3: "Dettes fiscales",
  DH: "Dettes HAO",
};

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

interface DetteDataPoint {
  label: string;
  period: string;
  yearMonth: string;
  // Dette fournisseurs (DJ) : née (crédit) vs remboursée (débit) — chart 2
  detteFournisseurNee: number;
  detteFournisseurRemboursee: number;
  // Toutes dettes — chart 1 (taux de remboursement)
  detteNeeTotal: number;
  rembourseTotal: number;
  tauxRemboursement: number; // périodique
  cumulDetteNeeTotal: number;
  cumulRembourseTotal: number;
  tauxRemboursementCumule: number; // cumulé
}

interface TopDette {
  label: string;
  montantDette: number;
  montantRembourse: number;
  solde: number;
  pourcentage: number; // taux de remboursement de la ligne (remboursé / dette)
}

interface TopDetteFournisseur extends TopDette {
  numeroFournisseur: string;
}

// Génère les mois de Janvier (01) jusqu'au mois sélectionné, dans l'année
// sélectionnée uniquement (YTD), comme l'onglet Recouvrement.
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

type RubriqueTotals = { credit: number; debit: number };

// ----------------------------------------------------------------------------
// Récupère, par (année, mois, rubrique bilan), la somme des crédits (dette née)
// et des débits (remboursement) pour toutes les rubriques de dettes.
// ----------------------------------------------------------------------------
async function recupererDettesParYearMonth(
  dbName: string,
  batchIds: string[],
): Promise<Map<string, Map<string, RubriqueTotals>>> {
  const result = new Map<string, Map<string, RubriqueTotals>>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 7, 4) as year,
        substring(date_transaction, 4, 2) as month,
        bilan_rubrique as rubrique,
        sum(credit) as dette_nee,
        sum(debit) as rembourse
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND bilan_rubrique IN ({rubriques:Array(String)})
      GROUP BY year, month, rubrique
      ORDER BY year, month
    `,
    query_params: { batchIds, rubriques: ALL_DEBT_RUBRIQUE_CODES },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    year: string;
    month: string;
    rubrique: string;
    dette_nee: string;
    rembourse: string;
  }>;

  for (const row of rows) {
    const key = `${row.year}-${row.month}`;
    if (!result.has(key)) result.set(key, new Map());
    const byRubrique = result.get(key)!;
    byRubrique.set(row.rubrique, {
      credit: parseFloat(row.dette_nee) || 0,
      debit: parseFloat(row.rembourse) || 0,
    });
  }

  return result;
}

// ----------------------------------------------------------------------------
// Récupère, par (jour, rubrique) pour UN mois précis, les crédits/débits.
// Sert au cumul journalier intra-mois (mode de calcul cumulé, granularité jour).
// date_transaction format DD/MM/YYYY → day=substr(1,2).
// ----------------------------------------------------------------------------
async function recupererDettesParJour(
  dbName: string,
  batchIds: string[],
  year: number,
  month: number,
): Promise<Map<string, Map<string, RubriqueTotals>>> {
  const result = new Map<string, Map<string, RubriqueTotals>>();
  if (batchIds.length === 0) return result;

  const yyyy = year.toString();
  const mm = month.toString().padStart(2, "0");

  const data = await clickhouseClient.query({
    query: `
      SELECT
        substring(date_transaction, 1, 2) as day,
        bilan_rubrique as rubrique,
        sum(credit) as dette_nee,
        sum(debit) as rembourse
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND bilan_rubrique IN ({rubriques:Array(String)})
        AND substring(date_transaction, 7, 4) = {year:String}
        AND substring(date_transaction, 4, 2) = {month:String}
      GROUP BY day, rubrique
      ORDER BY day
    `,
    query_params: {
      batchIds,
      rubriques: ALL_DEBT_RUBRIQUE_CODES,
      year: yyyy,
      month: mm,
    },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    day: string;
    rubrique: string;
    dette_nee: string;
    rembourse: string;
  }>;

  for (const row of rows) {
    const day = row.day;
    if (!result.has(day)) result.set(day, new Map());
    result.get(day)!.set(row.rubrique, {
      credit: parseFloat(row.dette_nee) || 0,
      debit: parseFloat(row.rembourse) || 0,
    });
  }

  return result;
}

// ----------------------------------------------------------------------------
// Top 10 des dettes regroupées PAR TYPE (rubrique bilan), sur la période.
// ----------------------------------------------------------------------------
async function recupererTopParType(
  dbName: string,
  batchIds: string[],
  startYM: string,
  endYM: string,
): Promise<TopDette[]> {
  if (batchIds.length === 0) return [];

  const data = await clickhouseClient.query({
    query: `
      SELECT
        bilan_rubrique as rubrique,
        sum(credit) as montant_dette,
        sum(debit) as montant_rembourse
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND bilan_rubrique IN ({rubriques:Array(String)})
        AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) >= {startYM:String}
        AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) <= {endYM:String}
      GROUP BY rubrique
      ORDER BY montant_dette DESC
      LIMIT 10
    `,
    query_params: {
      batchIds,
      rubriques: ALL_DEBT_RUBRIQUE_CODES,
      startYM,
      endYM,
    },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    rubrique: string;
    montant_dette: string;
    montant_rembourse: string;
  }>;

  return rows.map((row) => {
    const montantDette = parseFloat(row.montant_dette) || 0;
    const montantRembourse = parseFloat(row.montant_rembourse) || 0;
    return {
      label: RUBRIQUE_LABELS[row.rubrique] || row.rubrique,
      montantDette,
      montantRembourse,
      solde: montantDette - montantRembourse,
      pourcentage: montantDette !== 0 ? (montantRembourse / montantDette) * 100 : 0,
    };
  });
}

// ----------------------------------------------------------------------------
// Top 10 des dettes fournisseurs (DJ) PAR FOURNISSEUR (n_tiers), sur la période.
// ----------------------------------------------------------------------------
async function recupererTopParFournisseur(
  dbName: string,
  batchIds: string[],
  startYM: string,
  endYM: string,
): Promise<TopDetteFournisseur[]> {
  if (batchIds.length === 0) return [];

  const data = await clickhouseClient.query({
    query: `
      WITH dettes_fournisseurs AS (
        SELECT
          n_tiers AS numero_fournisseur,
          intitule_tiers AS nom_fournisseur,
          sum(credit) AS montant_dette,
          sum(debit) AS montant_rembourse
        FROM ${dbName}.grand_livre
        WHERE batch_id IN ({batchIds:Array(String)})
          AND bilan_rubrique = {rubriqueDJ:String}
          AND n_tiers != ''
          AND intitule_tiers != ''
          AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) >= {startYM:String}
          AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) <= {endYM:String}
        GROUP BY n_tiers, intitule_tiers
        HAVING montant_dette > 0
      )
      SELECT
        numero_fournisseur,
        nom_fournisseur,
        montant_dette,
        montant_rembourse
      FROM dettes_fournisseurs
      ORDER BY montant_dette DESC
      LIMIT 10
    `,
    query_params: {
      batchIds,
      rubriqueDJ: DEBT_RUBRIQUES.fournisseurs,
      startYM,
      endYM,
    },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    numero_fournisseur: string;
    nom_fournisseur: string;
    montant_dette: string;
    montant_rembourse: string;
  }>;

  return rows.map((row) => {
    const montantDette = parseFloat(row.montant_dette) || 0;
    const montantRembourse = parseFloat(row.montant_rembourse) || 0;
    return {
      numeroFournisseur: row.numero_fournisseur,
      label: row.nom_fournisseur,
      montantDette,
      montantRembourse,
      solde: montantDette - montantRembourse,
      pourcentage: montantDette !== 0 ? (montantRembourse / montantDette) * 100 : 0,
    };
  });
}

// Somme des soldes (crédit - débit) d'une rubrique sur une map de totaux.
function netForRubrique(
  byRubrique: Map<string, RubriqueTotals> | undefined,
  rubrique: string,
): number {
  if (!byRubrique) return 0;
  const t = byRubrique.get(rubrique);
  return t ? t.credit - t.debit : 0;
}

function flowsForAllDebts(byRubrique: Map<string, RubriqueTotals> | undefined): {
  detteNee: number;
  rembourse: number;
} {
  let detteNee = 0;
  let rembourse = 0;
  if (byRubrique) {
    for (const code of ALL_DEBT_RUBRIQUE_CODES) {
      const t = byRubrique.get(code);
      if (t) {
        detteNee += t.credit;
        rembourse += t.debit;
      }
    }
  }
  return { detteNee, rembourse };
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

    const endPeriod = searchParams.get("endPeriod"); // YYYY-MM
    const startPeriod = searchParams.get("startPeriod"); // YYYY-MM (optionnel)
    // Mode de calcul : 'cumule' (défaut) | 'periodique'. Pilote surtout l'UI,
    // les deux séries (périodique + cumulée) sont toujours renvoyées.
    const mode = searchParams.get("mode") === "periodique" ? "periodique" : "cumule";
    // Granularité : 'day' force le découpage journalier (valable si un seul mois).
    const granularityParam = searchParams.get("granularity");

    let endYear: number;
    let endMonth: number;
    if (endPeriod) {
      const [y, m] = endPeriod.split("-");
      endYear = parseInt(y);
      endMonth = parseInt(m);
    } else {
      const now = new Date();
      endYear = now.getFullYear();
      endMonth = now.getMonth() + 1;
    }

    let startYear: number | undefined;
    let startMonth: number | undefined;
    if (startPeriod) {
      const [y, m] = startPeriod.split("-");
      startYear = parseInt(y);
      startMonth = parseInt(m);
    }

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

    const allPeriods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true },
    });
    const allBatchIds = allPeriods
      .map((p) => p.batchId)
      .filter((b): b is string => !!b);

    // Un seul mois sélectionné = start == end (ou start absent et endMonth seul).
    const singleMonth =
      (startYear === endYear && startMonth === endMonth) ||
      (!startPeriod && endMonth >= 1);
    const useDaily =
      granularityParam === "day" &&
      startYear === endYear &&
      startMonth === endMonth;

    const monthlyData = await recupererDettesParYearMonth(dbName, allBatchIds);

    const chartData: DetteDataPoint[] = [];
    let cumulDetteNee = 0;
    let cumulRembourse = 0;

    if (useDaily) {
      // Baseline cumulée = janvier → mois précédent (inclus dans le cumul).
      for (let m = 1; m < endMonth; m++) {
        const key = `${endYear}-${m.toString().padStart(2, "0")}`;
        const { detteNee, rembourse } = flowsForAllDebts(monthlyData.get(key));
        cumulDetteNee += detteNee;
        cumulRembourse += rembourse;
      }

      const dailyData = await recupererDettesParJour(
        dbName,
        allBatchIds,
        endYear,
        endMonth,
      );
      const daysInMonth = new Date(endYear, endMonth, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const dayKey = d.toString().padStart(2, "0");
        const byRubrique = dailyData.get(dayKey);
        const { detteNee, rembourse } = flowsForAllDebts(byRubrique);
        const dj = byRubrique?.get(DEBT_RUBRIQUES.fournisseurs);

        cumulDetteNee += detteNee;
        cumulRembourse += rembourse;

        chartData.push({
          label: `${dayKey} ${MONTH_NAMES[endMonth - 1]}`,
          period: `${endYear}${endMonth.toString().padStart(2, "0")}${dayKey}`,
          yearMonth: `${endYear}-${endMonth.toString().padStart(2, "0")}-${dayKey}`,
          detteFournisseurNee: dj?.credit || 0,
          detteFournisseurRemboursee: dj?.debit || 0,
          detteNeeTotal: detteNee,
          rembourseTotal: rembourse,
          tauxRemboursement: detteNee !== 0 ? (rembourse / detteNee) * 100 : 0,
          cumulDetteNeeTotal: cumulDetteNee,
          cumulRembourseTotal: cumulRembourse,
          tauxRemboursementCumule:
            cumulDetteNee !== 0 ? (cumulRembourse / cumulDetteNee) * 100 : 0,
        });
      }
    } else {
      const ytdMonths = getYearToDateMonths(endYear, endMonth);
      for (const monthInfo of ytdMonths) {
        const key = `${monthInfo.year}-${monthInfo.month.toString().padStart(2, "0")}`;
        const byRubrique = monthlyData.get(key);
        const { detteNee, rembourse } = flowsForAllDebts(byRubrique);
        const dj = byRubrique?.get(DEBT_RUBRIQUES.fournisseurs);

        cumulDetteNee += detteNee;
        cumulRembourse += rembourse;

        chartData.push({
          label: monthInfo.label,
          period: `${monthInfo.year}${monthInfo.month.toString().padStart(2, "0")}`,
          yearMonth: key,
          detteFournisseurNee: dj?.credit || 0,
          detteFournisseurRemboursee: dj?.debit || 0,
          detteNeeTotal: detteNee,
          rembourseTotal: rembourse,
          tauxRemboursement: detteNee !== 0 ? (rembourse / detteNee) * 100 : 0,
          cumulDetteNeeTotal: cumulDetteNee,
          cumulRembourseTotal: cumulRembourse,
          tauxRemboursementCumule:
            cumulDetteNee !== 0 ? (cumulRembourse / cumulDetteNee) * 100 : 0,
        });
      }
    }

    // KPIs : solde de clôture (cumul crédit - débit) par rubrique, sur Jan→endMonth.
    let netDJ = 0;
    let netDK1 = 0;
    let netDK2 = 0;
    let netDK3 = 0;
    let netDH = 0;
    for (let m = 1; m <= endMonth; m++) {
      const key = `${endYear}-${m.toString().padStart(2, "0")}`;
      const byRubrique = monthlyData.get(key);
      netDJ += netForRubrique(byRubrique, DEBT_RUBRIQUES.fournisseurs);
      netDK1 += netForRubrique(byRubrique, DEBT_RUBRIQUES.personnel);
      netDK2 += netForRubrique(byRubrique, DEBT_RUBRIQUES.sociales);
      netDK3 += netForRubrique(byRubrique, DEBT_RUBRIQUES.fiscales);
      netDH += netForRubrique(byRubrique, DEBT_RUBRIQUES.hao);
    }

    const kpis = {
      dettesFournisseurs: netDJ,
      dettesPersonnel: netDK1,
      dettesSociales: netDK2,
      dettesFiscales: netDK3,
      dettesHAO: netDH,
      tauxRemboursement:
        cumulDetteNee !== 0 ? (cumulRembourse / cumulDetteNee) * 100 : 0,
    };

    // Bornes de période pour les Top 10.
    const effectiveStartYear = startYear ?? endYear;
    const effectiveStartMonth = startMonth ?? 1;
    const startYM = `${effectiveStartYear}${effectiveStartMonth
      .toString()
      .padStart(2, "0")}`;
    const endYM = `${endYear}${endMonth.toString().padStart(2, "0")}`;

    const [topByType, topByFournisseur] = await Promise.all([
      recupererTopParType(dbName, allBatchIds, startYM, endYM),
      recupererTopParFournisseur(dbName, allBatchIds, startYM, endYM),
    ]);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      endPeriod: `${endYear}-${endMonth.toString().padStart(2, "0")}`,
      endYear,
      endMonth,
      mode,
      granularity: useDaily ? "day" : "month",
      singleMonth,
      kpis,
      totals: {
        detteNeeTotal: cumulDetteNee,
        rembourseTotal: cumulRembourse,
        tauxRemboursement: kpis.tauxRemboursement,
        soldeDettes: cumulDetteNee - cumulRembourse,
      },
      chartData,
      topByType,
      topByFournisseur,
    });
  } catch (error) {
    console.error("Dettes API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données de dettes" },
      { status: 500 },
    );
  }
}
