import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getClickhouseDbName, manualBatchId } from "@/lib/clickhouse/manual-sync";
import { bilanRefSql, bilanIncludeSql } from "@/lib/reporting/creances";
import { bilanRefExpr } from "@/lib/clickhouse/schema";
import {
  BILAN_ACTIF,
  BILAN_PASSIF,
  COMPTE_RESULTAT,
  AMORT_PREFIXES,
  applyTotals,
  computeResultatTotals,
  normalizeRef,
} from "@/lib/reporting/etats-financiers";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

const ACTIF_REFS = new Set(BILAN_ACTIF.map((l) => l.ref));
const PASSIF_REFS = new Set(BILAN_PASSIF.map((l) => l.ref));
const RESULTAT_REFS = new Set(COMPTE_RESULTAT.map((l) => l.ref));

// Condition SQL « le compte est un compte d'amortissement / dépréciation ».
// Les préfixes sont des constantes du modèle (aucune entrée utilisateur).
const IS_AMORT = AMORT_PREFIXES.map((p) => `startsWith(compte, '${p}')`).join(" OR ");
// date_transaction est une String "DD/MM/YYYY" → période comparable "YYYYMM".
const YM = "concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2))";

interface BilanRow {
  ref: string;
  brut: string;
  amort: string;
  solde_credit: string;
}
interface ResultatRow {
  ref: string;
  solde: string;
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

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
    // Filtres partagés avec les autres onglets de reporting.
    const periodType = searchParams.get("periodType") || "ytd";
    const cumule = periodType === "ytd" || periodType === "ytd-day";
    const surAnnee = periodType === "year";
    const month = (searchParams.get("month") || "12").padStart(2, "0");
    const selectedYear = parseInt(searchParams.get("year") || "", 10);

// Mois de clôture de la fenêtre, commun aux deux états.
    const moisFin = surAnnee ? "12" : month;

    // Le BILAN est une photo à une date : il part toujours du 1er janvier.
    // Le tronquer au seul mois sélectionné exclurait l'à-nouveau et le bilan
    // ne s'équilibrerait plus — le mode « périodique » n'a donc de sens que
    // pour les flux.
    const fenetreBilan = (y: number) => ({ start: `${y}01`, end: `${y}${moisFin}` });

    // Le COMPTE DE RÉSULTAT porte des flux : il suit le mode choisi.
    const periodique = !cumule && !surAnnee;
    const fenetreResultat = (y: number) =>
      periodique
        ? { start: `${y}${month}`, end: `${y}${month}` }
        : { start: `${y}01`, end: `${y}${moisFin}` };
    const periodeLabel = surAnnee
      ? "Janvier - Décembre"
      : cumule
        ? `Janvier - ${MOIS[parseInt(month, 10) - 1]}`
        : MOIS[parseInt(month, 10) - 1];

    const dbName = getClickhouseDbName(id);
    // Schéma fusionné (une seule colonne `rubrique`) ou schéma d'origine :
    // l'expression est résolue à partir des colonnes réellement présentes.
    const REF_EXPR = await bilanRefExpr(clickhouse, dbName);
    const BILAN_REF = bilanRefSql(REF_EXPR);
    const BILAN_INCLUDE = bilanIncludeSql(REF_EXPR);

    // Exercices disponibles, du plus récent au plus ancien. Si une année est
    // sélectionnée, elle devient l'exercice N (les suivantes sont ignorées).
    const periods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true, year: true, periodEnd: true },
      orderBy: [{ year: "desc" }, { periodEnd: "desc" }],
    });

    const byYear = new Map<number, { batchIds: string[]; periodEnd: Date }>();
    for (const p of periods) {
      const e = byYear.get(p.year);
      if (e) {
        if (p.batchId) e.batchIds.push(p.batchId);
        if (p.periodEnd > e.periodEnd) e.periodEnd = p.periodEnd;
      } else {
        byYear.set(p.year, { batchIds: p.batchId ? [p.batchId] : [], periodEnd: p.periodEnd });
      }
    }

    // Toutes les années présentes (sert au sélecteur "Année" du filtre).
    const availableYears = [...byYear.keys()].sort((a, b) => b - a);

    const years = [...byYear.keys()]
      .filter((y) => (Number.isFinite(selectedYear) ? y <= selectedYear : true))
      .sort((a, b) => b - a);

    // Intitulé d'un exercice : la date de fin de la fenêtre filtrée, bornée à
    // la clôture réelle (inutile d'annoncer 31/12 si l'exercice s'arrête en
    // avril). Filtrer sur avril affiche donc « 30/04/2026 » et « 30/04/2025 ».
    const libelleExercice = (y: number) => {
      const clotureReelle = byYear.get(y)!.periodEnd;
      const finFenetre = new Date(Date.UTC(y, parseInt(moisFin, 10), 0));
      const d = finFenetre < clotureReelle ? finFenetre : clotureReelle;
      return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    };

    const exercicesCalcules: Array<{
      year: number;
      label: string;
      avecDonnees: boolean;
      brut: Record<string, number>;
      amort: Record<string, number>;
      net: Record<string, number>;
      passif: Record<string, number>;
      resultat: Record<string, number>;
    }> = [];

    for (const y of years) {
      const batchIds = [...byYear.get(y)!.batchIds];
      if (!client.excludeManualEntries) batchIds.push(manualBatchId(id, y));
      const bilanWin = fenetreBilan(y);
      const resWin = fenetreResultat(y);

      const brut: Record<string, number> = {};
      const amort: Record<string, number> = {};
      const passif: Record<string, number> = {};
      // `res` alimente le compte de résultat affiché ; `resCumul` sert au
      // report du résultat net au bilan (CJ), qui est toujours cumulé.
      const res: Record<string, number> = {};
      const resCumul: Record<string, number> = {};
      let lignesLues = 0;

      if (batchIds.length > 0) {
        try {
          const qp = {
            batchIds,
            startYM: bilanWin.start,
            endYM: bilanWin.end,
            startRes: resWin.start,
            endRes: resWin.end,
          };
          const [bRes, rRes, rCumul] = await Promise.all([
            clickhouse.query({
              query: `
                SELECT ${BILAN_REF} AS ref,
                       sumIf(debit - credit, NOT (${IS_AMORT})) AS brut,
                       sumIf(credit - debit, ${IS_AMORT})       AS amort,
                       sum(credit - debit)                      AS solde_credit
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)})
                  AND ${BILAN_INCLUDE}
                  AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
                GROUP BY ref
              `,
              query_params: qp,
              format: "JSONEachRow",
            }),
            clickhouse.query({
              query: `
                SELECT rubrique AS ref, sum(credit - debit) AS solde
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)})
                  AND rubrique != ''
                  AND ${YM} >= {startRes:String} AND ${YM} <= {endRes:String}
                GROUP BY rubrique
              `,
              query_params: qp,
              format: "JSONEachRow",
            }),
            // Résultat cumulé depuis janvier : seul report valable au bilan.
            clickhouse.query({
              query: `
                SELECT rubrique AS ref, sum(credit - debit) AS solde
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)})
                  AND rubrique != ''
                  AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
                GROUP BY rubrique
              `,
              query_params: qp,
              format: "JSONEachRow",
            }),
          ]);

          const bilanRows = (await bRes.json()) as BilanRow[];
          lignesLues += bilanRows.length;
          for (const row of bilanRows) {
            const inActif = normalizeRef(row.ref, ACTIF_REFS);
            if (inActif) {
              brut[inActif] = (brut[inActif] || 0) + (parseFloat(row.brut) || 0);
              amort[inActif] = (amort[inActif] || 0) + (parseFloat(row.amort) || 0);
              continue;
            }
            const inPassif = normalizeRef(row.ref, PASSIF_REFS);
            if (inPassif) {
              passif[inPassif] = (passif[inPassif] || 0) + (parseFloat(row.solde_credit) || 0);
            }
          }

          const resRows = (await rRes.json()) as ResultatRow[];
          lignesLues += resRows.length;
          for (const row of resRows) {
            const ref = normalizeRef(row.ref, RESULTAT_REFS);
            if (ref) res[ref] = (res[ref] || 0) + (parseFloat(row.solde) || 0);
          }
          for (const row of (await rCumul.json()) as ResultatRow[]) {
            const ref = normalizeRef(row.ref, RESULTAT_REFS);
            if (ref) resCumul[ref] = (resCumul[ref] || 0) + (parseFloat(row.solde) || 0);
          }
        } catch (e) {
          console.error(`[etats-financiers] ClickHouse indisponible (exercice ${y}):`, e);
        }
      }

      // Net = Brut − Amortissements, puis sous-totaux du modèle.
      const net: Record<string, number> = {};
      for (const l of BILAN_ACTIF) {
        if (l.total) continue;
        net[l.ref] = (brut[l.ref] || 0) - (amort[l.ref] || 0);
      }

      // Résultat net de l'exercice (CJ) : il ne porte pas de bilan_rubrique
      // tant que les comptes de gestion ne sont pas soldés — on l'alimente donc
      // depuis le compte de résultat (XI). Si les comptes ont été clôturés, XI
      // vaut 0 et le solde déjà classé en CJ subsiste : pas de double compte.
      const sig = computeResultatTotals(res);
      passif.CJ = (passif.CJ || 0) + computeResultatTotals(resCumul).XI;

      exercicesCalcules.push({
        year: y,
        label: libelleExercice(y),
        avecDonnees: lignesLues > 0,
        brut: applyTotals(BILAN_ACTIF, brut),
        amort: applyTotals(BILAN_ACTIF, amort),
        net: applyTotals(BILAN_ACTIF, net),
        passif: applyTotals(BILAN_PASSIF, passif),
        resultat: sig,
      });
    }

    // Un exercice sans aucune écriture sur la fenêtre filtrée n'apporte rien à
    // la comparaison : on ne l'affiche pas.
    const retenus = exercicesCalcules.filter((e) => e.avecDonnees);
    const exercices = retenus.map((e) => ({ year: e.year, label: e.label }));
    const actifBrut = retenus.map((e) => e.brut);
    const actifAmort = retenus.map((e) => e.amort);
    const actifNet = retenus.map((e) => e.net);
    const passifNet = retenus.map((e) => e.passif);
    const resultatVals = retenus.map((e) => e.resultat);

    const at = (arr: Record<string, number>[], ref: string) => arr.map((v) => v[ref] || 0);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      exercices,
      availableYears,
      manualIncluded: !client.excludeManualEntries,
      periodeLabel,
      // BRUT / AMORT sont fournis pour CHAQUE exercice : la colonne détaillée
      // suit l'exercice affiché en premier dans la fenêtre de comparaison.
      actif: BILAN_ACTIF.map((l) => ({
        ref: l.ref,
        libelle: l.libelle,
        total: !!l.total,
        bruts: at(actifBrut, l.ref),
        amorts: at(actifAmort, l.ref),
        nets: at(actifNet, l.ref),
      })),
      passif: BILAN_PASSIF.map((l) => ({
        ref: l.ref,
        libelle: l.libelle,
        total: !!l.total,
        nets: at(passifNet, l.ref),
      })),
      resultat: COMPTE_RESULTAT.map((l) => ({
        ref: l.ref,
        libelle: l.libelle,
        total: !!l.total,
        sens: l.sens ?? null,
        repere: l.repere ?? null,
        montants: at(resultatVals, l.ref),
      })),
    });
  } catch (error) {
    console.error("États financiers error:", error);
    return NextResponse.json({ error: "Erreur lors du calcul des états financiers" }, { status: 500 });
  }
}
