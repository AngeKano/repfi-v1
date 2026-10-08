import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { SAISIE_ACTIONS } from "@/lib/permissions/actions";
import {
  getClickhouseDbName,
  syncManualBatch,
  manualBatchId,
} from "@/lib/clickhouse/manual-sync";
import { parseGlFilters, buildClickhouseFilter } from "@/lib/comptable/gl-filters";
import { bilanRefExpr } from "@/lib/clickhouse/schema";
import {
  planComptesMap,
  planTiersList,
  intituleCompte,
} from "@/lib/clickhouse/plan-comptable";
import {
  CODE_JOURNAUX_SET,
  FLAG_IMPORT,
  FLAG_SAISIE,
  isCentralizingAccount,
  suggestTypeTiers,
} from "@/lib/comptable/saisie-refs";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

const PAGE_SIZE = 25;
const BALANCE_TOLERANCE = 0.01;

// ---- Helpers ----------------------------------------------------------------

// Récupère, pour une liste de comptes, l'intitulé + rubrique + bilan_rubrique
// tels qu'ils existent déjà dans le grand livre du client. Sert (1) à valider
// que le compte EXISTE (l'utilisateur ne peut pas en créer) et (2) à hériter
// des rubriques pour que la ligne s'agrège correctement dans le reporting.
async function lookupComptes(
  dbName: string,
  batchIds: string[],
  comptes: string[],
  refExpr: string,
): Promise<Map<string, { intitule: string; rubrique: string; bilan: string }>> {
  const map = new Map<string, { intitule: string; rubrique: string; bilan: string }>();
  if (comptes.length === 0) return map;

  // Rubriques observées dans le grand livre, tous comptes confondus : elles
  // servent aussi à faire hériter un compte neuf de son collectif.
  const observe = new Map<string, { intitule: string; rubrique: string; bilan: string }>();
  if (batchIds.length > 0) {
    try {
      const rows = await clickhouse
        .query({
          query: `
            SELECT compte,
                   anyIf(intitule_compte, intitule_compte != '') AS intitule,
                   anyIf(rubrique, rubrique != '')               AS rubrique,
                   anyIf(${refExpr}, ${refExpr} != '')           AS bilan
            FROM ${dbName}.grand_livre
            WHERE batch_id IN ({batchIds:Array(String)}) AND compte != ''
            GROUP BY compte
          `,
          query_params: { batchIds },
          format: "JSONEachRow",
        })
        .then((r) => r.json() as Promise<Array<{ compte: string; intitule: string; rubrique: string; bilan: string }>>);
      for (const r of rows)
        observe.set(r.compte, { intitule: r.intitule, rubrique: r.rubrique, bilan: r.bilan });
    } catch (e) {
      console.error("[saisie] rubriques du grand livre indisponibles:", e);
    }
  }

  const plan = await planComptesMap(clickhouse, dbName);

  // Rubriques d'un compte jamais mouvementé : on les hérite du compte le plus
  // proche par la gauche (401200 → 401100 → 4011 …), sans quoi l'écriture
  // n'entrerait dans aucun état financier.
  const heriter = (compte: string) => {
    for (let len = compte.length; len >= 3; len--) {
      const prefixe = compte.slice(0, len);
      const hit = observe.get(prefixe);
      if (hit && (hit.rubrique || hit.bilan)) return hit;
      if (len < compte.length) {
        for (const [c, v] of observe) {
          if (c.startsWith(prefixe) && (v.rubrique || v.bilan)) return v;
        }
      }
    }
    return undefined;
  };

  for (const compte of comptes) {
    const exact = observe.get(compte);
    if (exact) {
      map.set(compte, {
        intitule: intituleCompte(plan, compte, exact.intitule),
        rubrique: exact.rubrique,
        bilan: exact.bilan,
      });
      continue;
    }
    // Compte présent au plan comptable mais pas encore mouvementé : il reste
    // utilisable à la saisie.
    const auPlan = intituleCompte(plan, compte, "");
    if (auPlan) {
      const h = heriter(compte);
      map.set(compte, {
        intitule: auPlan,
        rubrique: h?.rubrique ?? "",
        bilan: h?.bilan ?? "",
      });
    }
  }
  return map;
}

async function lookupTiers(
  dbName: string,
  batchIds: string[],
  tiers: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const wanted = tiers.filter((t) => t && t.trim() !== "");
  if (batchIds.length === 0 || wanted.length === 0) return map;
  const rows = await clickhouse
    .query({
      query: `
        SELECT n_tiers, anyIf(intitule_tiers, intitule_tiers != '') AS intitule
        FROM ${dbName}.grand_livre
        WHERE batch_id IN ({batchIds:Array(String)})
          AND n_tiers IN ({tiers:Array(String)})
        GROUP BY n_tiers
      `,
      query_params: { batchIds, tiers: wanted },
      format: "JSONEachRow",
    })
    .then((r) => r.json() as Promise<Array<{ n_tiers: string; intitule: string }>>);
  for (const r of rows) map.set(r.n_tiers, r.intitule);
  return map;
}

async function requireClient(id: string, companyId: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, companyId: true },
  });
  if (!client) return { error: NextResponse.json({ error: "Client non trouvé" }, { status: 404 }) };
  if (client.companyId !== companyId)
    return { error: NextResponse.json({ error: "Accès non autorisé" }, { status: 403 }) };
  return { client };
}

// ============================================================================
// GET — récap paginé du grand livre + lignes saisies + listes de référence.
// ?year=<AAAA>&page=<n>
// ============================================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const check = await requireClient(id, session.user.companyId);
    if (check.error) return check.error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const dbName = getClickhouseDbName(id);
    // Schéma fusionné (une seule colonne `rubrique`) ou schéma d'origine.
    const glRefExpr = await bilanRefExpr(clickhouse, dbName);

    // Périodes du client (sélecteur).
    const periods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      orderBy: [{ year: "desc" }, { periodStart: "desc" }],
      select: { id: true, year: true, periodStart: true, periodEnd: true, batchId: true },
    });
    if (periods.length === 0) {
      return NextResponse.json({
        client: { id: check.client!.id, name: check.client!.name },
        periods: [],
        annees: [],
        annee: null,
        periodesAnnee: [],
        bornes: null,
        uploaded: { rows: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0, totalDebit: 0, totalCredit: 0 },
        manual: [],
        refs: { comptes: [], tiers: [], journaux: [], pieces: [], factures: [], rubriques: [] },
        balance: { debit: 0, credit: 0, delta: 0 },
      });
    }

    // On raisonne par EXERCICE et non par période d'import : un utilisateur
    // pense en années comptables, pas en lots de fichiers déposés.
    const annees = [...new Set(periods.map((p) => p.year))].sort((a, b) => b - a);
    const anneeDemandee = parseInt(searchParams.get("year") || "", 10);
    const annee = annees.includes(anneeDemandee) ? anneeDemandee : annees[0];
    const periodesAnnee = periods.filter((p) => p.year === annee);
    // Bornes de saisie : du début de la première période à la fin de la dernière.
    const debutAnnee = periodesAnnee.reduce(
      (min, p) => (p.periodStart < min ? p.periodStart : min),
      periodesAnnee[0].periodStart,
    );
    const finAnnee = periodesAnnee.reduce(
      (max, p) => (p.periodEnd > max ? p.periodEnd : max),
      periodesAnnee[0].periodEnd,
    );
    const realBatchIds = periods.map((p) => p.batchId).filter(Boolean);

    // Recherche + tri (colonnes whitelistées → pas d'injection ; la valeur de
    // recherche passe par query_params).
    const search = (searchParams.get("search") || "").trim();
    const sortDir = searchParams.get("sortDir") === "desc" ? "DESC" : "ASC";
    const ORDER: Record<string, string> = {
      date: `substring(date_transaction,7,4) ${sortDir}, substring(date_transaction,4,2) ${sortDir}, substring(date_transaction,1,2) ${sortDir}, numero_piece ${sortDir}`,
      compte: `compte ${sortDir}`,
      tiers: `n_tiers ${sortDir}`,
      piece: `numero_piece ${sortDir}`,
      debit: `debit ${sortDir}`,
      credit: `credit ${sortDir}`,
    };
    const orderBy = ORDER[searchParams.get("sortBy") || "date"] || ORDER.date;
    const searchFilter = search
      ? `AND (positionCaseInsensitive(compte, {s:String}) > 0
             OR positionCaseInsensitive(intitule_compte, {s:String}) > 0
             OR positionCaseInsensitive(n_tiers, {s:String}) > 0
             OR positionCaseInsensitive(intitule_tiers, {s:String}) > 0
             OR positionCaseInsensitive(numero_piece, {s:String}) > 0
             OR positionCaseInsensitive(numero_facture, {s:String}) > 0
             OR positionCaseInsensitive(code_journal, {s:String}) > 0
             OR positionCaseInsensitive(rubrique, {s:String}) > 0
             OR positionCaseInsensitive(date_transaction, {s:String}) > 0
             -- Montants : on compare la valeur brute et la valeur arrondie,
             -- pour retrouver aussi bien « 470000 » que « 470000.5 ».
             OR positionCaseInsensitive(toString(debit), {s:String}) > 0
             OR positionCaseInsensitive(toString(credit), {s:String}) > 0
             OR positionCaseInsensitive(toString(toInt64(round(debit))), {s:String}) > 0
             OR positionCaseInsensitive(toString(toInt64(round(credit))), {s:String}) > 0)`
      : "";
    // La vue du grand livre couvre le batch importé ET le batch des saisies de
    // la période : l'origine de chaque ligne est exposée via la colonne Flags.
    const viewBatchIds = [
      ...periodesAnnee.map((p) => p.batchId),
      manualBatchId(id, annee),
    ].filter(Boolean);
    const glFilters = parseGlFilters(searchParams);
    const chFilter = buildClickhouseFilter(glFilters);
    const qParams: Record<string, unknown> = { viewBatchIds, ...chFilter.params };
    if (search) qParams.s = search;

    // Lignes uploadées de la période sélectionnée (lecture seule), paginées.
    const offset = (page - 1) * PAGE_SIZE;
    let uploadedRows: unknown[] = [];
    let total = 0;
    // Totaux sur TOUTES les lignes filtrées, pas seulement la page affichée.
    let totalDebit = 0;
    let totalCredit = 0;
    try {
      const [dataRes, countRes, sumRes] = await Promise.all([
        clickhouse.query({
          query: `
            SELECT date_transaction, compte, intitule_compte, n_tiers, intitule_tiers,
                   numero_piece, rubrique, debit, credit,
                   code_journal, numero_facture, batch_id
            FROM ${dbName}.grand_livre
            WHERE batch_id IN ({viewBatchIds:Array(String)}) ${searchFilter}
            ${chFilter.sql}
            ORDER BY ${orderBy}
            LIMIT ${PAGE_SIZE} OFFSET ${offset}
          `,
          query_params: qParams,
          format: "JSONEachRow",
        }),
        clickhouse.query({
          query: `SELECT count() AS c FROM ${dbName}.grand_livre WHERE batch_id IN ({viewBatchIds:Array(String)}) ${searchFilter} ${chFilter.sql}`,
          query_params: qParams,
          format: "JSONEachRow",
        }),
        clickhouse.query({
          query: `SELECT sum(debit) AS d, sum(credit) AS c
                  FROM ${dbName}.grand_livre
                  WHERE batch_id IN ({viewBatchIds:Array(String)}) ${searchFilter} ${chFilter.sql}`,
          query_params: qParams,
          format: "JSONEachRow",
        }),
      ]);
      const rawRows = (await dataRes.json()) as Array<Record<string, unknown>>;
      uploadedRows = rawRows.map((r) => ({
        ...r,
        flags: String(r.batch_id || "").startsWith("manual_") ? FLAG_SAISIE : FLAG_IMPORT,
      }));
      const cRows = (await countRes.json()) as Array<{ c: string }>;
      total = parseInt(cRows[0]?.c || "0", 10);
      const sRows = (await sumRes.json()) as Array<{ d: string; c: string }>;
      totalDebit = parseFloat(sRows[0]?.d || "0") || 0;
      totalCredit = parseFloat(sRows[0]?.c || "0") || 0;
    } catch (e) {
      console.error("[saisie GET] ClickHouse indisponible:", e);
    }

    // Listes de référence (comptes / tiers existants) sur tout le grand livre.
    // Pour les tiers, on récupère aussi les comptes auxquels ils sont rattachés
    // (groupUniqArray) afin de ne proposer, à la saisie, que les tiers pertinents
    // pour le compte choisi.
    let comptes: Array<{ compte: string; intitule: string; rubrique: string; bilan: string }> = [];
    let tiers: Array<{ nTiers: string; intitule: string; comptes: string[] }> = [];
    // Options des filtres (valeurs distinctes présentes dans la vue).
    let journaux: string[] = [];
    let pieces: string[] = [];
    let factures: string[] = [];
    let rubriques: string[] = [];
    try {
      const distinct = async (col: string, limit: number) => {
        const r = await clickhouse.query({
          query: `SELECT DISTINCT ${col} AS v FROM ${dbName}.grand_livre
                  WHERE batch_id IN ({viewBatchIds:Array(String)}) AND ${col} != ''
                  ORDER BY v LIMIT ${limit}`,
          query_params: { viewBatchIds },
          format: "JSONEachRow",
        });
        return ((await r.json()) as Array<{ v: string }>).map((x) => x.v);
      };
      [journaux, pieces, factures, rubriques] = await Promise.all([
        distinct("code_journal", 300),
        distinct("numero_piece", 5000),
        distinct("numero_facture", 5000),
        distinct("rubrique", 300),
      ]);
    } catch (e) {
      console.error("[saisie GET] options de filtres indisponibles:", e);
    }
    // ---- Référentiel des COMPTES ----------------------------------------
    // Le plan comptable fait foi : il contient tous les comptes utilisables,
    // y compris ceux jamais mouvementés. Le grand livre n'apporte que les
    // rubriques observées. Chaque source est isolée : si l'une échoue, les
    // autres restent exploitables (auparavant un seul Promise.all faisait
    // tomber comptes ET tiers ensemble).
    const plan = await planComptesMap(clickhouse, dbName);

    const rubParCompte = new Map<
      string,
      { intitule: string; rubrique: string; bilan: string }
    >();
    if (realBatchIds.length > 0) {
      try {
        const cRes = await clickhouse.query({
          query: `
            SELECT compte,
                   anyIf(intitule_compte, intitule_compte != '') AS intitule,
                   anyIf(rubrique, rubrique != '')               AS rubrique,
                   anyIf(${glRefExpr}, ${glRefExpr} != '')       AS bilan
            FROM ${dbName}.grand_livre
            WHERE batch_id IN ({batchIds:Array(String)}) AND compte != ''
            GROUP BY compte
          `,
          query_params: { batchIds: realBatchIds },
          format: "JSONEachRow",
        });
        for (const r of (await cRes.json()) as Array<{
          compte: string;
          intitule: string;
          rubrique: string;
          bilan: string;
        }>) {
          rubParCompte.set(r.compte, {
            intitule: r.intitule,
            rubrique: r.rubrique,
            bilan: r.bilan,
          });
        }
      } catch (e) {
        console.error("[saisie GET] rubriques du grand livre indisponibles:", e);
      }
    }

    comptes = [...new Set([...plan.keys(), ...rubParCompte.keys()])]
      .sort()
      .map((c) => {
        const gl = rubParCompte.get(c);
        return {
          compte: c,
          intitule: intituleCompte(plan, c, gl?.intitule ?? ""),
          rubrique: gl?.rubrique ?? "",
          bilan: gl?.bilan ?? "",
        };
      });

    // ---- Référentiel des TIERS ------------------------------------------
    const tiersParNum = new Map<string, { intitule: string; comptes: Set<string> }>();
    if (realBatchIds.length > 0) {
      try {
        const tRes = await clickhouse.query({
          query: `
            SELECT n_tiers AS nTiers,
                   anyIf(intitule_tiers, intitule_tiers != '') AS intitule,
                   groupUniqArray(compte) AS comptes
            FROM ${dbName}.grand_livre
            WHERE batch_id IN ({batchIds:Array(String)}) AND n_tiers != ''
            GROUP BY n_tiers
          `,
          query_params: { batchIds: realBatchIds },
          format: "JSONEachRow",
        });
        for (const r of (await tRes.json()) as Array<{
          nTiers: string;
          intitule: string;
          comptes: string[];
        }>) {
          tiersParNum.set(r.nTiers, {
            intitule: r.intitule,
            comptes: new Set(r.comptes ?? []),
          });
        }
      } catch (e) {
        console.error("[saisie GET] tiers du grand livre indisponibles:", e);
      }
    }

    // Le plan des tiers complète la liste (tiers jamais mouvementés) et fait
    // foi sur l'intitulé.
    for (const t of await planTiersList(clickhouse, dbName)) {
      const existant = tiersParNum.get(t.nTiers);
      if (existant) {
        if (t.intitule) existant.intitule = t.intitule;
      } else {
        tiersParNum.set(t.nTiers, { intitule: t.intitule, comptes: new Set() });
      }
    }

    tiers = [...tiersParNum.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nTiers, v]) => ({
        nTiers,
        intitule: v.intitule,
        comptes: [...v.comptes],
      }));

    // Lignes saisies de la période (éditables).
    const manual = await prisma.manualLedgerEntry.findMany({
      where: { clientId: id, year: annee },
      orderBy: [{ dateTransaction: "asc" }, { numeroPiece: "asc" }, { createdAt: "asc" }],
    });
    const debit = manual.reduce((s, m) => s + m.debit, 0);
    const credit = manual.reduce((s, m) => s + m.credit, 0);

    return NextResponse.json({
      client: { id: check.client!.id, name: check.client!.name },
      periods: periods.map((p) => ({
        id: p.id,
        year: p.year,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
      })),
      annees,
      annee,
      // Périodes de l'exercice : servent à rattacher une écriture saisie à la
      // bonne période comptable au moment de l'enregistrement.
      periodesAnnee: periodesAnnee.map((p) => ({
        id: p.id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
      })),
      bornes: { debut: debutAnnee, fin: finAnnee },
      uploaded: {
        rows: uploadedRows,
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        totalDebit,
        totalCredit,
      },
      manual,
      refs: { comptes, tiers, journaux, pieces, factures, rubriques },
      balance: { debit, credit, delta: debit - credit },
    });
  } catch (error) {
    console.error("Saisie GET error:", error);
    return NextResponse.json({ error: "Erreur lors du chargement de la saisie" }, { status: 500 });
  }
}

// Une écriture : en-tête partagé (date, code journal, libellé, n° pièce, n°
// facture) + lignes. Débit/Crédit sont des valeurs numériques (positives ou
// négatives). Le n° facture est unique au niveau de l'écriture (pas par ligne).
const ligneSchema = z.object({
  compte: z.string().trim().min(1),
  nTiers: z.string().trim().optional().default(""),
  typeTiers: z.string().trim().max(40).optional().default(""),
  debit: z.number().default(0),
  credit: z.number().default(0),
});
const ecritureSchema = z.object({
  year: z.number().int().min(1900).max(2999),
  dateTransaction: z.string().min(1),
  codeJournal: z.string().trim().min(1),
  libelle: z.string().trim().max(300).optional().default(""),
  numeroPiece: z.string().trim().max(60).optional().default(""),
  numeroFacture: z.string().trim().max(60).optional().default(""),
  lignes: z.array(ligneSchema).min(1),
});
// Mise à jour : le n° pièce identifie l'écriture existante (obligatoire).
const ecritureUpdateSchema = ecritureSchema.extend({
  numeroPiece: z.string().trim().min(1),
});

type PeriodLite = { id: string; year: number; periodStart: Date; periodEnd: Date };
type LigneInput = z.infer<typeof ligneSchema>;
type PreparedRow = {
  clientId: string;
  comptablePeriodId: string;
  year: number;
  dateTransaction: Date;
  codeJournal: string;
  compte: string;
  intituleCompte: string;
  nTiers: string;
  intituleTiers: string;
  typeTiers: string;
  rubrique: string;
  bilanRubrique: string;
  numeroPiece: string;
  numeroFacture: string;
  libelle: string;
  debit: number;
  credit: number;
  createdById: string;
};

// Valide une écriture (journal, date, équilibre BLOQUANT, comptes/tiers
// existants) et construit les lignes à persister, en héritant intitulés /
// rubriques du référentiel (même logique qu'à l'upload). Partagé POST + PUT.
async function prepareEcritureRows(opts: {
  clientId: string;
  period: PeriodLite;
  codeJournal: string;
  libelle: string;
  numeroPiece: string;
  numeroFacture: string;
  dateStr: string;
  lignes: LigneInput[];
  createdById: string;
}): Promise<{ rows: PreparedRow[] } | { error: NextResponse }> {
  const { clientId, period, codeJournal, libelle, numeroPiece, numeroFacture, dateStr, lignes, createdById } = opts;

  if (!CODE_JOURNAUX_SET.has(codeJournal))
    return { error: NextResponse.json({ error: `Code journal inconnu : ${codeJournal}.` }, { status: 400 }) };

  const dateEcriture = new Date(dateStr);
  if (isNaN(dateEcriture.getTime()))
    return { error: NextResponse.json({ error: "Date invalide." }, { status: 400 }) };
  if (dateEcriture < new Date(period.periodStart) || dateEcriture > new Date(period.periodEnd))
    return { error: NextResponse.json({ error: "La date doit être dans l'exercice sélectionné." }, { status: 400 }) };

  // Équilibre (bloquant).
  const sumD = lignes.reduce((s, l) => s + l.debit, 0);
  const sumC = lignes.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(sumD - sumC) > BALANCE_TOLERANCE)
    return {
      error: NextResponse.json(
        { error: `Écriture déséquilibrée : débit ${sumD.toFixed(2)} ≠ crédit ${sumC.toFixed(2)}.` },
        { status: 400 },
      ),
    };

  // Chaque ligne doit porter au moins une valeur (débit ou crédit ≠ 0). Les
  // montants peuvent être positifs ou négatifs.
  for (const l of lignes) {
    if (l.debit === 0 && l.credit === 0)
      return { error: NextResponse.json({ error: "Chaque ligne doit avoir un débit ou un crédit (valeur non nulle)." }, { status: 400 }) };
  }

  // Comptes existants ; tiers uniquement pour comptes centralisateurs (401/411).
  const dbName = getClickhouseDbName(clientId);
  const refExpr = await bilanRefExpr(clickhouse, dbName);
  const allPeriods = await prisma.comptablePeriod.findMany({ where: { clientId }, select: { batchId: true } });
  const realBatchIds = allPeriods.map((p) => p.batchId).filter(Boolean);
  const compteMap = await lookupComptes(dbName, realBatchIds, [...new Set(lignes.map((l) => l.compte))], refExpr);
  const wantedTiers = [
    ...new Set(lignes.filter((l) => isCentralizingAccount(l.compte) && l.nTiers).map((l) => l.nTiers)),
  ];
  const tiersMap = await lookupTiers(dbName, realBatchIds, wantedTiers);

  for (const l of lignes) {
    if (!compteMap.has(l.compte))
      return { error: NextResponse.json({ error: `Compte inexistant : ${l.compte}. Utilisez un compte du plan existant.` }, { status: 400 }) };
    if (isCentralizingAccount(l.compte) && l.nTiers && !tiersMap.has(l.nTiers))
      return { error: NextResponse.json({ error: `Tiers inexistant : ${l.nTiers}.` }, { status: 400 }) };
  }

  const rows: PreparedRow[] = lignes.map((l) => {
    const c = compteMap.get(l.compte)!;
    const central = isCentralizingAccount(l.compte);
    return {
      clientId,
      comptablePeriodId: period.id,
      year: period.year,
      dateTransaction: dateEcriture,
      codeJournal,
      compte: l.compte,
      intituleCompte: c.intitule,
      // Champs tiers vidés si le compte n'est pas centralisateur (spec).
      // Type tiers dérivé du compte (401→Fournisseur, 411→Client…), comme à l'upload.
      nTiers: central ? l.nTiers || "" : "",
      intituleTiers: central && l.nTiers ? tiersMap.get(l.nTiers) || "" : "",
      typeTiers: central ? suggestTypeTiers(l.compte) || l.typeTiers || "" : "",
      rubrique: c.rubrique,
      bilanRubrique: c.bilan,
      numeroPiece,
      numeroFacture: numeroFacture || "",
      libelle: libelle || "",
      debit: l.debit,
      credit: l.credit,
      createdById,
    };
  });
  return { rows };
}

/**
 * Résout un EXERCICE en contexte de saisie. L'utilisateur choisit une année,
 * pas un lot de fichiers : on rattache la ligne saisie à la période d'import
 * qui contient sa date (à défaut la dernière de l'exercice), tout en bornant
 * la validation à l'exercice entier.
 */
async function resolveExercice(
  clientId: string,
  year: number,
  dateStr: string,
): Promise<PeriodLite | null> {
  const periods = await prisma.comptablePeriod.findMany({
    where: { clientId, year },
    orderBy: { periodStart: "asc" },
    select: { id: true, periodStart: true, periodEnd: true },
  });
  if (periods.length === 0) return null;
  const d = new Date(dateStr);
  const dans = !isNaN(d.getTime())
    ? periods.find((p) => d >= new Date(p.periodStart) && d <= new Date(p.periodEnd))
    : undefined;
  const rattachement = dans ?? periods[periods.length - 1];
  const debut = periods.reduce((min, p) => (p.periodStart < min ? p.periodStart : min), periods[0].periodStart);
  const fin = periods.reduce((max, p) => (p.periodEnd > max ? p.periodEnd : max), periods[0].periodEnd);
  return { id: rattachement.id, year, periodStart: debut, periodEnd: fin };
}

// ============================================================================
// POST — crée une écriture (ensemble de lignes) équilibrée.
// ============================================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const perm = await requirePermission(SAISIE_ACTIONS.GERER);
    if (perm instanceof NextResponse) return perm;

    const { id } = await params;
    const check = await requireClient(id, perm.user.companyId);
    if (check.error) return check.error;

    const body = await req.json().catch(() => null);
    const parsed = ecritureSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Données invalides" }, { status: 400 });
    const { year, codeJournal, libelle, lignes } = parsed.data;

    const period = await resolveExercice(id, year, parsed.data.dateTransaction);
    if (!period) return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });

    const numeroPiece = parsed.data.numeroPiece || `SAI-${period.year}-${Date.now().toString().slice(-6)}`;

    const prepared = await prepareEcritureRows({
      clientId: id,
      period,
      codeJournal,
      libelle,
      numeroPiece,
      numeroFacture: parsed.data.numeroFacture,
      dateStr: parsed.data.dateTransaction,
      lignes,
      createdById: perm.user.id,
    });
    if ("error" in prepared) return prepared.error;

    await prisma.manualLedgerEntry.createMany({ data: prepared.rows });
    await syncManualBatch(id, period.year);
    return NextResponse.json({ ok: true, numeroPiece }, { status: 201 });
  } catch (error) {
    console.error("Saisie POST error:", error);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }
}

// ============================================================================
// PUT — met à jour une écriture ENTIÈRE (remplace toutes ses lignes du même
// numeroPiece). Permet d'ajouter / retirer / modifier des lignes. L'équilibre
// est BLOQUANT (rejet si Σ débit ≠ Σ crédit).
// ============================================================================
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const perm = await requirePermission(SAISIE_ACTIONS.GERER);
    if (perm instanceof NextResponse) return perm;

    const { id } = await params;
    const check = await requireClient(id, perm.user.companyId);
    if (check.error) return check.error;

    const body = await req.json().catch(() => null);
    const parsed = ecritureUpdateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Données invalides" }, { status: 400 });
    const { year, codeJournal, libelle, lignes, numeroPiece } = parsed.data;

    const period = await resolveExercice(id, year, parsed.data.dateTransaction);
    if (!period) return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });

    // L'écriture doit exister (lignes manuelles partageant ce n° pièce) ;
    // elle est recherchée sur tout l'exercice, ses lignes pouvant être
    // rattachées à des périodes d'import différentes.
    const existing = await prisma.manualLedgerEntry.findFirst({
      where: { clientId: id, year, numeroPiece },
      select: { id: true, createdById: true },
    });
    if (!existing) return NextResponse.json({ error: "Écriture introuvable" }, { status: 404 });

    const prepared = await prepareEcritureRows({
      clientId: id,
      period,
      codeJournal,
      libelle,
      numeroPiece,
      numeroFacture: parsed.data.numeroFacture,
      dateStr: parsed.data.dateTransaction,
      lignes,
      createdById: existing.createdById,
    });
    if ("error" in prepared) return prepared.error;

    // Remplace atomiquement toutes les lignes de l'écriture.
    await prisma.$transaction([
      prisma.manualLedgerEntry.deleteMany({
        where: { clientId: id, year, numeroPiece },
      }),
      prisma.manualLedgerEntry.createMany({ data: prepared.rows }),
    ]);
    await syncManualBatch(id, period.year);
    return NextResponse.json({ ok: true, numeroPiece });
  } catch (error) {
    console.error("Saisie PUT error:", error);
    return NextResponse.json({ error: "Erreur lors de la modification" }, { status: 500 });
  }
}

// ============================================================================
// DELETE — supprime des écritures saisies de la période. Trois modes :
//   ?year=&scope=all                 → toutes les écritures de l'exercice
//   ?year=&numeroPiece=A&numeroPiece=B → les écritures sélectionnées (1..n)
// Ne touche jamais les lignes uploadées. Pour retirer une seule ligne, passer
// par la modification de l'écriture (PUT).
// ============================================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const perm = await requirePermission(SAISIE_ACTIONS.GERER);
    if (perm instanceof NextResponse) return perm;

    const { id } = await params;
    const check = await requireClient(id, perm.user.companyId);
    if (check.error) return check.error;

    const { searchParams } = new URL(req.url);
    const numeroPieces = searchParams.getAll("numeroPiece").filter((p) => p.trim() !== "");
    const scope = searchParams.get("scope");
    const annee = parseInt(searchParams.get("year") || "", 10);
    if (!Number.isFinite(annee))
      return NextResponse.json({ error: "Exercice requis" }, { status: 400 });

    let deleted: number;
    if (scope === "all") {
      const del = await prisma.manualLedgerEntry.deleteMany({
        where: { clientId: id, year: annee },
      });
      deleted = del.count;
    } else {
      if (numeroPieces.length === 0)
        return NextResponse.json({ error: "Aucune écriture sélectionnée" }, { status: 400 });
      const del = await prisma.manualLedgerEntry.deleteMany({
        where: { clientId: id, year: annee, numeroPiece: { in: numeroPieces } },
      });
      if (del.count === 0) return NextResponse.json({ error: "Écriture(s) introuvable(s)" }, { status: 404 });
      deleted = del.count;
    }

    await syncManualBatch(id, annee);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    console.error("Saisie DELETE error:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
