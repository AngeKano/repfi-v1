// ============================================================================
// Référentiel du plan comptable (table `plan_compte`).
//
// Le grand livre ne porte pas systématiquement l'intitulé du compte : selon le
// fichier d'origine, `intitule_compte` est vide sur une partie des lignes (les
// lignes « tiers », par exemple). La table `plan_compte` fait autorité et
// couvre l'intégralité des comptes — on s'en sert donc en priorité.
//
// La table peut être absente sur une base ancienne : on retombe alors
// silencieusement sur ce que porte le grand livre.
// ============================================================================
import type { ClickHouseClient } from "@clickhouse/client";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; map: Promise<Map<string, string>> }>();

/** compte → intitulé, d'après `plan_compte`. Map vide si la table manque. */
export function planComptesMap(
  client: ClickHouseClient,
  dbName: string,
): Promise<Map<string, string>> {
  const hit = cache.get(dbName);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;

  const map = (async () => {
    const out = new Map<string, string>();
    try {
      const res = await client.query({
        query: `SELECT compte, intitule_compte
                FROM ${dbName}.plan_compte
                WHERE compte != '' AND intitule_compte != ''`,
        format: "JSONEachRow",
      });
      for (const r of (await res.json()) as Array<{
        compte: string;
        intitule_compte: string;
      }>) {
        out.set(r.compte.trim(), r.intitule_compte);
      }
    } catch (e) {
      console.error(`[plan-compte] référentiel indisponible (${dbName}):`, e);
    }
    return out;
  })();

  cache.set(dbName, { at: Date.now(), map });
  return map;
}

/**
 * Intitulé d'un compte : le plan comptable fait foi ; à défaut on garde ce que
 * porte le grand livre. Les comptes auxiliaires (411101) héritent de leur
 * compte collectif (411100) lorsqu'ils ne sont pas eux-mêmes au plan.
 */
export function intituleCompte(
  plan: Map<string, string>,
  compte: string,
  fallback = "",
): string {
  const c = (compte || "").trim();
  if (!c) return fallback;
  const exact = plan.get(c);
  if (exact) return exact;
  // Repli par troncature : 411101 → 41110 → 4111 → 411 …
  for (let len = c.length - 1; len >= 3; len--) {
    const hit = plan.get(c.slice(0, len));
    if (hit) return hit;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Référentiel des tiers (table `plan_tiers`).
//
// Son schéma varie selon les installations (le numéro peut s'appeler
// `compte_tiers` ou `n_tiers`). On lit donc les colonnes réellement présentes
// plutôt que de les supposer.
// ---------------------------------------------------------------------------
import { tableColumns } from "./schema";

export interface TiersRef {
  nTiers: string;
  intitule: string;
  type: string;
}

const tiersCache = new Map<string, { at: number; list: Promise<TiersRef[]> }>();

export function planTiersList(
  client: ClickHouseClient,
  dbName: string,
): Promise<TiersRef[]> {
  const hit = tiersCache.get(dbName);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.list;

  const list = (async (): Promise<TiersRef[]> => {
    try {
      const cols = await tableColumns(client, dbName, "plan_tiers");
      if (cols.size === 0) return [];
      const pick = (...noms: string[]) => noms.find((n) => cols.has(n));
      const colNum = pick("compte_tiers", "n_tiers", "numero_tiers", "compte");
      const colLib = pick("intitule_tiers", "intitule", "libelle");
      const colType = pick("type_tiers", "type");
      if (!colNum) return [];

      const res = await client.query({
        query: `SELECT ${colNum} AS n,
                       ${colLib ? colLib : "''"} AS i,
                       ${colType ? colType : "''"} AS t
                FROM ${dbName}.plan_tiers
                WHERE ${colNum} != ''`,
        format: "JSONEachRow",
      });
      return ((await res.json()) as Array<{ n: string; i: string; t: string }>).map(
        (r) => ({ nTiers: String(r.n).trim(), intitule: r.i || "", type: r.t || "" }),
      );
    } catch (e) {
      console.error(`[plan-tiers] référentiel indisponible (${dbName}):`, e);
      return [];
    }
  })();

  tiersCache.set(dbName, { at: Date.now(), list });
  return list;
}
