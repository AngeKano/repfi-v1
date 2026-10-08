// ============================================================================
// Onglet « Ratios bilantiels » — FRNG, BFR, dettes financières et DSO.
//
// Ces ratios portent sur des ENCOURS : ils sont donc toujours calculés en
// cumulé depuis le 1er janvier de l'exercice, mois par mois, pour l'exercice
// N et l'exercice N-1.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getClickhouseDbName, manualBatchId } from "@/lib/clickhouse/manual-sync";
import { bilanRefExpr } from "@/lib/clickhouse/schema";
import { bilanRefSql, bilanIncludeSql } from "@/lib/reporting/creances";
import {
  BILAN_ACTIF,
  BILAN_PASSIF,
  applyTotals,
  computeResultatTotals,
  normalizeRef,
} from "@/lib/reporting/etats-financiers";
import {
  calculerRatios,
  calculerDso,
  joursEcoules,
  DSO_CA_RUBRIQUES,
  DSO_TVA_COMPTES,
} from "@/lib/reporting/ratios-bilantiels";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

const ACTIF_REFS = new Set(BILAN_ACTIF.map((l) => l.ref));
const PASSIF_REFS = new Set(BILAN_PASSIF.map((l) => l.ref));

// date_transaction est une String "DD/MM/YYYY".
const YM = "concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2))";
const MOIS_SQL = "substring(date_transaction, 4, 2)";
// Comptes de TVA collectée : préfixes du modèle, aucune entrée utilisateur.
const TVA_SQL = DSO_TVA_COMPTES.map((c) => `startsWith(compte, '${c}')`).join(" OR ");

const MOIS_LABELS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

interface BilanRow {
  mois: string;
  ref: string;
  solde_debit: string;
  solde_credit: string;
}
interface ComptesRow {
  mois: string;
  solde_414: string;
  tva_collectee: string;
}
interface AnRow {
  creances_an: string;
}
interface ResultatRow {
  mois: string;
  ref: string;
  solde: string;
}

/** Série mensuelle cumulée d'un exercice. */
interface PointExercice {
  mois: number;
  frng: number;
  bfrGlobal: number;
  bfrExploitation: number;
  bfrHao: number;
  dettesFinancieres: number;
  emprunts: number;
  creditBail: number;
  dso: number;
  creancesTTC: number;
  caTTC: number;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true, excludeManualEntries: true },
    });
    if (!client) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    if (client.companyId !== session.user.companyId)
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const moisFin = Math.min(12, Math.max(1, parseInt(searchParams.get("month") || "12", 10) || 12));
    const selectedYear = parseInt(searchParams.get("year") || "", 10);

    const dbName = getClickhouseDbName(id);
    const REF_EXPR = await bilanRefExpr(clickhouse, dbName);
    const BILAN_REF = bilanRefSql(REF_EXPR);
    const BILAN_INCLUDE = bilanIncludeSql(REF_EXPR);

    const periods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true, year: true },
      orderBy: [{ year: "desc" }],
    });
    const batchsParAnnee = new Map<number, string[]>();
    for (const p of periods) {
      const l = batchsParAnnee.get(p.year) ?? [];
      if (p.batchId) l.push(p.batchId);
      batchsParAnnee.set(p.year, l);
    }
    const availableYears = [...batchsParAnnee.keys()].sort((a, b) => b - a);
    if (availableYears.length === 0)
      return NextResponse.json({ error: "Aucune période comptable" }, { status: 404 });

    const yearN = availableYears.includes(selectedYear) ? selectedYear : availableYears[0];
    const yearN1 = yearN - 1;

    // Série cumulée d'un exercice, mois par mois.
    const serieExercice = async (y: number): Promise<PointExercice[]> => {
      const batchIds = [...(batchsParAnnee.get(y) ?? [])];
      if (!client.excludeManualEntries) batchIds.push(manualBatchId(id, y));

      // Mouvements du mois (non cumulés) : le cumul est fait ensuite en TS.
      const actifMois = new Map<number, Record<string, number>>();
      const passifMois = new Map<number, Record<string, number>>();
      const resultatMois = new Map<number, Record<string, number>>();
      const solde414Mois = new Map<number, number>();
      const tvaMois = new Map<number, number>();
      let creancesDebut = 0;

      if (batchIds.length > 0) {
        const qp = {
          batchIds,
          startYM: `${y}01`,
          endYM: `${y}12`,
          anDate: `01/01/${y}`,
        };
        try {
          const [bRes, cRes, anRes, rRes] = await Promise.all([
            clickhouse.query({
              query: `
                SELECT ${MOIS_SQL} AS mois,
                       ${BILAN_REF} AS ref,
                       sum(debit - credit) AS solde_debit,
                       sum(credit - debit) AS solde_credit
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)})
                  AND ${BILAN_INCLUDE}
                  AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
                GROUP BY mois, ref
              `,
              query_params: qp,
              format: "JSONEachRow",
            }),
            clickhouse.query({
              query: `
                SELECT ${MOIS_SQL} AS mois,
                       sumIf(debit - credit, startsWith(compte, '414')) AS solde_414,
                       sumIf(credit, ${TVA_SQL}) AS tva_collectee
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)})
                  AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
                GROUP BY mois
              `,
              query_params: qp,
              format: "JSONEachRow",
            }),
            // Encours clients à l'ouverture : les à-nouveaux, datés du 01/01.
            clickhouse.query({
              query: `
                SELECT sumIf(debit - credit, startsWith(${BILAN_REF}, 'BI'))
                         - sumIf(debit - credit, startsWith(compte, '414')) AS creances_an
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)})
                  AND date_transaction = {anDate:String}
              `,
              query_params: qp,
              format: "JSONEachRow",
            }),
            clickhouse.query({
              query: `
                SELECT ${MOIS_SQL} AS mois, rubrique AS ref, sum(credit - debit) AS solde
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)})
                  AND rubrique != ''
                  AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
                GROUP BY mois, ref
              `,
              query_params: qp,
              format: "JSONEachRow",
            }),
          ]);

          for (const row of (await bRes.json()) as BilanRow[]) {
            const m = parseInt(row.mois, 10);
            if (!Number.isFinite(m)) continue;
            const inActif = normalizeRef(row.ref, ACTIF_REFS);
            if (inActif) {
              const acc = actifMois.get(m) ?? {};
              acc[inActif] = (acc[inActif] || 0) + (parseFloat(row.solde_debit) || 0);
              actifMois.set(m, acc);
              continue;
            }
            const inPassif = normalizeRef(row.ref, PASSIF_REFS);
            if (inPassif) {
              const acc = passifMois.get(m) ?? {};
              acc[inPassif] = (acc[inPassif] || 0) + (parseFloat(row.solde_credit) || 0);
              passifMois.set(m, acc);
            }
          }
          for (const row of (await cRes.json()) as ComptesRow[]) {
            const m = parseInt(row.mois, 10);
            if (!Number.isFinite(m)) continue;
            solde414Mois.set(m, parseFloat(row.solde_414) || 0);
            tvaMois.set(m, parseFloat(row.tva_collectee) || 0);
          }
          const anRows = (await anRes.json()) as AnRow[];
          creancesDebut = parseFloat(anRows[0]?.creances_an ?? "0") || 0;
          for (const row of (await rRes.json()) as ResultatRow[]) {
            const m = parseInt(row.mois, 10);
            if (!Number.isFinite(m)) continue;
            const acc = resultatMois.get(m) ?? {};
            const ref = (row.ref || "").trim().toUpperCase();
            acc[ref] = (acc[ref] || 0) + (parseFloat(row.solde) || 0);
            resultatMois.set(m, acc);
          }
        } catch (e) {
          console.error(`[ratios] ClickHouse indisponible (exercice ${y}):`, e);
        }
      }

      // Cumul mois par mois.
      const actifCumul: Record<string, number> = {};
      const passifCumul: Record<string, number> = {};
      const resultatCumul: Record<string, number> = {};
      let cumul414 = 0;
      let cumulTva = 0;
      const points: PointExercice[] = [];

      for (let m = 1; m <= 12; m++) {
        for (const [ref, v] of Object.entries(actifMois.get(m) ?? {}))
          actifCumul[ref] = (actifCumul[ref] || 0) + v;
        for (const [ref, v] of Object.entries(passifMois.get(m) ?? {}))
          passifCumul[ref] = (passifCumul[ref] || 0) + v;
        for (const [ref, v] of Object.entries(resultatMois.get(m) ?? {}))
          resultatCumul[ref] = (resultatCumul[ref] || 0) + v;
        cumul414 += solde414Mois.get(m) || 0;
        cumulTva += tvaMois.get(m) || 0;

        // Le résultat net de l'exercice alimente CJ tant que les comptes de
        // gestion ne sont pas soldés — sans quoi DF (ressources stables) est
        // incomplet et le FRNG faux.
        const sig = computeResultatTotals(resultatCumul);
        const passifAvecResultat = { ...passifCumul };
        passifAvecResultat.CJ = (passifAvecResultat.CJ || 0) + sig.XI;

        const soldes = {
          actif: applyTotals(BILAN_ACTIF, actifCumul),
          passif: applyTotals(BILAN_PASSIF, passifAvecResultat),
        };
        const ratios = calculerRatios(soldes);

        const creancesFin = (soldes.actif.BI || 0) - cumul414;
        const caTTC =
          DSO_CA_RUBRIQUES.reduce((t, r) => t + (resultatCumul[r] || 0), 0) + cumulTva;
        const dso = calculerDso({
          creancesDebut,
          creancesFin,
          caTTC,
          jours: joursEcoules(y, m),
        });

        points.push({ mois: m, ...ratios, dso, creancesTTC: creancesFin, caTTC });
      }
      return points;
    };

    const [serieN, serieN1] = await Promise.all([serieExercice(yearN), serieExercice(yearN1)]);

    // Série affichée : janvier → mois sélectionné.
    const chartData = Array.from({ length: moisFin }, (_, i) => {
      const n = serieN[i];
      const n1 = serieN1[i];
      return {
        label: MOIS_LABELS[i],
        frng: n.frng,
        frngN1: n1.frng,
        bfrGlobal: n.bfrGlobal,
        bfrGlobalN1: n1.bfrGlobal,
        bfrExploitation: n.bfrExploitation,
        bfrHao: n.bfrHao,
        dettesFinancieres: n.dettesFinancieres,
        dettesFinancieresN1: n1.dettesFinancieres,
        emprunts: n.emprunts,
        creditBail: n.creditBail,
        dso: n.dso,
        dsoN1: n1.dso,
      };
    });

    const finN = serieN[moisFin - 1];
    const finN1 = serieN1[moisFin - 1];
    const indicateur = (k: keyof PointExercice) => ({
      valeurN: finN[k],
      valeurN1: finN1[k],
      variation:
        finN1[k] !== 0
          ? ((finN[k] - finN1[k]) / Math.abs(finN1[k])) * 100
          : finN[k] !== 0
            ? 100
            : 0,
    });

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      yearN,
      yearN1,
      availableYears,
      manualIncluded: !client.excludeManualEntries,
      jours: joursEcoules(yearN, moisFin),
      kpis: {
        frng: indicateur("frng"),
        bfrGlobal: indicateur("bfrGlobal"),
        bfrExploitation: indicateur("bfrExploitation"),
        bfrHao: indicateur("bfrHao"),
        dettesFinancieres: indicateur("dettesFinancieres"),
        emprunts: indicateur("emprunts"),
        creditBail: indicateur("creditBail"),
        dso: indicateur("dso"),
      },
      dsoDetail: {
        creancesTTC: finN.creancesTTC,
        caTTC: finN.caTTC,
      },
      chartData,
    });
  } catch (error) {
    console.error("Ratios bilantiels error:", error);
    return NextResponse.json({ error: "Erreur lors du calcul des ratios" }, { status: 500 });
  }
}
