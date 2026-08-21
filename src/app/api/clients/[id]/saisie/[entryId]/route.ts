import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { SAISIE_ACTIONS } from "@/lib/permissions/actions";
import { getClickhouseDbName, syncManualBatch } from "@/lib/clickhouse/manual-sync";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

const BALANCE_TOLERANCE = 0.01;

// Charge l'écriture (lignes manuelles partageant le même numeroPiece dans la
// même période) et renvoie true si elle reste équilibrée.
async function ecritureIsBalanced(
  clientId: string,
  comptablePeriodId: string,
  numeroPiece: string,
): Promise<boolean> {
  const lignes = await prisma.manualLedgerEntry.findMany({
    where: { clientId, comptablePeriodId, numeroPiece },
    select: { debit: true, credit: true },
  });
  const d = lignes.reduce((s, l) => s + l.debit, 0);
  const c = lignes.reduce((s, l) => s + l.credit, 0);
  return Math.abs(d - c) <= BALANCE_TOLERANCE;
}

const patchSchema = z.object({
  dateTransaction: z.string().min(1).optional(),
  compte: z.string().trim().min(1).optional(),
  nTiers: z.string().trim().optional(),
  libelle: z.string().trim().max(300).optional(),
  debit: z.number().nonnegative().optional(),
  credit: z.number().nonnegative().optional(),
});

// ============================================================================
// PATCH — modifie une ligne saisie (jamais une ligne uploadée : elles n'ont
// pas d'entrée Postgres). L'écriture doit rester équilibrée.
// ============================================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const perm = await requirePermission(SAISIE_ACTIONS.GERER);
    if (perm instanceof NextResponse) return perm;

    const { id, entryId } = await params;
    // Scoping société via la relation client.
    const entry = await prisma.manualLedgerEntry.findFirst({
      where: { id: entryId, clientId: id, client: { companyId: perm.user.companyId } },
      include: { comptablePeriod: { select: { periodStart: true, periodEnd: true } } },
    });
    if (!entry) return NextResponse.json({ error: "Ligne introuvable" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Données invalides" }, { status: 400 });
    const p = parsed.data;

    const debit = p.debit ?? entry.debit;
    const credit = p.credit ?? entry.credit;
    if (debit === 0 && credit === 0)
      return NextResponse.json({ error: "La ligne doit avoir un débit ou un crédit." }, { status: 400 });
    if (debit > 0 && credit > 0)
      return NextResponse.json({ error: "Une ligne ne peut avoir à la fois un débit et un crédit." }, { status: 400 });

    const dateTransaction = p.dateTransaction ? new Date(p.dateTransaction) : entry.dateTransaction;
    if (isNaN(dateTransaction.getTime()))
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    if (dateTransaction < new Date(entry.comptablePeriod.periodStart) || dateTransaction > new Date(entry.comptablePeriod.periodEnd))
      return NextResponse.json({ error: "La date doit être dans la période." }, { status: 400 });

    const compte = p.compte ?? entry.compte;
    const nTiers = p.nTiers ?? entry.nTiers;
    let intituleCompte = entry.intituleCompte;
    let rubrique = entry.rubrique;
    let bilanRubrique = entry.bilanRubrique;
    let intituleTiers = entry.intituleTiers;

    // Si compte/tiers changent, revérifier l'existence + réhériter les rubriques.
    const dbName = getClickhouseDbName(id);
    const realBatchIds = (
      await prisma.comptablePeriod.findMany({ where: { clientId: id }, select: { batchId: true } })
    )
      .map((x) => x.batchId)
      .filter(Boolean);

    if (p.compte && p.compte !== entry.compte) {
      const rows = (await (
        await clickhouse.query({
          query: `SELECT any(intitule_compte) i, any(rubrique) r, any(bilan_rubrique) b, count() c
                  FROM ${dbName}.grand_livre
                  WHERE batch_id IN ({batchIds:Array(String)}) AND compte = {compte:String}`,
          query_params: { batchIds: realBatchIds, compte },
          format: "JSONEachRow",
        })
      ).json()) as Array<{ i: string; r: string; b: string; c: string }>;
      if (!rows[0] || parseInt(rows[0].c, 10) === 0)
        return NextResponse.json({ error: `Compte inexistant : ${compte}.` }, { status: 400 });
      intituleCompte = rows[0].i;
      rubrique = rows[0].r;
      bilanRubrique = rows[0].b;
    }
    if (p.nTiers !== undefined && nTiers && nTiers !== entry.nTiers) {
      const rows = (await (
        await clickhouse.query({
          query: `SELECT any(intitule_tiers) i, count() c FROM ${dbName}.grand_livre
                  WHERE batch_id IN ({batchIds:Array(String)}) AND n_tiers = {t:String}`,
          query_params: { batchIds: realBatchIds, t: nTiers },
          format: "JSONEachRow",
        })
      ).json()) as Array<{ i: string; c: string }>;
      if (!rows[0] || parseInt(rows[0].c, 10) === 0)
        return NextResponse.json({ error: `Tiers inexistant : ${nTiers}.` }, { status: 400 });
      intituleTiers = rows[0].i;
    } else if (p.nTiers !== undefined && !nTiers) {
      intituleTiers = "";
    }

    await prisma.manualLedgerEntry.update({
      where: { id: entryId },
      data: {
        dateTransaction,
        compte,
        intituleCompte,
        nTiers: nTiers || "",
        intituleTiers,
        rubrique,
        bilanRubrique,
        libelle: p.libelle ?? entry.libelle,
        debit,
        credit,
      },
    });

    // L'écriture doit rester équilibrée après modification.
    if (!(await ecritureIsBalanced(id, entry.comptablePeriodId, entry.numeroPiece))) {
      // On resynchronise quand même (état persistant) mais on avertit.
      await syncManualBatch(id, entry.year);
      return NextResponse.json(
        { ok: true, warning: "Écriture déséquilibrée : ajustez les lignes pour rétablir Σ débit = Σ crédit." },
        { status: 200 },
      );
    }

    await syncManualBatch(id, entry.year);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Saisie PATCH error:", error);
    return NextResponse.json({ error: "Erreur lors de la modification" }, { status: 500 });
  }
}

// ============================================================================
// DELETE — supprime l'ÉCRITURE complète (toutes les lignes du même numeroPiece
// dans la période) pour préserver l'équilibre. Ne touche jamais les lignes
// uploadées (aucune API d'écriture sur ClickHouse).
// ============================================================================
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const perm = await requirePermission(SAISIE_ACTIONS.GERER);
    if (perm instanceof NextResponse) return perm;

    const { id, entryId } = await params;
    const entry = await prisma.manualLedgerEntry.findFirst({
      where: { id: entryId, clientId: id, client: { companyId: perm.user.companyId } },
      select: { id: true, year: true, comptablePeriodId: true, numeroPiece: true },
    });
    if (!entry) return NextResponse.json({ error: "Ligne introuvable" }, { status: 404 });

    const del = await prisma.manualLedgerEntry.deleteMany({
      where: { clientId: id, comptablePeriodId: entry.comptablePeriodId, numeroPiece: entry.numeroPiece },
    });

    await syncManualBatch(id, entry.year);
    return NextResponse.json({ ok: true, deleted: del.count });
  } catch (error) {
    console.error("Saisie DELETE error:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
