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
  estAmortSql,
  applyTotals,
  computeResultatTotals,
  normalizeRef,
} from "@/lib/reporting/etats-financiers";

// ============================================================================
// États financiers mois par mois.
//
// Pour l'exercice N (année du filtre), chaque mois de janvier au mois
// sélectionné est calculé en PÉRIODIQUE : mouvements du seul mois (janvier
// porte l'à-nouveau, daté du 01/01). La colonne « Cumul N » est la somme de ces
// mois, soit le solde de janvier au mois sélectionné ; « Cumul N-1 » est la
// même fenêtre sur l'exercice précédent, pour la comparaison.
//
// Toutes les formules (sous-totaux, SIG, report du résultat en CJ) sont
// linéaires : la somme des mois est exactement égale au cumul.
// ============================================================================

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

const ACTIF_REFS = new Set(BILAN_ACTIF.map((l) => l.ref));
const PASSIF_REFS = new Set(BILAN_PASSIF.map((l) => l.ref));
const RESULTAT_REFS = new Set(COMPTE_RESULTAT.map((l) => l.ref));

// date_transaction est une String "DD/MM/YYYY" → période comparable "YYYYMM".
const YM = "concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2))";

interface BilanRow {
  ym: string;
  ref: string;
  brut: string;
  amort: string;
  solde_credit: string;
}
interface ResultatRow {
  ym: string;
  ref: string;
  solde: string;
}

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Soldes bruts lus en base pour une période (un mois ou un cumul). */
interface Soldes {
  brut: Record<string, number>;
  amort: Record<string, number>;
  passif: Record<string, number>;
  res: Record<string, number>;
}
/** Montants affichés pour une période, sous-totaux compris. */
interface Etats {
  brut: Record<string, number>;
  amort: Record<string, number>;
  net: Record<string, number>;
  passif: Record<string, number>;
  resultat: Record<string, number>;
}

const soldesVides = (): Soldes => ({ brut: {}, amort: {}, passif: {}, res: {} });

const ajouter = (cible: Record<string, number>, ref: string, v: number) => {
  cible[ref] = (cible[ref] || 0) + v;
};

/** Somme de plusieurs périodes (le cumul est la somme des mois). */
function sommer(liste: Soldes[]): Soldes {
  const out = soldesVides();
  for (const s of liste) {
    for (const k of ["brut", "amort", "passif", "res"] as const)
      for (const [ref, v] of Object.entries(s[k])) ajouter(out[k], ref, v);
  }
  return out;
}

/** Net, sous-totaux du modèle, SIG et report du résultat en CJ. */
function calculerEtats(s: Soldes): Etats {
  const net: Record<string, number> = {};
  for (const l of BILAN_ACTIF) {
    if (l.total) continue;
    net[l.ref] = (s.brut[l.ref] || 0) - (s.amort[l.ref] || 0);
  }
  // Résultat net (CJ) : il ne porte pas de bilan_rubrique tant que les
  // comptes de gestion ne sont pas soldés — on l'alimente donc depuis le
  // compte de résultat (XI) de la MÊME période. Si les comptes ont été
  // clôturés, XI vaut 0 et le solde déjà classé en CJ subsiste.
  const resultat = computeResultatTotals(s.res);
  const passif = { ...s.passif };
  passif.CJ = (passif.CJ || 0) + resultat.XI;
  return {
    brut: applyTotals(BILAN_ACTIF, s.brut),
    amort: applyTotals(BILAN_ACTIF, s.amort),
    net: applyTotals(BILAN_ACTIF, net),
    passif: applyTotals(BILAN_PASSIF, passif),
    resultat,
  };
}

const formaterDate = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

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
    // Filtres partagés avec les autres onglets de reporting : seul le mois de
    // fin compte ici (granularité « Année » → décembre).
    const periodType = searchParams.get("periodType") || "ytd";
    const surAnnee = periodType === "year";
    const moisParam = parseInt(searchParams.get("month") || "12", 10);
    const moisFin = surAnnee || !(moisParam >= 1 && moisParam <= 12) ? 12 : moisParam;
    const selectedYear = parseInt(searchParams.get("year") || "", 10);

    const dbName = getClickhouseDbName(id);
    // Schéma fusionné (une seule colonne `rubrique`) ou schéma d'origine :
    // l'expression est résolue à partir des colonnes réellement présentes.
    const REF_EXPR = await bilanRefExpr(clickhouse, dbName);
    const BILAN_REF = bilanRefSql(REF_EXPR);
    const BILAN_INCLUDE = bilanIncludeSql(REF_EXPR);
    // Amortissements / dépréciations : reconnus à leur RUBRIQUE (AE1, BB1…).
    const IS_AMORT = estAmortSql(REF_EXPR);

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
    if (availableYears.length === 0)
      return NextResponse.json({ error: "Aucune période comptable" }, { status: 404 });

    // Exercice N : l'année du filtre, sinon la plus récente qui la précède.
    const yearN =
      (Number.isFinite(selectedYear) ? availableYears.find((y) => y <= selectedYear) : undefined) ??
      availableYears[0];
    const yearN1 = yearN - 1;

    const mm = (m: number) => String(m).padStart(2, "0");
    const finMois = String(moisFin).padStart(2, "0");

    // Intitulé d'un cumul : la fin de la fenêtre, bornée à la clôture réelle.
    const dateFin = (y: number) => {
      const finFenetre = new Date(Date.UTC(y, moisFin, 0));
      const cloture = byYear.get(y)?.periodEnd;
      return formaterDate(cloture && cloture < finFenetre ? cloture : finFenetre);
    };

    /**
     * Soldes de janvier au mois de fin pour un exercice, mois par mois
     * (index 0 = janvier). `null` si l'exercice n'a aucune écriture.
     */
    const lireExercice = async (y: number): Promise<Soldes[] | null> => {
      const info = byYear.get(y);
      if (!info) return null;
      const batchIds = [...info.batchIds];
      if (!client.excludeManualEntries) batchIds.push(manualBatchId(id, y));
      if (batchIds.length === 0) return null;

      const mois = Array.from({ length: moisFin }, soldesVides);
      const qp = { batchIds, startYM: `${y}01`, endYM: `${y}${finMois}` };
      let lignesLues = 0;
      // Index du mois d'une ligne ; hors fenêtre → ignoré.
      const indexMois = (ym: string) => {
        const m = parseInt(String(ym).slice(4, 6), 10);
        return m >= 1 && m <= moisFin ? m - 1 : -1;
      };

      try {
        const [bRes, rRes] = await Promise.all([
          clickhouse.query({
            query: `
              SELECT ${YM} AS ym,
                     ${BILAN_REF} AS ref,
                     sumIf(debit - credit, NOT (${IS_AMORT})) AS brut,
                     sumIf(credit - debit, ${IS_AMORT})       AS amort,
                     sum(credit - debit)                      AS solde_credit
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)})
                AND ${BILAN_INCLUDE}
                AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
              GROUP BY ym, ref
            `,
            query_params: qp,
            format: "JSONEachRow",
          }),
          clickhouse.query({
            query: `
              SELECT ${YM} AS ym, rubrique AS ref, sum(credit - debit) AS solde
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)})
                AND rubrique != ''
                AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}
              GROUP BY ym, rubrique
            `,
            query_params: qp,
            format: "JSONEachRow",
          }),
        ]);

        const bilanRows = (await bRes.json()) as BilanRow[];
        lignesLues += bilanRows.length;
        for (const row of bilanRows) {
          const i = indexMois(row.ym);
          if (i < 0) continue;
          const inActif = normalizeRef(row.ref, ACTIF_REFS);
          if (inActif) {
            ajouter(mois[i].brut, inActif, parseFloat(row.brut) || 0);
            ajouter(mois[i].amort, inActif, parseFloat(row.amort) || 0);
            continue;
          }
          const inPassif = normalizeRef(row.ref, PASSIF_REFS);
          if (inPassif) ajouter(mois[i].passif, inPassif, parseFloat(row.solde_credit) || 0);
        }

        const resRows = (await rRes.json()) as ResultatRow[];
        lignesLues += resRows.length;
        for (const row of resRows) {
          const i = indexMois(row.ym);
          if (i < 0) continue;
          const ref = normalizeRef(row.ref, RESULTAT_REFS);
          if (ref) ajouter(mois[i].res, ref, parseFloat(row.solde) || 0);
        }
      } catch (e) {
        console.error(`[etats-financiers] ClickHouse indisponible (exercice ${y}):`, e);
        return null;
      }
      return lignesLues > 0 ? mois : null;
    };

    const [moisN, moisN1] = await Promise.all([lireExercice(yearN), lireExercice(yearN1)]);

    const vides = Array.from({ length: moisFin }, soldesVides);
    const etatsMois = (moisN ?? vides).map(calculerEtats);
    const cumulN = calculerEtats(sommer(moisN ?? vides));
    // Un exercice N-1 sans écriture sur la fenêtre n'apporte rien : pas de colonne.
    const cumulN1 = moisN1 ? calculerEtats(sommer(moisN1)) : null;

    const parMois = (k: keyof Etats, ref: string) => etatsMois.map((e) => e[k][ref] || 0);
    const v = (e: Etats | null, k: keyof Etats, ref: string) => (e ? e[k][ref] || 0 : 0);

    const periodeLabel = `Janvier - ${MOIS[moisFin - 1]} ${yearN}`;

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      availableYears,
      manualIncluded: !client.excludeManualEntries,
      periodeLabel,
      yearN,
      yearN1: cumulN1 ? yearN1 : null,
      // Colonnes mensuelles (périodiques), de janvier au mois sélectionné.
      mois: Array.from({ length: moisFin }, (_, i) => ({
        ym: `${yearN}${mm(i + 1)}`,
        label: `${MOIS[i]} ${yearN}`,
      })),
      cumulN: { label: `Janvier - ${MOIS[moisFin - 1]} ${yearN}`, dateFin: dateFin(yearN) },
      cumulN1: cumulN1
        ? { label: `Janvier - ${MOIS[moisFin - 1]} ${yearN1}`, dateFin: dateFin(yearN1) }
        : null,
      actif: BILAN_ACTIF.map((l) => ({
        ref: l.ref,
        libelle: l.libelle,
        total: !!l.total,
        mois: parMois("net", l.ref),
        brut: v(cumulN, "brut", l.ref),
        amort: v(cumulN, "amort", l.ref),
        net: v(cumulN, "net", l.ref),
        netN1: v(cumulN1, "net", l.ref),
      })),
      passif: BILAN_PASSIF.map((l) => ({
        ref: l.ref,
        libelle: l.libelle,
        total: !!l.total,
        mois: parMois("passif", l.ref),
        cumul: v(cumulN, "passif", l.ref),
        cumulN1: v(cumulN1, "passif", l.ref),
      })),
      resultat: COMPTE_RESULTAT.map((l) => ({
        ref: l.ref,
        libelle: l.libelle,
        total: !!l.total,
        sens: l.sens ?? null,
        repere: l.repere ?? null,
        mois: parMois("resultat", l.ref),
        cumul: v(cumulN, "resultat", l.ref),
        cumulN1: v(cumulN1, "resultat", l.ref),
      })),
    });
  } catch (error) {
    console.error("États financiers error:", error);
    return NextResponse.json({ error: "Erreur lors du calcul des états financiers" }, { status: 500 });
  }
}
