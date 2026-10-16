// ============================================================================
// Lecture des référentiels ClickHouse (plan_compte, ple, plan_tiers,
// code_journal) et modification ligne à ligne.
//
// Le schéma de ces tables varie selon les installations (ex. `compte_tiers`
// ou `n_tiers`) : les noms réels des colonnes sont détectés à l'exécution
// (system.columns), comme le fait déjà planTiersList. Les lignes sont lues
// sous leurs noms réels puis renvoyées sous les noms de référence de
// dimensions.ts, en texte.
//
// La modification suit exactement les règles du DAG Airflow
// (plugins/clickhouse/dimensions.py) :
//   - les tables sont des ReplacingMergeTree(updated_at) : modifier une ligne,
//     c'est INSÉRER sa nouvelle version, qui remplace l'ancienne à la fusion
//     (forcée par OPTIMIZE … FINAL) ; aucune ligne n'est supprimée ;
//   - une ligne identique à l'existante n'est pas réécrite ;
//   - les intitulés recopiés dans grand_livre sont mis à jour pour la même clé,
//     sans jamais écraser une valeur par du vide (_GL_PROPAGATION).
// La clé n'est jamais modifiable. Elle est composite pour le mapping (racine,
// type, longueur de racine, sens du solde) : une ligne y est identifiée par
// l'ensemble de ces colonnes.
// ============================================================================
import type { ClickHouseClient } from "@clickhouse/client";
import { tableColumns } from "./schema";
import type { ColonneDimension, TableReferentiel } from "@/lib/comptable/dimensions";
import { colonneCle, colonnesCles } from "@/lib/comptable/dimensions";

export type LigneDimension = Record<string, string>;

/** Option d'un filtre : la valeur filtrée et, le cas échéant, son libellé. */
export interface OptionFiltre {
  code: string;
  libelle?: string;
}

export interface PageDimension {
  lignes: LigneDimension[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const TAILLE_PAGE = 50;
/** Borne de l'export complet d'un référentiel. */
export const MAX_EXPORT = 100_000;
/** Borne du nombre de valeurs proposées par filtre. */
const MAX_OPTIONS = 5000;

/** Filtres par colonne : valeurs retenues (OU dans une colonne, ET entre colonnes). */
export type FiltresReferentiel = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Résolution des noms de colonnes
// ---------------------------------------------------------------------------

/** Nom de référence → nom réel dans la table (absent si la colonne n'existe pas). */
type Colonnes = Map<string, string>;

async function resoudreColonnes(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
): Promise<Colonnes> {
  const reelles = await tableColumns(client, dbName, def.table);
  const prises = new Set<string>();
  const out: Colonnes = new Map();
  for (const c of def.colonnes) {
    // Un même nom réel ne sert qu'une fois (ex. « intitule » candidat de deux colonnes).
    const trouve = [c.nom, ...(c.alias ?? [])].find((n) => reelles.has(n) && !prises.has(n));
    if (trouve) {
      out.set(c.nom, trouve);
      prises.add(trouve);
    }
  }
  const absentes = def.colonnes.filter((c) => !out.has(c.nom)).map((c) => c.nom);
  if (absentes.length)
    console.warn(
      `[referentiels] ${dbName}.${def.table} : colonne(s) introuvable(s) ${absentes.join(", ")} ` +
        `(colonnes réelles : ${[...reelles].join(", ")})`,
    );
  return out;
}

/** Ligne lue sous les noms réels → ligne sous les noms de référence, en texte. */
function versReference(
  def: TableReferentiel,
  cols: Colonnes,
  brute: Record<string, unknown>,
): LigneDimension {
  return Object.fromEntries(
    def.colonnes.map((c) => {
      const reel = cols.get(c.nom);
      const v = reel ? brute[reel] : undefined;
      return [c.nom, v === null || v === undefined ? "" : String(v)];
    }),
  );
}

/**
 * Clause WHERE commune à la liste et au comptage.
 * Les noms de colonnes viennent de la définition et du schéma réel (jamais de
 * la requête) ; les valeurs passent toujours par des paramètres nommés.
 * `toString` rend les colonnes numériques (nb_racine) interrogeables.
 */
function construireWhere(
  def: TableReferentiel,
  cols: Colonnes,
  search: string,
  filtres: FiltresReferentiel,
): { sql: string; params: Record<string, unknown> } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const presentes = def.colonnes.filter((c) => cols.has(c.nom));

  const recherche = search.trim();
  if (recherche && presentes.length) {
    where.push(
      "(" +
        presentes
          .map((c) => `positionCaseInsensitive(toString(${cols.get(c.nom)}), {s:String}) > 0`)
          .join(" OR ") +
        ")",
    );
    params.s = recherche;
  }

  presentes.forEach((c, i) => {
    const valeurs = filtres[c.nom] ?? [];
    if (valeurs.length === 0) return;
    where.push(`toString(${cols.get(c.nom)}) IN ({f${i}:Array(String)})`);
    params[`f${i}`] = valeurs;
  });

  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** Liste des noms réels sélectionnés, sans doublon et sans alias. */
function selection(cols: Colonnes): string {
  return [...new Set(cols.values())].join(", ");
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Page de lignes : recherche plein texte, filtres par champ, tri. */
export async function listerDimension(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
  opts: {
    search?: string;
    filtres?: FiltresReferentiel;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    page?: number;
    /** Toutes les lignes filtrées, sans pagination (export). */
    tout?: boolean;
  },
): Promise<PageDimension> {
  const vide: PageDimension = { lignes: [], total: 0, page: 1, pageSize: TAILLE_PAGE, totalPages: 1 };

  try {
    const cols = await resoudreColonnes(client, dbName, def);
    const cleReelle = cols.get(colonneCle(def).nom);
    if (!cleReelle) return vide;

    const { sql: whereSql, params } = construireWhere(
      def,
      cols,
      opts.search || "",
      opts.filtres || {},
    );
    const tri = cols.get(opts.sortBy || "") ?? cleReelle;
    const sens = opts.sortDir === "desc" ? "DESC" : "ASC";
    const departage = colonnesCles(def)
      .map((c) => cols.get(c.nom))
      .filter((n): n is string => !!n)
      .map((n) => `${n} ASC`)
      .join(", ");

    const cRes = await client.query({
      query: `SELECT count() AS n FROM ${dbName}.${def.table} FINAL ${whereSql}`,
      query_params: params,
      format: "JSONEachRow",
    });
    const total = parseInt(((await cRes.json()) as Array<{ n: string }>)[0]?.n ?? "0", 10) || 0;
    const totalPages = opts.tout ? 1 : Math.max(1, Math.ceil(total / TAILLE_PAGE));
    const page = Math.min(Math.max(1, opts.page || 1), totalPages);
    // LIMIT / OFFSET : entiers calculés ici, jamais issus de la requête.
    const limite = opts.tout
      ? `LIMIT ${MAX_EXPORT}`
      : `LIMIT ${TAILLE_PAGE} OFFSET ${(page - 1) * TAILLE_PAGE}`;

    // Colonnes lues sous leur nom réel, sans alias ; la conversion en texte et
    // le renommage se font ensuite côté serveur.
    const res = await client.query({
      query: `SELECT ${selection(cols)}
              FROM ${dbName}.${def.table} FINAL
              ${whereSql}
              ORDER BY ${tri} ${sens}, ${departage}
              ${limite}`,
      query_params: params,
      format: "JSONEachRow",
    });
    const brutes = (await res.json()) as Array<Record<string, unknown>>;
    const lignes = brutes.map((b) => versReference(def, cols, b));
    return {
      lignes,
      total,
      page,
      pageSize: opts.tout ? lignes.length : TAILLE_PAGE,
      totalPages,
    };
  } catch (e) {
    // Base ou table absente : client jamais importé.
    console.error(`[referentiels] lecture ${dbName}.${def.table} impossible:`, e);
    return vide;
  }
}

/**
 * Valeurs proposées par chaque filtre : les valeurs distinctes de chaque
 * colonne, accompagnées du libellé quand la colonne en a un (compte →
 * intitulé), comme les filtres du grand livre.
 */
export async function optionsFiltresDimension(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
): Promise<Record<string, OptionFiltre[]>> {
  let cols: Colonnes;
  try {
    cols = await resoudreColonnes(client, dbName, def);
  } catch {
    return {};
  }

  const entrees = await Promise.all(
    def.colonnes.map(async (c: ColonneDimension): Promise<[string, OptionFiltre[]]> => {
      const reel = cols.get(c.nom);
      if (!reel) return [c.nom, []];
      const libelleReel = c.libelleDe ? cols.get(c.libelleDe) : undefined;
      try {
        const res = await client.query({
          query: libelleReel
            ? `SELECT toString(${reel}) AS v, anyIf(toString(${libelleReel}), toString(${libelleReel}) != '') AS l
               FROM ${dbName}.${def.table} FINAL
               WHERE toString(${reel}) != ''
               GROUP BY v ORDER BY v LIMIT ${MAX_OPTIONS}`
            : `SELECT DISTINCT toString(${reel}) AS v
               FROM ${dbName}.${def.table} FINAL
               WHERE toString(${reel}) != ''
               ORDER BY v LIMIT ${MAX_OPTIONS}`,
          format: "JSONEachRow",
        });
        const rows = (await res.json()) as Array<{ v: string; l?: string }>;
        return [c.nom, rows.map((r) => (r.l ? { code: r.v, libelle: r.l } : { code: r.v }))];
      } catch {
        return [c.nom, []];
      }
    }),
  );
  return Object.fromEntries(entrees);
}

// ---------------------------------------------------------------------------
// Modification
// ---------------------------------------------------------------------------

export interface ResultatModification {
  /** Ligne après modification, sous les noms de référence, en texte. */
  ligne: LigneDimension;
  modifiee: boolean;
  /** Colonnes du grand livre mises à jour, par nom. */
  grandLivre: string[];
}

/**
 * Modifie les colonnes éditables d'une ligne existante, identifiée par
 * l'ensemble de ses colonnes clés (noms de référence).
 * @throws Error « introuvable » si la ligne n'existe pas dans la table.
 */
export async function modifierDimension(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
  cles: Record<string, string>,
  valeurs: Record<string, string>,
): Promise<ResultatModification> {
  const cols = await resoudreColonnes(client, dbName, def);
  const colonnesCle = colonnesCles(def).filter((c) => cols.has(c.nom));
  if (colonnesCle.length === 0) throw new Error("introuvable");
  // Valeur de la clé principale : sert au report dans le grand livre.
  const cle = cles[colonneCle(def).nom] ?? "";

  const where = colonnesCle
    .map((c, i) => `toString(${cols.get(c.nom)}) = {k${i}:String}`)
    .join(" AND ");
  const params = Object.fromEntries(colonnesCle.map((c, i) => [`k${i}`, cles[c.nom] ?? ""]));

  // Lecture dans les types natifs et sous les noms réels : la nouvelle version
  // est réinsérée telle quelle, seules les colonnes texte éditables changent.
  const res = await client.query({
    query: `SELECT ${selection(cols)} FROM ${dbName}.${def.table} FINAL
            WHERE ${where} LIMIT 1`,
    query_params: params,
    format: "JSONEachRow",
  });
  const actuelle = ((await res.json()) as Array<Record<string, unknown>>)[0];
  if (!actuelle) throw new Error("introuvable");

  const nouvelle: Record<string, unknown> = { ...actuelle };
  for (const c of def.colonnes) {
    const reel = cols.get(c.nom);
    if (reel && c.editable && valeurs[c.nom] !== undefined) nouvelle[reel] = valeurs[c.nom].trim();
  }

  const texte = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const modifiee = [...cols.values()].some((reel) => texte(actuelle[reel]) !== texte(nouvelle[reel]));
  if (!modifiee) return { ligne: versReference(def, cols, actuelle), modifiee: false, grandLivre: [] };

  // updated_at prend sa valeur par défaut (now()) : la version la plus récente
  // l'emporte à la fusion, puis OPTIMIZE FINAL la rend seule visible.
  await client.insert({
    table: `${dbName}.${def.table}`,
    values: [nouvelle],
    format: "JSONEachRow",
  });
  await client.command({ query: `OPTIMIZE TABLE ${dbName}.${def.table} FINAL` });

  // Report dans le grand livre des seules colonnes recopiées et changées,
  // jamais par une valeur vide (même règle que le DAG).
  const reportees: string[] = [];
  if (def.cleGrandLivre) {
    const gl = await tableColumns(client, dbName, "grand_livre");
    if (gl.has(def.cleGrandLivre)) {
      for (const c of def.colonnes) {
        const reel = cols.get(c.nom);
        if (!reel || !c.grandLivre || !gl.has(c.grandLivre)) continue;
        const valeur = texte(nouvelle[reel]);
        if (!valeur || valeur === texte(actuelle[reel])) continue;
        await client.command({
          query: `ALTER TABLE ${dbName}.grand_livre
                  UPDATE ${c.grandLivre} = {v:String}
                  WHERE ${def.cleGrandLivre} = {cle:String}`,
          query_params: { v: valeur, cle },
          clickhouse_settings: { mutations_sync: "1" },
        });
        reportees.push(c.grandLivre);
      }
    }
  }

  return { ligne: versReference(def, cols, nouvelle), modifiee: true, grandLivre: reportees };
}
