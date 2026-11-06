import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";
import { accesReporting } from "@/lib/reporting/acces";
import { filtrerReponse, CHAMPS_DETTES } from "@/lib/reporting/champs-proteges";
import { manualBatchIdsForYears } from "@/lib/clickhouse/manual-sync";
import { bilanRefExpr } from "@/lib/clickhouse/schema";
import { journauxTresorerie } from "@/lib/clickhouse/plan-comptable";
import {
  dettesFournisseursTTCSql,
  decaissementsFournisseursTTCSql,
  perimetreDettesFournisseursSql,
} from "@/lib/reporting/creances";
import { YM_SQL, JOUR_SQL, moisCouverts } from "@/lib/reporting/periode";

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
  pourcentage: number; // part du solde (Top par type : total des types ; par fournisseur : toutes les dettes fournisseurs)
}

interface TopDetteFournisseur extends TopDette {
  numeroFournisseur: string;
}
// Pourcentage du Top 10 fournisseurs : part du solde dans le total des soldes
// positifs de TOUS les fournisseurs (comme « Analyse des Créances - Top 10 »).

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

type RubriqueTotals = {
  credit: number;
  debit: number;
  // Règlement fournisseurs (définitions de creances.ts) : DJ hors 408/409,
  // solde des comptes hors journaux de trésorerie (dette née) et sur les
  // journaux de trésorerie (décaissement).
  detteFournisseurs: number;
  decaissementFournisseurs: number;
};

// ----------------------------------------------------------------------------
// Récupère, par (année, mois, rubrique bilan), la somme des crédits (dette née)
// et des débits (remboursement) pour toutes les rubriques de dettes.
// ----------------------------------------------------------------------------
async function recupererDettesParYearMonth(
  dbName: string,
  batchIds: string[],
  refExpr: string,
  journaux: string[],
): Promise<Map<string, Map<string, RubriqueTotals>>> {
  const result = new Map<string, Map<string, RubriqueTotals>>();
  if (batchIds.length === 0) return result;

  const data = await clickhouseClient.query({
    query: `
      SELECT
        -- Année et mois comptables : un à-nouveau daté du 31/12 précédent
        -- compte en janvier (solde d'ouverture), pas en décembre N-1.
        substring(${YM_SQL}, 1, 4) as year,
        substring(${YM_SQL}, 5, 2) as month,
        ${refExpr} as rubrique,
        sum(credit) as dette_nee,
        sum(debit) as rembourse,
        ${dettesFournisseursTTCSql(refExpr)} as dette_fournisseurs,
        ${decaissementsFournisseursTTCSql(refExpr)} as decaissement_fournisseurs
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND ${refExpr} IN ({rubriques:Array(String)})
      GROUP BY year, month, rubrique
      ORDER BY year, month
    `,
    query_params: { batchIds, rubriques: ALL_DEBT_RUBRIQUE_CODES, journauxTresorerie: journaux },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    year: string;
    month: string;
    rubrique: string;
    dette_nee: string;
    rembourse: string;
    dette_fournisseurs: string;
    decaissement_fournisseurs: string;
  }>;

  for (const row of rows) {
    const key = `${row.year}-${row.month}`;
    if (!result.has(key)) result.set(key, new Map());
    const byRubrique = result.get(key)!;
    byRubrique.set(row.rubrique, {
      credit: parseFloat(row.dette_nee) || 0,
      debit: parseFloat(row.rembourse) || 0,
      detteFournisseurs: parseFloat(row.dette_fournisseurs) || 0,
      decaissementFournisseurs: parseFloat(row.decaissement_fournisseurs) || 0,
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
  refExpr: string,
  journaux: string[],
): Promise<Map<string, Map<string, RubriqueTotals>>> {
  const result = new Map<string, Map<string, RubriqueTotals>>();
  if (batchIds.length === 0) return result;

  const yyyy = year.toString();
  const mm = month.toString().padStart(2, "0");

  const data = await clickhouseClient.query({
    query: `
      SELECT
        ${JOUR_SQL} as day,
        ${refExpr} as rubrique,
        sum(credit) as dette_nee,
        sum(debit) as rembourse,
        ${dettesFournisseursTTCSql(refExpr)} as dette_fournisseurs,
        ${decaissementsFournisseursTTCSql(refExpr)} as decaissement_fournisseurs
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND ${refExpr} IN ({rubriques:Array(String)})
        AND ${YM_SQL} = {ym:String}
      GROUP BY day, rubrique
      ORDER BY day
    `,
    query_params: {
      batchIds,
      rubriques: ALL_DEBT_RUBRIQUE_CODES,
      journauxTresorerie: journaux,
      ym: `${yyyy}${mm}`,
    },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    day: string;
    rubrique: string;
    dette_nee: string;
    rembourse: string;
    dette_fournisseurs: string;
    decaissement_fournisseurs: string;
  }>;

  for (const row of rows) {
    const day = row.day;
    if (!result.has(day)) result.set(day, new Map());
    result.get(day)!.set(row.rubrique, {
      credit: parseFloat(row.dette_nee) || 0,
      debit: parseFloat(row.rembourse) || 0,
      detteFournisseurs: parseFloat(row.dette_fournisseurs) || 0,
      decaissementFournisseurs: parseFloat(row.decaissement_fournisseurs) || 0,
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
  refExpr: string,
): Promise<TopDette[]> {
  if (batchIds.length === 0) return [];

  const data = await clickhouseClient.query({
    query: `
      SELECT
        ${refExpr} as rubrique,
        sum(credit) as montant_dette,
        sum(debit) as montant_rembourse
      FROM ${dbName}.grand_livre
      WHERE batch_id IN ({batchIds:Array(String)})
        AND ${refExpr} IN ({rubriques:Array(String)})
        AND ${YM_SQL} >= {startYM:String}
        AND ${YM_SQL} <= {endYM:String}
      GROUP BY rubrique
      HAVING (montant_dette - montant_rembourse) > 0
      ORDER BY (montant_dette - montant_rembourse) DESC
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

  const mapped = rows.map((row) => {
    const montantDette = parseFloat(row.montant_dette) || 0;
    const montantRembourse = parseFloat(row.montant_rembourse) || 0;
    return {
      label: RUBRIQUE_LABELS[row.rubrique] || row.rubrique,
      montantDette,
      montantRembourse,
      solde: montantDette - montantRembourse,
      pourcentage: 0,
    };
  });
  // % = part du solde dans le total des soldes du Top 10 (total = 100 %),
  // même logique que « Analyse des Créances - Top 10 ».
  const totalSolde = mapped.reduce((s, r) => s + r.solde, 0);
  return mapped.map((r) => ({
    ...r,
    pourcentage: totalSolde !== 0 ? (r.solde / totalSolde) * 100 : 0,
  }));
}

// ----------------------------------------------------------------------------
// Top 10 des dettes fournisseurs PAR FOURNISSEUR, sur la période, avec les
// définitions des KPI : DJ hors 408/409 ; dette = solde hors journaux de
// trésorerie, remboursé = décaissement sur les journaux de trésorerie.
// Une dette sans tiers est regroupée sous son compte ; le nom est résolu par
// agrégat (un fournisseur reste une seule ligne même si son intitulé varie).
// ----------------------------------------------------------------------------
async function recupererTopParFournisseur(
  dbName: string,
  batchIds: string[],
  startYM: string,
  endYM: string,
  refExpr: string,
  journaux: string[],
): Promise<TopDetteFournisseur[]> {
  if (batchIds.length === 0) return [];

  const data = await clickhouseClient.query({
    query: `
      WITH dettes_fournisseurs AS (
        SELECT
          if(n_tiers != '', n_tiers, compte) AS numero_fournisseur,
          multiIf(
            anyIf(intitule_tiers, intitule_tiers != '') != '', anyIf(intitule_tiers, intitule_tiers != ''),
            anyIf(intitule_compte, intitule_compte != '') != '', anyIf(intitule_compte, intitule_compte != ''),
            any(compte)
          ) AS nom_fournisseur,
          ${dettesFournisseursTTCSql(refExpr)} AS montant_dette,
          ${decaissementsFournisseursTTCSql(refExpr)} AS montant_rembourse,
          montant_dette - montant_rembourse AS solde
        FROM ${dbName}.grand_livre
        WHERE batch_id IN ({batchIds:Array(String)})
          AND ${perimetreDettesFournisseursSql(refExpr)}
          AND ${YM_SQL} >= {startYM:String}
          AND ${YM_SQL} <= {endYM:String}
        GROUP BY numero_fournisseur
        HAVING solde > 0
      )
      SELECT
        numero_fournisseur,
        nom_fournisseur,
        montant_dette,
        montant_rembourse,
        solde,
        -- Total des soldes positifs de TOUS les fournisseurs (avant le LIMIT).
        sum(solde) OVER () AS total_global
      FROM dettes_fournisseurs
      ORDER BY solde DESC
      LIMIT 10
    `,
    query_params: { batchIds, startYM, endYM, journauxTresorerie: journaux },
    format: "JSONEachRow",
  });

  const rows = (await data.json()) as Array<{
    numero_fournisseur: string;
    nom_fournisseur: string;
    montant_dette: string;
    montant_rembourse: string;
    solde: string;
    total_global: string;
  }>;
  const totalGlobal = parseFloat(rows[0]?.total_global) || 0;

  return rows.map((row) => {
    const solde = parseFloat(row.solde) || 0;
    return {
      numeroFournisseur: row.numero_fournisseur,
      label: row.nom_fournisseur,
      montantDette: parseFloat(row.montant_dette) || 0,
      montantRembourse: parseFloat(row.montant_rembourse) || 0,
      solde,
      pourcentage: totalGlobal > 0 ? (solde / totalGlobal) * 100 : 0,
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

/**
 * Flux du RÈGLEMENT FOURNISSEURS : rubrique DJ hors comptes 408* et 409*.
 *
 * L'onglet suit le cycle d'achat fournisseur — ni les dettes sociales, ni
 * fiscales, ni HAO (elles ont leur propre onglet « Dettes court terme »). Les
 * 408* (factures non parvenues) sont des charges estimées et les 409*
 * (fournisseurs débiteurs) des avances : ni l'un ni l'autre n'est une
 * dette à décaisser.
 *   - dette née    : solde (crédit − débit) hors journaux de trésorerie ;
 *   - décaissement : solde (débit − crédit) sur les journaux de trésorerie.
 */
function flowsFournisseurs(byRubrique: Map<string, RubriqueTotals> | undefined): {
  detteNee: number;
  rembourse: number;
} {
  const t = byRubrique?.get(DEBT_RUBRIQUES.fournisseurs);
  return {
    detteNee: t?.detteFournisseurs ?? 0,
    rembourse: t?.decaissementFournisseurs ?? 0,
  };
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
    // dailyBaseline : en granularité jour, démarre le cumul au cumul Jan→M-1
    // (mode cumulé/ytd-day) au lieu de 0 (mode périodique sur un seul mois).
    const dailyBaseline = searchParams.get("dailyBaseline") === "true";

    // Période demandée ; ramenée plus bas sur une période importée.
    let endYear = 0;
    let endMonth = 12;
    if (endPeriod) {
      const [y, m] = endPeriod.split("-");
      endYear = parseInt(y) || 0;
      endMonth = parseInt(m) || 12;
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
      select: { id: true, name: true, companyId: true, excludeManualEntries: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }
    if (client.companyId !== session.user.companyId) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }
    const acces = await accesReporting(id, session.user);
    if (acces instanceof NextResponse) return acces;

    const dbName = getClickhouseDbName(id);
    // Schéma fusionné (une seule colonne `rubrique`) ou schéma d'origine.
    // Rubrique bilan (schéma fusionné ou d'origine) et journaux de trésorerie.
    const [refExpr, journaux] = await Promise.all([
      bilanRefExpr(clickhouseClient, dbName),
      journauxTresorerie(clickhouseClient, dbName),
    ]);

    const allPeriods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true, year: true, periodStart: true, periodEnd: true },
    });

    // Années et mois d'un reporting importé (mêmes règles que la Synthèse) :
    // une année sans import devient la plus récente, un mois hors reporting
    // le dernier mois couvert ; la fenêtre ne dépasse jamais l'import.
    const availableYears = [
      ...new Set(allPeriods.map((p) => p.periodStart.getUTCFullYear())),
    ].sort((a, b) => b - a);
    if (availableYears.length > 0 && !availableYears.includes(endYear)) {
      endYear = availableYears[0];
    }
    if (!endYear) endYear = new Date().getFullYear();
    const moisDisponibles = moisCouverts(
      allPeriods.filter((p) => p.periodStart.getUTCFullYear() === endYear),
    );
    const premierMois = moisDisponibles.length > 0 ? parseInt(moisDisponibles[0]) : 1;
    const dernierMois =
      moisDisponibles.length > 0 ? parseInt(moisDisponibles[moisDisponibles.length - 1]) : 12;
    const moisDemandeFin = endMonth;
    if (
      moisDisponibles.length > 0 &&
      !moisDisponibles.includes(String(endMonth).padStart(2, "0"))
    ) {
      endMonth = dernierMois;
    }
    // Début de fenêtre dans la même année ; un seul mois demandé (vue
    // journalière) reste un seul mois après correction.
    if (startYear !== undefined) startYear = endYear;
    if (granularityParam === "day" && startMonth === moisDemandeFin) startMonth = endMonth;
    // + batchs des lignes saisies manuellement (intégrées au reporting), sauf si
    // le client a activé l'exclusion des saisies.
    const manualYears = [...new Set([...allPeriods.map((p) => p.year), endYear])];
    const allBatchIds = [
      ...allPeriods.map((p) => p.batchId).filter((b): b is string => !!b),
      ...(client.excludeManualEntries ? [] : manualBatchIdsForYears(id, manualYears)),
    ];

    // Un seul mois sélectionné = start == end (ou start absent et endMonth seul).
    const singleMonth =
      (startYear === endYear && startMonth === endMonth) ||
      (!startPeriod && endMonth >= 1);
    const useDaily =
      granularityParam === "day" &&
      startYear === endYear &&
      startMonth === endMonth;

    const monthlyData = await recupererDettesParYearMonth(dbName, allBatchIds, refExpr, journaux);

    const chartData: DetteDataPoint[] = [];
    let cumulDetteNee = 0;
    let cumulRembourse = 0;

    if (useDaily) {
      // Baseline cumulée = janvier → mois précédent (inclus dans le cumul).
      // Appliquée uniquement en mode cumulé (dailyBaseline=true). En mode
      // périodique sur un seul mois, la baseline reste 0.
      if (dailyBaseline) {
        for (let m = 1; m < endMonth; m++) {
          const key = `${endYear}-${m.toString().padStart(2, "0")}`;
          const { detteNee, rembourse } = flowsFournisseurs(monthlyData.get(key));
          cumulDetteNee += detteNee;
          cumulRembourse += rembourse;
        }
      }

      const dailyData = await recupererDettesParJour(
        dbName,
        allBatchIds,
        endYear,
        endMonth,
        refExpr,
        journaux,
      );
      const daysInMonth = new Date(endYear, endMonth, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const dayKey = d.toString().padStart(2, "0");
        const byRubrique = dailyData.get(dayKey);
        const { detteNee, rembourse } = flowsFournisseurs(byRubrique);

        cumulDetteNee += detteNee;
        cumulRembourse += rembourse;

        chartData.push({
          label: `${dayKey} ${MONTH_NAMES[endMonth - 1]}`,
          period: `${endYear}${endMonth.toString().padStart(2, "0")}${dayKey}`,
          yearMonth: `${endYear}-${endMonth.toString().padStart(2, "0")}-${dayKey}`,
          // Mêmes définitions que les KPI « Dettes Fournisseurs TTC » et
          // « Décaissement Fournisseurs TTC » (DJ hors 408/409, par journal).
          detteFournisseurNee: detteNee,
          detteFournisseurRemboursee: rembourse,
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
        const { detteNee, rembourse } = flowsFournisseurs(byRubrique);

        cumulDetteNee += detteNee;
        cumulRembourse += rembourse;

        chartData.push({
          label: monthInfo.label,
          period: `${monthInfo.year}${monthInfo.month.toString().padStart(2, "0")}`,
          yearMonth: key,
          // Mêmes définitions que les KPI « Dettes Fournisseurs TTC » et
          // « Décaissement Fournisseurs TTC » (DJ hors 408/409, par journal).
          detteFournisseurNee: detteNee,
          detteFournisseurRemboursee: rembourse,
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

    // Courbes mensuelles : seuls les mois couverts par le reporting (les cumuls
    // partent toujours de janvier).
    const chartAffiche = useDaily
      ? chartData
      : chartData.filter((d) => {
          const m = parseInt(d.yearMonth.slice(5, 7));
          return m >= premierMois && m <= endMonth;
        });

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
      // Règlement fournisseurs : solde DJ hors 408/409, hors / sur journaux de trésorerie.
      dettesFournisseursTTC: cumulDetteNee,
      decaissementFournisseursTTC: cumulRembourse,
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
      recupererTopParType(dbName, allBatchIds, startYM, endYM, refExpr),
      recupererTopParFournisseur(dbName, allBatchIds, startYM, endYM, refExpr, journaux),
    ]);

    const reponse = {
      client: { id: client.id, name: client.name },
      endPeriod: `${endYear}-${endMonth.toString().padStart(2, "0")}`,
      endYear,
      endMonth,
      availableYears: availableYears.map(String),
      moisDisponibles,
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
      chartData: chartAffiche,
      topByType,
      topByFournisseur,
    };
    return NextResponse.json(filtrerReponse(reponse, CHAMPS_DETTES, acces.masques));
  } catch (error) {
    console.error("Dettes API error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données de dettes" },
      { status: 500 },
    );
  }
}
