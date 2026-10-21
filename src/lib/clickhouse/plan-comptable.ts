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
import { CODES_JOURNAUX_TRESORERIE } from "@/lib/comptable/saisie-refs";

// ---------------------------------------------------------------------------
// Référentiel des journaux (table `code_journal`).
//
// Comme pour les tiers, le nom des colonnes varie selon les installations ;
// la table peut aussi être absente. On retombe alors sur la liste standard
// embarquée dans l'application.
// ---------------------------------------------------------------------------
const journauxCache = new Map<string, { at: number; map: Promise<Map<string, string>> }>();

/** code journal → libellé. Map vide si la table manque. */
export function codeJournauxMap(
  client: ClickHouseClient,
  dbName: string,
): Promise<Map<string, string>> {
  const hit = journauxCache.get(dbName);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;

  const map = (async () => {
    const out = new Map<string, string>();
    try {
      const cols = await tableColumns(client, dbName, "code_journal");
      if (cols.size === 0) return out;
      const pick = (...noms: string[]) => noms.find((n) => cols.has(n));
      const colCode = pick("code_journal", "code", "journal");
      const colLib = pick("libelle_journal", "intitule_journal", "libelle", "intitule");
      if (!colCode || !colLib) return out;

      const res = await client.query({
        query: `SELECT ${colCode} AS c, ${colLib} AS l
                FROM ${dbName}.code_journal
                WHERE ${colCode} != ''`,
        format: "JSONEachRow",
      });
      for (const r of (await res.json()) as Array<{ c: string; l: string }>) {
        if (r.l) out.set(String(r.c).trim(), r.l);
      }
    } catch (e) {
      console.error(`[code-journal] référentiel indisponible (${dbName}):`, e);
    }
    return out;
  })();

  journauxCache.set(dbName, { at: Date.now(), map });
  return map;
}

// ---------------------------------------------------------------------------
// Journaux de trésorerie
//
// Les indicateurs de recouvrement et de règlement fournisseurs séparent les
// mouvements selon le TYPE du journal : un encaissement ou un décaissement
// passe par un journal de trésorerie, une créance ou une dette par les autres
// (ventes, achats, OD, à-nouveaux…).
//
// Source : la table code_journal du client, colonne type = « Trésorerie »
// (valeur Sage, cf. TYPES_JOURNAUX du parseur Airflow), complétée des
// journaux de trésorerie de la saisie (CAIS, BQ). Si le référentiel n'en
// déclare aucun, on retient les journaux qui mouvementent des comptes de
// banque ou de caisse (52*, 57*), ce qui est la définition comptable d'un
// journal de trésorerie.
// ---------------------------------------------------------------------------
const tresorerieCache = new Map<string, { at: number; liste: Promise<string[]> }>();

export function journauxTresorerie(
  client: ClickHouseClient,
  dbName: string,
): Promise<string[]> {
  const hit = tresorerieCache.get(dbName);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.liste;

  const liste = (async () => {
    const codes = new Set<string>(CODES_JOURNAUX_TRESORERIE);
    let duReferentiel = 0;
    try {
      const cols = await tableColumns(client, dbName, "code_journal");
      const parMinuscule = new Map([...cols].map((n) => [n.toLowerCase(), n]));
      const colCode = ["code_journal", "code"].map((n) => parMinuscule.get(n)).find(Boolean);
      const colType = ["type", "type_journal"].map((n) => parMinuscule.get(n)).find(Boolean);
      if (colCode && colType) {
        // « Trésorerie » comme « Tresorerie », quelle que soit la casse.
        const res = await client.query({
          query: `SELECT DISTINCT trim(toString(\`${colCode}\`)) AS c
                  FROM ${dbName}.code_journal FINAL
                  WHERE positionCaseInsensitiveUTF8(toString(\`${colType}\`), 'sorerie') > 0`,
          format: "JSONEachRow",
        });
        for (const r of (await res.json()) as Array<{ c: string }>) {
          if (r.c) {
            codes.add(r.c);
            duReferentiel++;
          }
        }
      }
    } catch (e) {
      console.error(`[journaux] référentiel des journaux illisible (${dbName}):`, e);
    }

    if (duReferentiel === 0) {
      try {
        const res = await client.query({
          query: `SELECT DISTINCT trim(code_journal) AS c
                  FROM ${dbName}.grand_livre
                  WHERE code_journal != ''
                    AND (startsWith(compte, '52') OR startsWith(compte, '57'))`,
          format: "JSONEachRow",
        });
        for (const r of (await res.json()) as Array<{ c: string }>) if (r.c) codes.add(r.c);
        console.warn(`[journaux] ${dbName} : aucun journal « Trésorerie » au référentiel, repli sur les journaux de banque/caisse`);
      } catch (e) {
        console.error(`[journaux] repli impossible (${dbName}):`, e);
      }
    }
    return [...codes];
  })();

  tresorerieCache.set(dbName, { at: Date.now(), liste });
  return liste;
}

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

/**
 * Vide les caches des référentiels d'une base client : à appeler après une
 * modification d'intitulé, pour que le reporting reflète la nouvelle valeur
 * sans attendre l'expiration du cache.
 */
export function invaliderReferentiels(dbName: string): void {
  cache.delete(dbName);
  tiersCache.delete(dbName);
  journauxCache.delete(dbName);
  tresorerieCache.delete(dbName);
}
