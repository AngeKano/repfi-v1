import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getClickhouseDbName, manualBatchId } from "@/lib/clickhouse/manual-sync";

const clickhouse = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

// Colonnes strictement identiques au fichier d'import illustratif + Flags.
const HEADERS = [
  "Date GL",
  "Entité",
  "Compte",
  "Intitulé Compte",
  "Rubrique",
  "Rubrique Bilan",
  "Date Transaction",
  "Code Journal",
  "N° Pièce",
  "N° Facture",
  "Libellé",
  "N° Tiers",
  "Intitulé Tiers",
  "Type Tiers",
  "Débit",
  "Crédit",
  "Solde",
  "Période",
  "Batch ID",
  "Row ID",
  "Compte PCG Origine",
  "HAO",
  "Mapping Status",
  "Flags",
];

function fmtDateFR(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
function periodeFromDate(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true },
    });
    if (!client) return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    if (client.companyId !== session.user.companyId)
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get("periodId");
    const period = periodId
      ? await prisma.comptablePeriod.findFirst({
          where: { id: periodId, clientId: id },
          select: { id: true, year: true, batchId: true, periodStart: true, periodEnd: true },
        })
      : await prisma.comptablePeriod.findFirst({
          where: { clientId: id },
          orderBy: [{ year: "desc" }, { periodStart: "desc" }],
          select: { id: true, year: true, batchId: true, periodStart: true, periodEnd: true },
        });
    if (!period) return NextResponse.json({ error: "Aucune période" }, { status: 404 });

    const dbName = getClickhouseDbName(id);
    const rows: (string | number)[][] = [];

    // 1) Lignes uploadées (ClickHouse) — Flags = "Non". SELECT * pour rester
    // robuste aux colonnes ; on lit chaque champ par son nom snake_case.
    try {
      const res = await clickhouse.query({
        query: `
          SELECT *
          FROM ${dbName}.grand_livre
          WHERE batch_id = {batchId:String}
          ORDER BY substring(date_transaction, 7, 4),
                   substring(date_transaction, 4, 2),
                   substring(date_transaction, 1, 2)
        `,
        query_params: { batchId: period.batchId },
        format: "JSONEachRow",
      });
      const uploaded = (await res.json()) as Array<Record<string, unknown>>;
      for (const r of uploaded) {
        const g = (k: string): string => (r[k] === undefined || r[k] === null ? "" : String(r[k]));
        const debit = Number(r.debit ?? 0) || 0;
        const credit = Number(r.credit ?? 0) || 0;
        const solde = r.solde !== undefined && r.solde !== null ? Number(r.solde) || 0 : debit - credit;
        rows.push([
          g("date_gl"),
          g("entite") || client.name,
          g("compte"),
          g("intitule_compte"),
          g("rubrique"),
          g("bilan_rubrique"),
          g("date_transaction"),
          g("code_journal"),
          g("numero_piece"),
          g("numero_facture"),
          g("libelle"),
          g("n_tiers"),
          g("intitule_tiers"),
          g("type_tiers"),
          debit,
          credit,
          solde,
          g("periode"),
          g("batch_id"),
          g("row_id"),
          g("compte_pcg_origine"),
          r.hao === undefined || r.hao === null ? 0 : Number(r.hao) || 0,
          g("mapping_status"),
          "Non",
        ]);
      }
    } catch (e) {
      console.error("[saisie export] ClickHouse indisponible:", e);
    }

    // 2) Lignes saisies (Postgres) — Flags = "Oui".
    const manual = await prisma.manualLedgerEntry.findMany({
      where: { clientId: id, comptablePeriodId: period.id },
      orderBy: [{ dateTransaction: "asc" }, { numeroPiece: "asc" }, { createdAt: "asc" }],
    });
    for (const m of manual) {
      rows.push([
        fmtDateFR(m.createdAt),
        client.name,
        m.compte,
        m.intituleCompte,
        m.rubrique,
        m.bilanRubrique,
        fmtDateFR(m.dateTransaction),
        m.codeJournal,
        m.numeroPiece,
        m.numeroFacture,
        m.libelle,
        m.nTiers,
        m.intituleTiers,
        m.typeTiers,
        m.debit,
        m.credit,
        m.debit - m.credit,
        periodeFromDate(m.dateTransaction),
        manualBatchId(id, m.year),
        "",
        "",
        0,
        "SAISIE",
        "Oui",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grand Livre");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const safeName = client.name.replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = `GRAND_LIVRE_${safeName}_${period.year}_saisies.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Saisie export error:", error);
    return NextResponse.json({ error: "Erreur lors de l'export" }, { status: 500 });
  }
}
