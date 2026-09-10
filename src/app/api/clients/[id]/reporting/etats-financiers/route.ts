import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getClickhouseDbName, manualBatchId } from "@/lib/clickhouse/manual-sync";
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

    const dbName = getClickhouseDbName(id);

    // Exercices disponibles (N, N-1, N-2, … n), du plus récent au plus ancien.
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

    const years = [...byYear.keys()].sort((a, b) => b - a);
    const exercices = years.map((y) => {
      const e = byYear.get(y)!;
      const d = e.periodEnd;
      return {
        year: y,
        label: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`,
      };
    });

    // Valeurs par exercice.
    const actifBrut: Record<string, number>[] = [];
    const actifAmort: Record<string, number>[] = [];
    const actifNet: Record<string, number>[] = [];
    const passifNet: Record<string, number>[] = [];
    const resultatVals: Record<string, number>[] = [];

    for (const y of years) {
      const batchIds = [...byYear.get(y)!.batchIds];
      if (!client.excludeManualEntries) batchIds.push(manualBatchId(id, y));

      const brut: Record<string, number> = {};
      const amort: Record<string, number> = {};
      const passif: Record<string, number> = {};
      const res: Record<string, number> = {};

      if (batchIds.length > 0) {
        try {
          const [bRes, rRes] = await Promise.all([
            clickhouse.query({
              query: `
                SELECT bilan_rubrique AS ref,
                       sumIf(debit - credit, NOT (${IS_AMORT})) AS brut,
                       sumIf(credit - debit, ${IS_AMORT})       AS amort,
                       sum(credit - debit)                      AS solde_credit
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)}) AND bilan_rubrique != ''
                GROUP BY bilan_rubrique
              `,
              query_params: { batchIds },
              format: "JSONEachRow",
            }),
            clickhouse.query({
              query: `
                SELECT rubrique AS ref, sum(credit - debit) AS solde
                FROM ${dbName}.grand_livre
                WHERE batch_id IN ({batchIds:Array(String)}) AND rubrique != ''
                GROUP BY rubrique
              `,
              query_params: { batchIds },
              format: "JSONEachRow",
            }),
          ]);

          for (const row of (await bRes.json()) as BilanRow[]) {
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

          for (const row of (await rRes.json()) as ResultatRow[]) {
            const ref = normalizeRef(row.ref, RESULTAT_REFS);
            if (ref) res[ref] = (res[ref] || 0) + (parseFloat(row.solde) || 0);
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

      actifBrut.push(applyTotals(BILAN_ACTIF, brut));
      actifAmort.push(applyTotals(BILAN_ACTIF, amort));
      actifNet.push(applyTotals(BILAN_ACTIF, net));
      passifNet.push(applyTotals(BILAN_PASSIF, passif));
      resultatVals.push(computeResultatTotals(res));
    }

    const at = (arr: Record<string, number>[], ref: string) => arr.map((v) => v[ref] || 0);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      exercices,
      manualIncluded: !client.excludeManualEntries,
      actif: BILAN_ACTIF.map((l) => ({
        ref: l.ref,
        libelle: l.libelle,
        total: !!l.total,
        // BRUT / AMORT ne concernent que l'exercice N (comme le modèle officiel).
        brut: actifBrut[0]?.[l.ref] || 0,
        amort: actifAmort[0]?.[l.ref] || 0,
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
