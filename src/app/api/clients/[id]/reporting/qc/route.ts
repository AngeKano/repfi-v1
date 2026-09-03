import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";
import { manualBatchId } from "@/lib/clickhouse/manual-sync";
import {
  checkAttributedNotExceedTotal,
  checkNoForbiddenPrefix,
  checkRateBounded,
  checkSharesBounded,
  summarize,
  type QcCheck,
} from "@/lib/reporting/qc-invariants";

// ============================================================================
// GET /api/clients/[id]/reporting/qc?year=YYYY&endMonth=MM
//
// Self-check qualité du reporting. Exécute des requêtes ClickHouse
// INDÉPENDANTES (et non une copie des fonctions auditées) sur la période
// Janvier → endMonth de l'exercice `year`, puis applique les invariants de
// `src/lib/reporting/qc-invariants.ts`. Valide notamment A1 (anti
// double-comptage du Top 10 clients) et l'exclusion 418/419.
//
// Réponse : { client, period, checks: QcCheck[], summary }
// ============================================================================

const clickhouseClient = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

function getClickhouseDbName(id: string): string {
  return `repfi_${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

const PERIOD_FILTER = `
  AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) >= {startYM:String}
  AND concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)) <= {endYM:String}
`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year") || new Date().getFullYear().toString();
    const endMonth = (searchParams.get("endMonth") || "12").padStart(2, "0");

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true, assujettiTVA: true, excludeManualEntries: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }
    if (client.companyId !== session.user.companyId) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const dbName = getClickhouseDbName(id);
    const periods = await prisma.comptablePeriod.findMany({
      where: { clientId: id },
      select: { batchId: true },
    });
    const batchIds = [
      ...periods.map((p) => p.batchId).filter((b): b is string => !!b),
      ...(client.excludeManualEntries ? [] : [manualBatchId(id, parseInt(year, 10))]),
    ];

    const startYM = `${year}01`;
    const endYM = `${year}${endMonth}`;
    const baseParams = { batchIds, startYM, endYM };

    const checks: QcCheck[] = [];

    if (batchIds.length === 0) {
      return NextResponse.json({
        client: { id: client.id, name: client.name },
        period: { year, endMonth, startYM, endYM },
        checks: [],
        summary: summarize([]),
        note: "Aucune période comptable pour ce client.",
      });
    }

    // --- Q1 : créances / encaissements clients (41* hors 418/419) -----------
    const q1 = await clickhouseClient.query({
      query: `
        SELECT
          sum(debit) AS ca_ttc,
          sum(credit) AS ca_encaisse
        FROM ${dbName}.grand_livre
        WHERE batch_id IN ({batchIds:Array(String)})
          AND startsWith(compte, '41')
          AND NOT startsWith(compte, '418')
          AND NOT startsWith(compte, '419')
          AND NOT startsWith(n_tiers, '418')
          AND NOT startsWith(n_tiers, '419')
          ${PERIOD_FILTER}
      `,
      query_params: baseParams,
      format: "JSONEachRow",
    });
    const [r1] = (await q1.json()) as Array<{
      ca_ttc: string;
      ca_encaisse: string;
    }>;
    const caTTC = parseFloat(r1?.ca_ttc) || 0;
    const caEncaisse = parseFloat(r1?.ca_encaisse) || 0;
    const taux = caTTC !== 0 ? (caEncaisse / caTTC) * 100 : 0;
    checks.push(
      checkRateBounded(
        "C2-taux-recouvrement",
        "Taux de recouvrement dans [0 ; 100]",
        taux,
      ),
    );

    // --- Q2 : Top 10 créances (logique production) + total soldes positifs --
    const q2 = await clickhouseClient.query({
      query: `
        WITH creances AS (
          SELECT n_tiers, sum(debit) - sum(credit) AS solde
          FROM ${dbName}.grand_livre
          WHERE batch_id IN ({batchIds:Array(String)})
            AND startsWith(compte, '41')
            AND NOT startsWith(compte, '418')
            AND NOT startsWith(compte, '419')
            AND NOT startsWith(n_tiers, '418')
            AND NOT startsWith(n_tiers, '419')
            AND n_tiers != ''
            AND intitule_tiers != ''
            ${PERIOD_FILTER}
          GROUP BY n_tiers
          HAVING solde > 0
        )
        SELECT
          (SELECT sum(solde) FROM creances) AS total_solde,
          n_tiers,
          solde
        FROM creances
        ORDER BY solde DESC
        LIMIT 10
      `,
      query_params: baseParams,
      format: "JSONEachRow",
    });
    const top = (await q2.json()) as Array<{
      total_solde: string;
      n_tiers: string;
      solde: string;
    }>;
    const totalSolde = parseFloat(top[0]?.total_solde) || 0;
    const shares = top.map((t) =>
      totalSolde > 0 ? (parseFloat(t.solde) / totalSolde) * 100 : 0,
    );
    checks.push(
      checkSharesBounded(
        "C3-top-creances-parts",
        "Σ parts du Top 10 créances ≤ 100%",
        shares,
      ),
      checkNoForbiddenPrefix(
        "C4-creances-418-419",
        "Aucun tiers 418/419 dans les créances",
        top.map((t) => t.n_tiers),
        ["418", "419"],
      ),
    );

    // --- Q3 : A1 — CA attribué (assujetti) ou Top clients (non-assujetti) ---
    if (client.assujettiTVA) {
      const [qTotal, qAttr] = await Promise.all([
        clickhouseClient.query({
          query: `
            SELECT sum(credit - debit) AS total_ca
            FROM ${dbName}.grand_livre
            WHERE batch_id IN ({batchIds:Array(String)})
              AND rubrique = 'TC'
              ${PERIOD_FILTER}
          `,
          query_params: baseParams,
          format: "JSONEachRow",
        }),
        clickhouseClient.query({
          query: `
            WITH ventes_ht AS (
              SELECT numero_piece, date_transaction, (credit - debit) AS montant_ht
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)})
                AND rubrique = 'TC'
                ${PERIOD_FILTER}
            ),
            tiers_piece AS (
              SELECT DISTINCT numero_piece, date_transaction
              FROM ${dbName}.grand_livre
              WHERE batch_id IN ({batchIds:Array(String)})
                AND startsWith(compte, '41')
                AND NOT startsWith(compte, '418')
                AND NOT startsWith(compte, '419')
                AND NOT startsWith(n_tiers, '418')
                AND NOT startsWith(n_tiers, '419')
                AND n_tiers != ''
                AND intitule_tiers != ''
            )
            SELECT sum(v.montant_ht) AS attributed
            FROM ventes_ht v
            INNER JOIN tiers_piece t
              ON t.numero_piece = v.numero_piece
              AND t.date_transaction = v.date_transaction
          `,
          query_params: baseParams,
          format: "JSONEachRow",
        }),
      ]);
      const totalCa =
        parseFloat(((await qTotal.json()) as Array<{ total_ca: string }>)[0]?.total_ca) || 0;
      const attributed =
        parseFloat(((await qAttr.json()) as Array<{ attributed: string }>)[0]?.attributed) || 0;
      checks.push(checkAttributedNotExceedTotal(attributed, totalCa));
    } else {
      // Non-assujetti : Top clients = débit 41* ; parts bornées + no 418/419.
      const qc = await clickhouseClient.query({
        query: `
          WITH clients AS (
            SELECT n_tiers, sum(debit) AS ca
            FROM ${dbName}.grand_livre
            WHERE batch_id IN ({batchIds:Array(String)})
              AND startsWith(compte, '41')
              AND NOT startsWith(compte, '418')
              AND NOT startsWith(compte, '419')
              AND NOT startsWith(n_tiers, '418')
              AND NOT startsWith(n_tiers, '419')
              AND n_tiers != ''
              ${PERIOD_FILTER}
            GROUP BY n_tiers
          )
          SELECT (SELECT sum(ca) FROM clients) AS total_ca, n_tiers, ca
          FROM clients ORDER BY ca DESC LIMIT 10
        `,
        query_params: baseParams,
        format: "JSONEachRow",
      });
      const rows = (await qc.json()) as Array<{
        total_ca: string;
        n_tiers: string;
        ca: string;
      }>;
      const totalCa = parseFloat(rows[0]?.total_ca) || 0;
      checks.push(
        checkSharesBounded(
          "A1-top-clients-parts",
          "Σ parts du Top 10 clients ≤ 100%",
          rows.map((r) => (totalCa > 0 ? (parseFloat(r.ca) / totalCa) * 100 : 0)),
        ),
      );
    }

    // --- Q4 : A10 — aucun batch ne mélange plusieurs exercices --------------
    // (sans filtre de période : on inspecte chaque batch sur toutes ses dates).
    const q4 = await clickhouseClient.query({
      query: `
        SELECT batch_id, count(DISTINCT substring(date_transaction, 7, 4)) AS n_years
        FROM ${dbName}.grand_livre
        WHERE batch_id IN ({batchIds:Array(String)})
        GROUP BY batch_id
        HAVING n_years > 1
      `,
      query_params: { batchIds },
      format: "JSONEachRow",
    });
    const multiYear = (await q4.json()) as Array<{
      batch_id: string;
      n_years: string;
    }>;
    checks.push({
      id: "A10-exercice-unique",
      label: "Aucun batch ne mélange plusieurs exercices",
      severity: "moyen",
      status: multiYear.length === 0 ? "pass" : "warn",
      expected: "0 batch multi-année",
      actual: `${multiYear.length} batch(s)`,
      detail: multiYear.length
        ? `Batchs concernés : ${multiYear.map((m) => m.batch_id).slice(0, 5).join(", ")} → risque de mélange N/N-1 dans /reporting.`
        : undefined,
    });

    return NextResponse.json({
      client: { id: client.id, name: client.name, assujettiTVA: client.assujettiTVA },
      period: { year, endMonth, startYM, endYM },
      checks,
      summary: summarize(checks),
    });
  } catch (error) {
    console.error("QC reporting error:", error);
    return NextResponse.json(
      { error: "Erreur lors du contrôle qualité du reporting" },
      { status: 500 },
    );
  }
}
