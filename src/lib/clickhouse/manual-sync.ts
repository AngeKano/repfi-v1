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
import { hasBilanRubrique } from "./schema";
import { chargerPle, classerCompte } from "./ple";

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

// Colonnes enrichies : présentes dans le grand livre alimenté par l'ETL, mais
// on ne peut pas garantir qu'elles existent sur toutes les installations. On
// tente l'insertion complète puis on retombe sur le jeu de base si ça échoue.
interface GrandLivreRowFull extends GrandLivreRow {
  code_journal: string;
  type_tiers: string;
  numero_facture: string;
  libelle: string;
}

// Reconstruit intégralement le batch manuel d'un client/année dans ClickHouse
// à partir de la source de vérité Postgres (idempotent).
/**
 * Rubrique que porte actuellement ClickHouse pour chaque compte du lot de
 * saisies. Airflow peut avoir reclassé ces lignes après une modification du
 * mapping PLE : c'est alors la valeur à jour. On la relit avant de réécrire
 * le lot, faute de quoi la resynchronisation y remettrait l'ancienne rubrique.
 */
async function rubriquesDuLot(dbName: string, batch: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const res = await clickhouseClient.query({
    query: `SELECT compte, anyIf(rubrique, rubrique != '') AS r
            FROM ${dbName}.grand_livre
            WHERE batch_id = {batch:String}
            GROUP BY compte`,
    query_params: { batch },
    format: "JSONEachRow",
  });
  for (const row of (await res.json()) as Array<{ compte: string; r: string }>) {
    if (row.r) out.set(row.compte, row.r);
  }
  return out;
}

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
    const colonneBilan = await hasBilanRubrique(clickhouseClient, dbName);

    // 0. Rubriques des saisies. Elles ne passent pas par l'ETL : on applique
    //    ici le mapping `ple` avec la même règle qu'Airflow, sur le solde de
    //    chaque compte dans le lot (sens débiteur / créditeur des comptes
    //    mixtes). La copie Postgres est alignée pour que l'onglet Comptabilité
    //    affiche la même valeur. Un compte sans règle garde sa rubrique.
    const ple = entries.length > 0 ? await chargerPle(clickhouseClient, dbName) : null;
    if (ple && ple.taille > 0) {
      const soldes = new Map<string, number>();
      for (const e of entries)
        soldes.set(e.compte, (soldes.get(e.compte) || 0) + e.debit - e.credit);
      const changees = new Map<string, { rubrique: string; bilanRubrique: string }>();
      for (const [compte, solde] of soldes) {
        const { pl, bilan } = classerCompte(ple, compte, solde);
        if (!pl && !bilan) continue;
        // Schéma fusionné : un seul code, porté par les deux champs.
        // Ancien schéma : rubrique de gestion et rubrique de bilan séparées.
        changees.set(
          compte,
          colonneBilan
            ? { rubrique: pl, bilanRubrique: bilan }
            : { rubrique: pl || bilan, bilanRubrique: pl || bilan },
        );
      }
      for (const e of entries) {
        const c = changees.get(e.compte);
        if (c) Object.assign(e, c);
      }
      for (const [compte, data] of changees) {
        await prisma.manualLedgerEntry.updateMany({
          where: { clientId, year, compte, NOT: data },
          data,
        });
      }
    } else if (!colonneBilan && entries.length > 0) {
      // Pas de mapping lisible : on reprend la rubrique que ClickHouse porte
      // déjà pour le compte dans ce lot (éventuellement reclassée par Airflow).
      try {
        const actuelles = await rubriquesDuLot(dbName, batch);
        const changees = new Map<string, string>();
        for (const e of entries) {
          const r = actuelles.get(e.compte);
          if (r && r !== e.rubrique) {
            e.rubrique = r;
            changees.set(e.compte, r);
          }
        }
        for (const [compte, rubrique] of changees) {
          await prisma.manualLedgerEntry.updateMany({
            where: { clientId, year, compte },
            data: { rubrique },
          });
        }
      } catch (e) {
        // Best-effort : à défaut, la rubrique enregistrée est conservée.
        console.warn(`[manual-sync] rubriques importées indisponibles (${batch}):`, e);
      }
    }

    // 1. Vider l'ancien contenu du batch manuel (mutation asynchrone ClickHouse).
    await clickhouseClient.command({
      query: `ALTER TABLE ${dbName}.grand_livre DELETE WHERE batch_id = '${batch}'`,
    });

    // 2. Réinsérer l'état courant.
    if (entries.length > 0) {
      const rowsFull: GrandLivreRowFull[] = entries.map((e) => ({
        batch_id: batch,
        date_transaction: formatDateFR(e.dateTransaction),
        compte: e.compte,
        intitule_compte: e.intituleCompte,
        n_tiers: e.nTiers,
        intitule_tiers: e.intituleTiers,
        // Schéma fusionné : la colonne `rubrique` porte les deux familles de
        // codes ; un compte de bilan n'a pas de rubrique de gestion, on y écrit
        // donc son code bilan. Sur l'ancien schéma, les deux colonnes coexistent.
        rubrique: colonneBilan ? e.rubrique : e.rubrique || e.bilanRubrique,
        bilan_rubrique: e.bilanRubrique,
        numero_piece: e.numeroPiece,
        debit: e.debit,
        credit: e.credit,
        code_journal: e.codeJournal,
        type_tiers: e.typeTiers,
        numero_facture: e.numeroFacture,
        libelle: e.libelle,
      }));
      // Sur le schéma fusionné, la colonne `bilan_rubrique` n'existe plus :
      // on la retire du payload pour ne pas faire échouer l'insertion.
      // ClickHouse accepte n'importe quelle forme d'objet en JSONEachRow ; le
      // type générique du client impose la ligne complète, d'où la conversion.
      const values = (colonneBilan
        ? rowsFull
        : rowsFull.map((r) => {
            const copie: Record<string, unknown> = { ...r };
            delete copie.bilan_rubrique;
            return copie;
          })) as unknown as GrandLivreRowFull[];
      try {
        await clickhouseClient.insert({
          table: `${dbName}.grand_livre`,
          values,
          format: "JSONEachRow",
        });
      } catch (errFull) {
        // Repli : certaines colonnes enrichies n'existent pas sur cette table.
        console.warn(`[manual-sync] insertion enrichie refusée, repli colonnes de base:`, errFull);
        const rowsBase: Partial<GrandLivreRow>[] = rowsFull.map((r) => ({
          batch_id: r.batch_id,
          date_transaction: r.date_transaction,
          compte: r.compte,
          intitule_compte: r.intitule_compte,
          n_tiers: r.n_tiers,
          intitule_tiers: r.intitule_tiers,
          rubrique: r.rubrique,
          ...(colonneBilan ? { bilan_rubrique: r.bilan_rubrique } : {}),
          numero_piece: r.numero_piece,
          debit: r.debit,
          credit: r.credit,
        }));
        await clickhouseClient.insert({
          table: `${dbName}.grand_livre`,
          values: rowsBase,
          format: "JSONEachRow",
        });
      }
    }
  } catch (err) {
    // Si la base/table ClickHouse n'existe pas encore (aucun upload), on
    // n'échoue pas : la source de vérité reste Postgres (onglet Saisie).
    console.error(`[manual-sync] échec sync ${batch}:`, err);
  }
}
