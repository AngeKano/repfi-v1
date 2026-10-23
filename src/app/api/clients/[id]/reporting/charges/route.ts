// ============================================================================
// Analyse des charges et du résultat (onglet Résultats).
//
// Renvoie, pour l'exercice N et l'exercice N-1 sur la MÊME fenêtre de mois
// (filtres partagés du reporting), le montant signé (crédit − débit) de
// chaque rubrique du compte de résultat, le détail par compte (navigation
// catégorie → rubrique → comptes), les dates de situation et un contrôle
// indépendant du résultat. Les calculs (coûts, poids, cascade, pont) sont
// faits côté écran par lib/reporting/analyse-charges.ts.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getClickhouseDbName, manualBatchId } from "@/lib/clickhouse/manual-sync";
import { planComptesMap, intituleCompte } from "@/lib/clickhouse/plan-comptable";
import { normalizeRef } from "@/lib/reporting/etats-financiers";
import { REFS_ANALYSE } from "@/lib/reporting/analyse-charges";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

// date_transaction est une String "DD/MM/YYYY" → périodes comparables.
const YM = "concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2))";
const YMD = `concat(${YM}, substring(date_transaction, 1, 2))`;
// Comptes de gestion : base du contrôle indépendant du résultat.
const COMPTE_GESTION = "(startsWith(compte, '6') OR startsWith(compte, '7') OR startsWith(compte, '8'))";

const REFS = new Set(REFS_ANALYSE);

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

interface LigneCompte {
  ref: string;
  compte: string;
  intitule: string;
  solde: string;
}

interface CompteCharges {
  compte: string;
  intitule: string;
  montant: number;
}

interface PeriodeChargesApi {
  year: number;
  /** false : aucune écriture sur la fenêtre (données non disponibles). */
  disponible: boolean;
  debut: string;
  /**
   * Date de situation : fin du dernier mois mouvementé de la fenêtre (une
   * situation arrêtée en août est « au 31/08 », même si la dernière écriture
   * est du 29). Sert aussi à juger si les deux périodes sont comparables.
   */
  fin: string;
  /** Nombre de mois couverts, du début de la fenêtre au dernier mois mouvementé. */
  nbMois: number;
  /** Montant signé (crédit − débit) par rubrique. */
  rubriques: Record<string, number>;
  /** Détail par compte de chaque rubrique (montants signés). */
  comptes: Record<string, CompteCharges[]>;
  /** Solde (crédit − débit) de tous les comptes 6, 7 et 8 : contrôle de XI. */
  resultatComptes: number;
}

/** Dernier jour du mois, au format "DD/MM/YYYY". */
const finDeMois = (y: number, m: number) =>
  `${new Date(Date.UTC(y, m, 0)).getUTCDate()}/${String(m).padStart(2, "0")}/${y}`;

interface EcritureRow {
  date_transaction: string;
  code_journal: string;
  numero_piece: string;
  n_tiers: string;
  intitule_tiers: string;
  debit: string;
  credit: string;
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
    // Mêmes conventions que les autres onglets : « month » = le seul mois,
    // « ytd » / « ytd-day » = janvier → mois, « year » = l'année entière.
    const periodType = searchParams.get("periodType") || "year";
    const moisParam = parseInt(searchParams.get("month") || "12", 10);
    const mois = moisParam >= 1 && moisParam <= 12 ? moisParam : 12;
    const selectedYear = parseInt(searchParams.get("year") || "", 10);
    const mm = (m: number) => String(m).padStart(2, "0");
    const fenetre =
      periodType === "month"
        ? { debut: mois, fin: mois }
        : periodType === "ytd" || periodType === "ytd-day"
          ? { debut: 1, fin: mois }
          : { debut: 1, fin: 12 };
    const periodeLabel =
      fenetre.debut === fenetre.fin
        ? MOIS[fenetre.fin - 1]
        : `${MOIS[fenetre.debut - 1]} - ${MOIS[fenetre.fin - 1]}`;

    const periods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true, year: true },
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

    const dbName = getClickhouseDbName(id);
    const plan = await planComptesMap(clickhouse, dbName);

    const lirePeriode = async (y: number): Promise<PeriodeChargesApi> => {
      const vide: PeriodeChargesApi = {
        year: y,
        disponible: false,
        debut: `01/${mm(fenetre.debut)}/${y}`,
        fin: finDeMois(y, fenetre.fin),
        nbMois: fenetre.fin - fenetre.debut + 1,
        rubriques: {},
        comptes: {},
        resultatComptes: 0,
      };
      const batchIds = [...(batchsParAnnee.get(y) ?? [])];
      if (batchIds.length === 0) return vide;
      if (!client.excludeManualEntries) batchIds.push(manualBatchId(id, y));
      const qp = { batchIds, startYM: `${y}${mm(fenetre.debut)}`, endYM: `${y}${mm(fenetre.fin)}` };
      const where = `batch_id IN ({batchIds:Array(String)})
                     AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}`;
      try {
        const [rLignes, rControle] = await Promise.all([
          clickhouse.query({
            query: `
              SELECT rubrique AS ref, compte,
                     anyIf(intitule_compte, intitule_compte != '') AS intitule,
                     sum(credit - debit) AS solde
              FROM ${dbName}.grand_livre
              WHERE ${where} AND rubrique != ''
              GROUP BY ref, compte
            `,
            query_params: qp,
            format: "JSONEachRow",
          }),
          clickhouse.query({
            query: `
              SELECT sumIf(credit - debit, ${COMPTE_GESTION}) AS resultat,
                     max(${YMD}) AS derniere,
                     count() AS lignes
              FROM ${dbName}.grand_livre
              WHERE ${where}
            `,
            query_params: qp,
            format: "JSONEachRow",
          }),
        ]);
        const controle = ((await rControle.json()) as Array<{
          resultat: string;
          derniere: string;
          lignes: string;
        }>)[0];
        if (!controle || Number(controle.lignes) === 0) return vide;

        const rubriques: Record<string, number> = {};
        const comptes: Record<string, CompteCharges[]> = {};
        for (const row of (await rLignes.json()) as LigneCompte[]) {
          const ref = normalizeRef(row.ref, REFS);
          if (!ref) continue;
          const montant = parseFloat(row.solde) || 0;
          rubriques[ref] = (rubriques[ref] || 0) + montant;
          (comptes[ref] ??= []).push({
            compte: row.compte,
            intitule: intituleCompte(plan, row.compte, row.intitule),
            montant,
          });
        }
        for (const l of Object.values(comptes))
          l.sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant));

        // Mois du dernier mouvement, borné à la fenêtre.
        const moisDernier = /^\d{8}$/.test(controle.derniere)
          ? Math.min(fenetre.fin, Math.max(fenetre.debut, parseInt(controle.derniere.slice(4, 6), 10)))
          : fenetre.fin;

        return {
          ...vide,
          disponible: true,
          fin: finDeMois(y, moisDernier),
          nbMois: moisDernier - fenetre.debut + 1,
          rubriques,
          comptes,
          resultatComptes: parseFloat(controle.resultat) || 0,
        };
      } catch (e) {
        console.error(`[charges] ClickHouse indisponible (exercice ${y}):`, e);
        return vide;
      }
    };

    // Dernier niveau du détail : les écritures d'un compte sur la période N.
    const compteDemande = (searchParams.get("compte") || "").trim();
    if (compteDemande) {
      const batchIds = [...(batchsParAnnee.get(yearN) ?? [])];
      if (!client.excludeManualEntries) batchIds.push(manualBatchId(id, yearN));
      const LIMITE = 300;
      if (batchIds.length === 0) return NextResponse.json({ total: 0, limite: LIMITE, ecritures: [] });
      const qp = {
        batchIds,
        compte: compteDemande,
        startYM: `${yearN}${mm(fenetre.debut)}`,
        endYM: `${yearN}${mm(fenetre.fin)}`,
      };
      const where = `batch_id IN ({batchIds:Array(String)})
                     AND compte = {compte:String}
                     AND ${YM} >= {startYM:String} AND ${YM} <= {endYM:String}`;
      const [rLignes, rTotal] = await Promise.all([
        clickhouse.query({
          query: `
            SELECT date_transaction, code_journal, numero_piece, n_tiers, intitule_tiers, debit, credit
            FROM ${dbName}.grand_livre
            WHERE ${where}
            ORDER BY ${YMD}, numero_piece
            LIMIT ${LIMITE}
          `,
          query_params: qp,
          format: "JSONEachRow",
        }),
        clickhouse.query({
          query: `SELECT count() AS c FROM ${dbName}.grand_livre WHERE ${where}`,
          query_params: qp,
          format: "JSONEachRow",
        }),
      ]);
      const total = parseInt(((await rTotal.json()) as Array<{ c: string }>)[0]?.c || "0", 10);
      return NextResponse.json({
        total,
        limite: LIMITE,
        ecritures: ((await rLignes.json()) as EcritureRow[]).map((r) => ({
          date: r.date_transaction,
          journal: r.code_journal,
          piece: r.numero_piece,
          tiers: r.intitule_tiers || r.n_tiers,
          debit: parseFloat(r.debit) || 0,
          credit: parseFloat(r.credit) || 0,
        })),
      });
    }

    const [n, n1] = await Promise.all([lirePeriode(yearN), lirePeriode(yearN - 1)]);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      availableYears,
      manualIncluded: !client.excludeManualEntries,
      periodeLabel,
      n,
      n1,
    });
  } catch (error) {
    console.error("Analyse des charges error:", error);
    return NextResponse.json({ error: "Erreur lors de l'analyse des charges" }, { status: 500 });
  }
}
