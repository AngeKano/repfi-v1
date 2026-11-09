// ============================================================================
// Onglet « Trésorerie » — entièrement calculé par RUBRIQUE : trésorerie
// actif (BS… : caisse, banques, régies d'avance, établissements financiers,
// instruments de trésorerie, monnaie électronique, accréditifs) et trésorerie
// passif (DRA, DRB, DRC, DQ : concours bancaires), comparées à l'exercice N-1.
//
// Indicateurs (soldeRubriqueSql) : actif en débit − crédit, dépréciations
// (suffixe « 1 ») et passif en crédit − débit, retranchés dans les formules.
// Détail par compte : débit − crédit pour tous, soit la contribution de chaque
// compte au Total Trésorerie (un découvert ou une dépréciation est négatif) ;
// la somme des comptes est exactement le Total.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { accesReporting } from "@/lib/reporting/acces";
import { filtrerReponse, CHAMPS_TRESORERIE } from "@/lib/reporting/champs-proteges";
import { getClickhouseDbName, manualBatchId } from "@/lib/clickhouse/manual-sync";
import { bilanRefExpr } from "@/lib/clickhouse/schema";
import { planComptesMap, intituleCompte } from "@/lib/clickhouse/plan-comptable";
import { estAmortSql } from "@/lib/reporting/etats-financiers";
import { YM_SQL, moisCouverts } from "@/lib/reporting/periode";
import {
  TRESORERIE_KPIS,
  RUBRIQUES_TRESORERIE,
  RUBRIQUES_TOTAL_TRESORERIE,
  soldeRubriqueSql,
  valeurTresorerie,
} from "@/lib/reporting/tresorerie";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

// Période « AAAAMM » d'une ligne ; un à-nouveau daté du 31/12 précédent
// compte en janvier (solde d'ouverture), comme dans la Synthèse.
const YM = YM_SQL;

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

// N-1 nul : ±100 % selon le signe de N (de 0 à −1 est une baisse).
const variation = (n: number, n1: number): number =>
  n1 !== 0 ? ((n - n1) / Math.abs(n1)) * 100 : Math.sign(n) * 100;

interface RubriqueRow {
  ref: string;
  solde: string;
}
interface CompteRow {
  compte: string;
  intitule: string;
  solde: string;
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
    const acces = await accesReporting(id, session.user);
    if (acces instanceof NextResponse) return acces;

    const { searchParams } = new URL(req.url);
    // Filtres partagés avec les autres onglets de reporting.
    const periodType = searchParams.get("periodType") || "ytd";
    const cumule = periodType === "ytd" || periodType === "ytd-day";
    const surAnnee = periodType === "year";
    // Mois demandé ; ramené plus bas sur un mois couvert par le reporting.
    let month = (searchParams.get("month") || "12").padStart(2, "0");
    const selectedYear = parseInt(searchParams.get("year") || "", 10);

    // Même fenêtre de mois appliquée aux deux exercices, pour que la
    // comparaison N / N-1 porte sur un intervalle identique.
    const fenetre = (y: number) => {
      if (cumule) return { start: `${y}01`, end: `${y}${month}` };
      // Granularité Année : jusqu'au dernier mois couvert (month, ramené).
      if (surAnnee) return { start: `${y}01`, end: `${y}${month}` };
      return { start: `${y}${month}`, end: `${y}${month}` };
    };
    const dbName = getClickhouseDbName(id);
    const REF_EXPR = await bilanRefExpr(clickhouse, dbName);

    const periods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true, year: true, periodStart: true, periodEnd: true },
    });
    // Exercice d'un lot : année de début de sa période (UTC), comme les autres
    // onglets de reporting.
    const anneeDe = (p: { periodStart: Date }) => p.periodStart.getUTCFullYear();
    const batchsParAnnee = new Map<number, string[]>();
    for (const p of periods) {
      const l = batchsParAnnee.get(anneeDe(p)) ?? [];
      if (p.batchId) l.push(p.batchId);
      batchsParAnnee.set(anneeDe(p), l);
    }
    const availableYears = [...batchsParAnnee.keys()].sort((a, b) => b - a);
    if (availableYears.length === 0)
      return NextResponse.json({ error: "Aucune période comptable" }, { status: 404 });

    // Année sans reporting : la plus récente ; l'écran aligne son filtre sur
    // l'année renvoyée (yearN).
    const yearN = availableYears.includes(selectedYear) ? selectedYear : availableYears[0];
    const yearN1 = yearN - 1;
    // N-1 sans reporting : comparaison affichée « non disponible ».
    const anneeN1Disponible = batchsParAnnee.has(yearN1);

    // Mois couverts par le reporting de N ; un mois hors reporting devient le
    // dernier mois couvert (la fenêtre ne dépasse jamais l'import).
    const moisDisponibles = moisCouverts(periods.filter((p) => anneeDe(p) === yearN));
    if (moisDisponibles.length > 0 && !moisDisponibles.includes(month)) {
      month = moisDisponibles[moisDisponibles.length - 1];
    }
    const premierMois = moisDisponibles[0] ?? "01";
    const periodeLabel = cumule
      ? `${MOIS[parseInt(premierMois, 10) - 1]} - ${MOIS[parseInt(month, 10) - 1]}`
      : surAnnee
        ? `${MOIS[parseInt(premierMois, 10) - 1]} - ${MOIS[parseInt(month, 10) - 1]}`
        : MOIS[parseInt(month, 10) - 1];

    const plan = await planComptesMap(clickhouse, dbName);

    // Soldes d'un exercice : par rubrique (KPI) et par compte (histogramme).
    const soldesExercice = async (y: number) => {
      const batchIds = [...(batchsParAnnee.get(y) ?? [])];
      if (!client.excludeManualEntries) batchIds.push(manualBatchId(id, y));
      const rubriques: Record<string, number> = {};
      const comptes = new Map<string, { intitule: string; solde: number }>();
      if (batchIds.length === 0) return { rubriques, comptes };

      const { start, end } = fenetre(y);
      const qp = {
        batchIds,
        startYM: start,
        endYM: end,
        // Soldes à lire pour les indicateurs (actif et passif).
        indicateurs: RUBRIQUES_TRESORERIE,
        // Détail par compte : les rubriques du Total, pour que la ligne
        // « Total Trésorerie » du tableau égale l'indicateur.
        rubriques: RUBRIQUES_TOTAL_TRESORERIE,
      };
      try {
        const [rRes, cRes] = await Promise.all([
          clickhouse.query({
            query: `
              SELECT ${REF_EXPR} AS ref,
                     ${soldeRubriqueSql(REF_EXPR, estAmortSql(REF_EXPR))} AS solde
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)})
                AND ${REF_EXPR} IN ({indicateurs:Array(String)})
                AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
              GROUP BY ref
            `,
            query_params: qp,
            format: "JSONEachRow",
          }),
          clickhouse.query({
            query: `
              SELECT compte,
                     anyIf(intitule_compte, intitule_compte != '') AS intitule,
                     sum(debit - credit) AS solde
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)})
                AND ${REF_EXPR} IN ({rubriques:Array(String)})
                AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
              GROUP BY compte
            `,
            query_params: qp,
            format: "JSONEachRow",
          }),
        ]);
        for (const row of (await rRes.json()) as RubriqueRow[]) {
          const code = (row.ref || "").trim().toUpperCase();
          rubriques[code] = (rubriques[code] || 0) + (parseFloat(row.solde) || 0);
        }
        for (const row of (await cRes.json()) as CompteRow[])
          comptes.set(row.compte, {
            intitule: intituleCompte(plan, row.compte, row.intitule),
            solde: parseFloat(row.solde) || 0,
          });
      } catch (e) {
        console.error(`[tresorerie] ClickHouse indisponible (exercice ${y}):`, e);
      }
      return { rubriques, comptes };
    };

    const [n, n1] = await Promise.all([soldesExercice(yearN), soldesExercice(yearN1)]);

    const kpis = Object.fromEntries(
      TRESORERIE_KPIS.map((k) => {
        const valeurN = valeurTresorerie(k, n.rubriques);
        const valeurN1 = valeurTresorerie(k, n1.rubriques);
        return [k.id, { valeurN, valeurN1, variation: variation(valeurN, valeurN1) }];
      }),
    );

    // Détail par compte : union des deux exercices, du plus gros solde au plus
    // petit (un compte soldé à zéro sur les deux exercices est écarté).
    const tousComptes = new Set([...n.comptes.keys(), ...n1.comptes.keys()]);
    const comptes = [...tousComptes]
      .map((compte) => {
        const a = n.comptes.get(compte);
        const b = n1.comptes.get(compte);
        const montantN = a?.solde ?? 0;
        const montantN1 = b?.solde ?? 0;
        return {
          compte,
          intituleCompte: a?.intitule || b?.intitule || intituleCompte(plan, compte, ""),
          montantN,
          montantN1,
          variation: variation(montantN, montantN1),
        };
      })
      .filter((c) => c.montantN !== 0 || c.montantN1 !== 0)
      .sort((x, y) => Math.abs(y.montantN) - Math.abs(x.montantN));

    const reponse = {
      client: { id: client.id, name: client.name },
      yearN,
      yearN1,
      availableYears,
      anneeN1Disponible,
      moisDisponibles,
      month,
      periodeLabel,
      manualIncluded: !client.excludeManualEntries,
      kpis,
      comptes,
    };
    return NextResponse.json(filtrerReponse(reponse, CHAMPS_TRESORERIE, acces.masques));
  } catch (error) {
    console.error("Trésorerie error:", error);
    return NextResponse.json({ error: "Erreur lors du calcul de la trésorerie" }, { status: 500 });
  }
}
