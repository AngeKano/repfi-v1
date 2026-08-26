import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { SAISIE_ACTIONS } from "@/lib/permissions/actions";
import { getClickhouseDbName, syncManualBatch } from "@/lib/clickhouse/manual-sync";
import {
  CODE_JOURNAUX_SET,
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
): Promise<Map<string, { intitule: string; rubrique: string; bilan: string }>> {
  const map = new Map<string, { intitule: string; rubrique: string; bilan: string }>();
  if (batchIds.length === 0 || comptes.length === 0) return map;
  const rows = await clickhouse
    .query({
      query: `
        SELECT compte,
               anyIf(intitule_compte, intitule_compte != '') AS intitule,
               anyIf(rubrique, rubrique != '')               AS rubrique,
               anyIf(bilan_rubrique, bilan_rubrique != '')   AS bilan
        FROM ${dbName}.grand_livre
        WHERE batch_id IN ({batchIds:Array(String)})
          AND compte IN ({comptes:Array(String)})
        GROUP BY compte
      `,
      query_params: { batchIds, comptes },
      format: "JSONEachRow",
    })
    .then((r) => r.json() as Promise<Array<{ compte: string; intitule: string; rubrique: string; bilan: string }>>);
  for (const r of rows) map.set(r.compte, { intitule: r.intitule, rubrique: r.rubrique, bilan: r.bilan });
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
// ?periodId=<id>&page=<n>
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
        period: null,
        uploaded: { rows: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
        manual: [],
        refs: { comptes: [], tiers: [] },
        balance: { debit: 0, credit: 0, delta: 0 },
      });
    }

    const periodId = searchParams.get("periodId") || periods[0].id;
    const period = periods.find((p) => p.id === periodId) || periods[0];
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
             OR positionCaseInsensitive(date_transaction, {s:String}) > 0)`
      : "";
    const qParams: Record<string, unknown> = { batchId: period.batchId };
    if (search) qParams.s = search;

    // Lignes uploadées de la période sélectionnée (lecture seule), paginées.
    const offset = (page - 1) * PAGE_SIZE;
    let uploadedRows: unknown[] = [];
    let total = 0;
    try {
      const [dataRes, countRes] = await Promise.all([
        clickhouse.query({
          query: `
            SELECT date_transaction, compte, intitule_compte, n_tiers, intitule_tiers,
                   numero_piece, rubrique, bilan_rubrique, debit, credit
            FROM ${dbName}.grand_livre
            WHERE batch_id = {batchId:String} ${searchFilter}
            ORDER BY ${orderBy}
            LIMIT ${PAGE_SIZE} OFFSET ${offset}
          `,
          query_params: qParams,
          format: "JSONEachRow",
        }),
        clickhouse.query({
          query: `SELECT count() AS c FROM ${dbName}.grand_livre WHERE batch_id = {batchId:String} ${searchFilter}`,
          query_params: qParams,
          format: "JSONEachRow",
        }),
      ]);
      uploadedRows = (await dataRes.json()) as unknown[];
      const cRows = (await countRes.json()) as Array<{ c: string }>;
      total = parseInt(cRows[0]?.c || "0", 10);
    } catch (e) {
      console.error("[saisie GET] ClickHouse indisponible:", e);
    }

    // Listes de référence (comptes / tiers existants) sur tout le grand livre.
    // Pour les tiers, on récupère aussi les comptes auxquels ils sont rattachés
    // (groupUniqArray) afin de ne proposer, à la saisie, que les tiers pertinents
    // pour le compte choisi.
    let comptes: Array<{ compte: string; intitule: string; rubrique: string; bilan: string }> = [];
    let tiers: Array<{ nTiers: string; intitule: string; comptes: string[] }> = [];
    if (realBatchIds.length > 0) {
      try {
        const [cRes, tRes] = await Promise.all([
          clickhouse.query({
            query: `
              SELECT compte,
                     anyIf(intitule_compte, intitule_compte != '') AS intitule,
                     anyIf(rubrique, rubrique != '')               AS rubrique,
                     anyIf(bilan_rubrique, bilan_rubrique != '')   AS bilan
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)}) AND compte != ''
              GROUP BY compte ORDER BY compte
            `,
            query_params: { batchIds: realBatchIds },
            format: "JSONEachRow",
          }),
          clickhouse.query({
            query: `
              SELECT n_tiers AS nTiers,
                     anyIf(intitule_tiers, intitule_tiers != '') AS intitule,
                     groupUniqArray(compte) AS comptes
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)}) AND n_tiers != ''
              GROUP BY n_tiers ORDER BY n_tiers
            `,
            query_params: { batchIds: realBatchIds },
            format: "JSONEachRow",
          }),
        ]);
        comptes = (await cRes.json()) as typeof comptes;
        tiers = (await tRes.json()) as typeof tiers;
      } catch (e) {
        console.error("[saisie GET] refs indisponibles:", e);
      }
    }

    // Lignes saisies de la période (éditables).
    const manual = await prisma.manualLedgerEntry.findMany({
      where: { clientId: id, comptablePeriodId: period.id },
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
      period: { id: period.id, year: period.year, periodStart: period.periodStart, periodEnd: period.periodEnd },
      uploaded: {
        rows: uploadedRows,
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
      manual,
      refs: { comptes, tiers },
      balance: { debit, credit, delta: debit - credit },
    });
  } catch (error) {
    console.error("Saisie GET error:", error);
    return NextResponse.json({ error: "Erreur lors du chargement de la saisie" }, { status: 500 });
  }
}

// Une écriture : en-tête partagé (date, code journal, libellé, n° pièce) + lignes.
const ligneSchema = z.object({
  compte: z.string().trim().min(1),
  nTiers: z.string().trim().optional().default(""),
  typeTiers: z.string().trim().max(40).optional().default(""),
  numeroFacture: z.string().trim().max(60).optional().default(""),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
});
const ecritureSchema = z.object({
  periodId: z.string().min(1),
  dateTransaction: z.string().min(1),
  codeJournal: z.string().trim().min(1),
  libelle: z.string().trim().max(300).optional().default(""),
  numeroPiece: z.string().trim().max(60).optional().default(""),
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
  dateStr: string;
  lignes: LigneInput[];
  createdById: string;
}): Promise<{ rows: PreparedRow[] } | { error: NextResponse }> {
  const { clientId, period, codeJournal, libelle, numeroPiece, dateStr, lignes, createdById } = opts;

  if (!CODE_JOURNAUX_SET.has(codeJournal))
    return { error: NextResponse.json({ error: `Code journal inconnu : ${codeJournal}.` }, { status: 400 }) };

  const dateEcriture = new Date(dateStr);
  if (isNaN(dateEcriture.getTime()))
    return { error: NextResponse.json({ error: "Date invalide." }, { status: 400 }) };
  if (dateEcriture < new Date(period.periodStart) || dateEcriture > new Date(period.periodEnd))
    return { error: NextResponse.json({ error: "La date doit être dans la période sélectionnée." }, { status: 400 }) };

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

  for (const l of lignes) {
    if (l.debit === 0 && l.credit === 0)
      return { error: NextResponse.json({ error: "Chaque ligne doit avoir un débit ou un crédit." }, { status: 400 }) };
    if (l.debit > 0 && l.credit > 0)
      return { error: NextResponse.json({ error: "Une ligne ne peut avoir à la fois un débit et un crédit." }, { status: 400 }) };
  }

  // Comptes existants ; tiers uniquement pour comptes centralisateurs (401/411).
  const dbName = getClickhouseDbName(clientId);
  const allPeriods = await prisma.comptablePeriod.findMany({ where: { clientId }, select: { batchId: true } });
  const realBatchIds = allPeriods.map((p) => p.batchId).filter(Boolean);
  const compteMap = await lookupComptes(dbName, realBatchIds, [...new Set(lignes.map((l) => l.compte))]);
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
      numeroFacture: l.numeroFacture || "",
      libelle: libelle || "",
      debit: l.debit,
      credit: l.credit,
      createdById,
    };
  });
  return { rows };
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
    const { periodId, codeJournal, libelle, lignes } = parsed.data;

    const period = await prisma.comptablePeriod.findFirst({
      where: { id: periodId, clientId: id },
      select: { id: true, year: true, periodStart: true, periodEnd: true },
    });
    if (!period) return NextResponse.json({ error: "Période introuvable" }, { status: 404 });

    const numeroPiece = parsed.data.numeroPiece || `SAI-${period.year}-${Date.now().toString().slice(-6)}`;

    const prepared = await prepareEcritureRows({
      clientId: id,
      period,
      codeJournal,
      libelle,
      numeroPiece,
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
    const { periodId, codeJournal, libelle, lignes, numeroPiece } = parsed.data;

    const period = await prisma.comptablePeriod.findFirst({
      where: { id: periodId, clientId: id },
      select: { id: true, year: true, periodStart: true, periodEnd: true },
    });
    if (!period) return NextResponse.json({ error: "Période introuvable" }, { status: 404 });

    // L'écriture doit exister (lignes manuelles partageant ce n° pièce).
    const existing = await prisma.manualLedgerEntry.findFirst({
      where: { clientId: id, comptablePeriodId: period.id, numeroPiece },
      select: { id: true, createdById: true },
    });
    if (!existing) return NextResponse.json({ error: "Écriture introuvable" }, { status: 404 });

    const prepared = await prepareEcritureRows({
      clientId: id,
      period,
      codeJournal,
      libelle,
      numeroPiece,
      dateStr: parsed.data.dateTransaction,
      lignes,
      createdById: existing.createdById,
    });
    if ("error" in prepared) return prepared.error;

    // Remplace atomiquement toutes les lignes de l'écriture.
    await prisma.$transaction([
      prisma.manualLedgerEntry.deleteMany({
        where: { clientId: id, comptablePeriodId: period.id, numeroPiece },
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
