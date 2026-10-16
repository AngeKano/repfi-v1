// ============================================================================
// Lecture des référentiels ClickHouse (plan_compte, ple, plan_tiers,
// code_journal) et modification ligne à ligne.
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
import type { TableReferentiel } from "@/lib/comptable/dimensions";
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

/**
 * Clause WHERE commune à la liste et au comptage.
 * Les noms de colonnes viennent de la définition (jamais de la requête) ; les
 * valeurs passent toujours par des paramètres nommés. `toString` rend les
 * colonnes numériques (nb_racine) interrogeables comme les autres.
 */
function construireWhere(
  def: TableReferentiel,
  search: string,
  filtres: FiltresReferentiel,
): { sql: string; params: Record<string, unknown> } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  const recherche = search.trim();
  if (recherche) {
    where.push(
      "(" +
        def.colonnes
          .map((c) => `positionCaseInsensitive(toString(${c.nom}), {s:String}) > 0`)
          .join(" OR ") +
        ")",
    );
    params.s = recherche;
  }

  def.colonnes.forEach((c, i) => {
    const valeurs = (filtres[c.nom] ?? []).filter((v) => v !== undefined);
    if (valeurs.length === 0) return;
    where.push(`toString(${c.nom}) IN ({f${i}:Array(String)})`);
    params[`f${i}`] = valeurs;
  });

  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

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
  const noms = def.colonnes.map((c) => c.nom);
  const cles = def.colonnes.filter((c) => c.cle).map((c) => c.nom);
  const { sql: whereSql, params } = construireWhere(def, opts.search || "", opts.filtres || {});

  const tri = noms.includes(opts.sortBy || "") ? opts.sortBy! : colonneCle(def).nom;
  const sens = opts.sortDir === "desc" ? "DESC" : "ASC";

  try {
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

    // Valeurs rendues en texte : l'interface les traite toutes de la même façon.
    const res = await client.query({
      query: `SELECT ${noms.map((n) => `toString(${n}) AS ${n}`).join(", ")}
              FROM ${dbName}.${def.table} FINAL
              ${whereSql}
              ORDER BY ${tri} ${sens}, ${cles.map((c) => `${c} ASC`).join(", ")}
              ${limite}`,
      query_params: params,
      format: "JSONEachRow",
    });
    const lignes = (await res.json()) as LigneDimension[];
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
    return { lignes: [], total: 0, page: 1, pageSize: TAILLE_PAGE, totalPages: 1 };
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
  const entrees = await Promise.all(
    def.colonnes.map(async (c): Promise<[string, OptionFiltre[]]> => {
      try {
        const res = await client.query({
          query: c.libelleDe
            ? `SELECT toString(${c.nom}) AS v, anyIf(${c.libelleDe}, ${c.libelleDe} != '') AS l
               FROM ${dbName}.${def.table} FINAL
               WHERE toString(${c.nom}) != ''
               GROUP BY v ORDER BY v LIMIT ${MAX_OPTIONS}`
            : `SELECT DISTINCT toString(${c.nom}) AS v
               FROM ${dbName}.${def.table} FINAL
               WHERE toString(${c.nom}) != ''
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

export interface ResultatModification {
  ligne: LigneDimension;
  modifiee: boolean;
  /** Colonnes du grand livre mises à jour, par nom. */
  grandLivre: string[];
}

/**
 * Modifie les colonnes éditables d'une ligne existante, identifiée par
 * l'ensemble de ses colonnes clés.
 * @throws Error « introuvable » si la ligne n'existe pas dans la table.
 */
export async function modifierDimension(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
  cles: Record<string, string>,
  valeurs: Record<string, string>,
): Promise<ResultatModification> {
  const noms = def.colonnes.map((c) => c.nom);
  const colonnesCle = colonnesCles(def);
  // Valeur de la clé principale : sert au report dans le grand livre.
  const cle = cles[colonneCle(def).nom] ?? "";

  // toString : la longueur de racine du mapping est numérique.
  const where = colonnesCle.map((c, i) => `toString(${c.nom}) = {k${i}:String}`).join(" AND ");
  const params = Object.fromEntries(colonnesCle.map((c, i) => [`k${i}`, cles[c.nom] ?? ""]));

  // Lecture dans les types natifs : la nouvelle version est réinsérée telle
  // quelle, seules les colonnes texte éditables changent.
  const res = await client.query({
    query: `SELECT ${noms.join(", ")} FROM ${dbName}.${def.table} FINAL
            WHERE ${where} LIMIT 1`,
    query_params: params,
    format: "JSONEachRow",
  });
  const actuelle = ((await res.json()) as LigneDimension[])[0];
  if (!actuelle) throw new Error("introuvable");

  // Nouvelle version : seules les colonnes éditables changent.
  const nouvelle: LigneDimension = { ...actuelle };
  for (const c of def.colonnes) {
    if (c.editable && valeurs[c.nom] !== undefined) nouvelle[c.nom] = valeurs[c.nom].trim();
  }

  const modifiee = def.colonnes.some((c) => (actuelle[c.nom] ?? "") !== (nouvelle[c.nom] ?? ""));
  if (!modifiee) return { ligne: actuelle, modifiee: false, grandLivre: [] };

  // updated_at prend sa valeur par défaut (now()) : la version la plus récente
  // l'emporte à la fusion, puis OPTIMIZE FINAL la rend seule visible.
  await client.insert({
    table: `${dbName}.${def.table}`,
    values: [Object.fromEntries(noms.map((n) => [n, nouvelle[n] ?? ""]))],
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
        if (!c.grandLivre || !gl.has(c.grandLivre)) continue;
        const valeur = nouvelle[c.nom] ?? "";
        if (!valeur || valeur === (actuelle[c.nom] ?? "")) continue;
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

  return { ligne: nouvelle, modifiee: true, grandLivre: reportees };
}
