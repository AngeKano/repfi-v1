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

    // Diagnostic : ?debug=columns renvoie les noms de colonnes réels d'une ligne
    // du grand livre (pour vérifier le nom exact de libelle / numero_facture…).
    if (searchParams.get("debug") === "columns") {
      try {
        const dbg = await clickhouse.query({
          query: `SELECT * FROM ${dbName}.grand_livre WHERE batch_id = {batchId:String} LIMIT 1`,
          query_params: { batchId: period.batchId },
          format: "JSONEachRow",
        });
        const first = ((await dbg.json()) as Array<Record<string, unknown>>)[0] || {};
        return NextResponse.json({ columns: Object.keys(first), sample: first });
      } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
      }
    }

    const rows: (string | number)[][] = [];

    // Tables de référence bâties sur TOUS les batchs du client : l'intitulé du
    // compte / du tiers peut être absent d'un batch mais présent dans un autre
    // (même logique que l'onglet Saisie, anyIf sur valeur non vide).
    const allPeriods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true },
    });
    const realBatchIds = allPeriods.map((p) => p.batchId).filter((b): b is string => !!b);
    const compteMap = new Map<string, { intitule: string; rubrique: string; bilan: string }>();
    const tiersMap = new Map<string, { intitule: string; type: string }>();
    if (realBatchIds.length > 0) {
      try {
        const [cRes, tRes] = await Promise.all([
          clickhouse.query({
            query: `SELECT compte,
                      anyIf(intitule_compte, intitule_compte != '') i,
                      anyIf(rubrique, rubrique != '') r,
                      anyIf(bilan_rubrique, bilan_rubrique != '') b
                    FROM ${dbName}.grand_livre
                    WHERE batch_id IN ({b:Array(String)}) AND compte != ''
                    GROUP BY compte`,
            query_params: { b: realBatchIds },
            format: "JSONEachRow",
          }),
          clickhouse.query({
            query: `SELECT n_tiers,
                      anyIf(intitule_tiers, intitule_tiers != '') i,
                      anyIf(type_tiers, type_tiers != '') t
                    FROM ${dbName}.grand_livre
                    WHERE batch_id IN ({b:Array(String)}) AND n_tiers != ''
                    GROUP BY n_tiers`,
            query_params: { b: realBatchIds },
            format: "JSONEachRow",
          }),
        ]);
        for (const r of (await cRes.json()) as Array<{ compte: string; i: string; r: string; b: string }>)
          compteMap.set(r.compte, { intitule: r.i, rubrique: r.r, bilan: r.b });
        for (const r of (await tRes.json()) as Array<{ n_tiers: string; i: string; t: string }>)
          tiersMap.set(r.n_tiers, { intitule: r.i, type: r.t });
      } catch (e) {
        console.error("[saisie export] refs indisponibles:", e);
      }
    }

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
        // Index insensible à la casse des colonnes réelles (SELECT *).
        const lk: Record<string, unknown> = {};
        for (const k of Object.keys(r)) lk[k.toLowerCase()] = r[k];
        const pick = (...cands: string[]): string => {
          for (const c of cands) {
            const v = lk[c];
            if (v !== undefined && v !== null && String(v) !== "") return String(v);
          }
          return "";
        };
        const debit = Number(lk.debit ?? 0) || 0;
        const credit = Number(lk.credit ?? 0) || 0;
        const soldeRaw = lk.solde;
        const solde = soldeRaw !== undefined && soldeRaw !== null ? Number(soldeRaw) || 0 : debit - credit;

        const compte = pick("compte");
        const cm = compteMap.get(compte);
        const nTiers = pick("n_tiers", "numero_tiers");
        const tm = tiersMap.get(nTiers);

        rows.push([
          pick("date_gl"),
          pick("entite") || client.name,
          compte,
          // Intitulé/rubriques : valeur de la ligne, sinon référentiel du client.
          pick("intitule_compte", "libelle_compte") || cm?.intitule || "",
          pick("rubrique") || cm?.rubrique || "",
          pick("bilan_rubrique", "rubrique_bilan") || cm?.bilan || "",
          pick("date_transaction"),
          pick("code_journal"),
          pick("numero_piece", "n_piece"),
          pick("numero_facture", "n_facture", "num_facture"),
          pick("libelle", "libelle_ecriture", "libelle_operation"),
          nTiers,
          pick("intitule_tiers") || tm?.intitule || "",
          pick("type_tiers") || tm?.type || "",
          debit,
          credit,
          solde,
          pick("periode"),
          pick("batch_id"),
          pick("row_id"),
          pick("compte_pcg_origine"),
          lk.hao === undefined || lk.hao === null ? 0 : Number(lk.hao) || 0,
          pick("mapping_status") || "none",
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
