// ============================================================================
// Synchronisation des lignes comptables SAISIES MANUELLEMENT (source de vérité
// Postgres) vers ClickHouse `grand_livre`, sous un batch dédié
// `manual_{clientId}_{year}`. Cela permet au reporting (qui lit ClickHouse par
// batch_id) d'inclure les lignes manuelles sans réécrire les agrégations : il
// suffit d'ajouter ces batch_ids à la collecte des batchIds.
//
// Les lignes uploadées (immuables) ne sont JAMAIS touchées : on ne DELETE/INSERT
// que le batch `manual_...` propre aux saisies.
// ============================================================================
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { prisma } from "@/lib/prisma";

const clickhouseClient = createClickhouseClient({
  url: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
});

export function getClickhouseDbName(clientId: string): string {
  return `repfi_${clientId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

// Batch ClickHouse dédié aux saisies manuelles d'un client pour une année.
export function manualBatchId(clientId: string, year: number): string {
  return `manual_${clientId.replace(/[^a-zA-Z0-9]/g, "_")}_${year}`;
}

// Liste des batch_ids manuels à injecter dans la collecte de batchIds du
// reporting (les batchs inexistants ne matchent simplement rien).
export function manualBatchIdsForYears(
  clientId: string,
  years: number[],
): string[] {
  return years.map((y) => manualBatchId(clientId, y));
}

// Date JS → format grand_livre "DD/MM/YYYY" (les dates ClickHouse sont des
// String dans ce format).
function formatDateFR(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

interface GrandLivreRow {
  batch_id: string;
  date_transaction: string;
  compte: string;
  intitule_compte: string;
  n_tiers: string;
  intitule_tiers: string;
  rubrique: string;
  bilan_rubrique: string;
  numero_piece: string;
  debit: number;
  credit: number;
}

// Reconstruit intégralement le batch manuel d'un client/année dans ClickHouse
// à partir de la source de vérité Postgres (idempotent).
export async function syncManualBatch(
  clientId: string,
  year: number,
): Promise<void> {
  const dbName = getClickhouseDbName(clientId);
  const batch = manualBatchId(clientId, year);

  const entries = await prisma.manualLedgerEntry.findMany({
    where: { clientId, year },
  });

  try {
    // 1. Vider l'ancien contenu du batch manuel (mutation asynchrone ClickHouse).
    await clickhouseClient.command({
      query: `ALTER TABLE ${dbName}.grand_livre DELETE WHERE batch_id = '${batch}'`,
    });

    // 2. Réinsérer l'état courant.
    if (entries.length > 0) {
      const rows: GrandLivreRow[] = entries.map((e) => ({
        batch_id: batch,
        date_transaction: formatDateFR(e.dateTransaction),
        compte: e.compte,
        intitule_compte: e.intituleCompte,
        n_tiers: e.nTiers,
        intitule_tiers: e.intituleTiers,
        rubrique: e.rubrique,
        bilan_rubrique: e.bilanRubrique,
        numero_piece: e.numeroPiece,
        debit: e.debit,
        credit: e.credit,
      }));
      await clickhouseClient.insert({
        table: `${dbName}.grand_livre`,
        values: rows,
        format: "JSONEachRow",
      });
    }
  } catch (err) {
    // Si la base/table ClickHouse n'existe pas encore (aucun upload), on
    // n'échoue pas : la source de vérité reste Postgres (onglet Saisie).
    console.error(`[manual-sync] échec sync ${batch}:`, err);
  }
}
