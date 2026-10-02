// ============================================================================
// Introspection du schéma `grand_livre`.
//
// L'ETL a fusionné les deux colonnes de rubrique : `rubrique` porte désormais
// AUSSI BIEN les codes de bilan (AD, AK, CA, DJ…) que ceux du compte de
// résultat (TA, RK…). Sur les bases non encore migrées, `bilan_rubrique`
// existe toujours et porte les codes de bilan.
//
// Toute requête doit donc s'adapter au schéma réellement présent, faute de
// quoi elle échoue à l'analyse (colonne inconnue) et le reporting renvoie des
// zéros. On lit la liste des colonnes une fois, avec un cache court pour ne
// pas rester bloqué sur un schéma obsolète pendant une migration.
// ============================================================================
import type { ClickHouseClient } from "@clickhouse/client";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; cols: Promise<Set<string>> }>();

/** Colonnes d'une table de la base client (cache court). */
export function tableColumns(
  client: ClickHouseClient,
  dbName: string,
  table: string,
): Promise<Set<string>> {
  const key = `${dbName}.${table}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cols;

  const cols = (async () => {
    try {
      const res = await client.query({
        query: `SELECT name FROM system.columns
                WHERE database = {db:String} AND table = {tbl:String}`,
        query_params: { db: dbName, tbl: table },
        format: "JSONEachRow",
      });
      const rows = (await res.json()) as Array<{ name: string }>;
      return new Set(rows.map((r) => r.name));
    } catch (e) {
      console.error(`[schema] lecture des colonnes impossible (${dbName}):`, e);
      // En cas d'échec on suppose le schéma fusionné (le plus récent).
      return new Set<string>(["rubrique"]);
    }
  })();

  cache.set(key, { at: Date.now(), cols });
  return cols;
}

/** Colonnes de `grand_livre`. */
export function grandLivreColumns(
  client: ClickHouseClient,
  dbName: string,
): Promise<Set<string>> {
  return tableColumns(client, dbName, "grand_livre");
}

/**
 * Expression SQL renvoyant le code de rubrique du BILAN.
 * - schéma d'origine : `bilan_rubrique`, avec repli sur `rubrique` si vide ;
 * - schéma fusionné  : `rubrique` (les codes de gestion sont écartés ensuite
 *   par `normalizeRef`, qui ne reconnaît que les REF du modèle).
 */
export async function bilanRefExpr(
  client: ClickHouseClient,
  dbName: string,
): Promise<string> {
  const cols = await grandLivreColumns(client, dbName);
  return cols.has("bilan_rubrique")
    ? "if(bilan_rubrique != '', bilan_rubrique, rubrique)"
    : "rubrique";
}

/** true si la colonne `bilan_rubrique` existe encore (écritures manuelles). */
export async function hasBilanRubrique(
  client: ClickHouseClient,
  dbName: string,
): Promise<boolean> {
  return (await grandLivreColumns(client, dbName)).has("bilan_rubrique");
}
