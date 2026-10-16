// ============================================================================
// Lecture et modification ligne à ligne des tables de dimension ClickHouse
// (plan_compte, plan_tiers, code_journal).
//
// La modification suit exactement les règles du DAG Airflow
// (plugins/clickhouse/dimensions.py) :
//   - les tables sont des ReplacingMergeTree(updated_at) : modifier une ligne,
//     c'est INSÉRER sa nouvelle version, qui remplace l'ancienne à la fusion
//     (forcée par OPTIMIZE … FINAL) ; aucune ligne n'est supprimée ;
//   - une ligne identique à l'existante n'est pas réécrite ;
//   - les intitulés recopiés dans grand_livre sont mis à jour pour la même clé,
//     sans jamais écraser une valeur par du vide (_GL_PROPAGATION).
// La clé (numéro de compte, de tiers, code journal) n'est jamais modifiable.
// ============================================================================
import type { ClickHouseClient } from "@clickhouse/client";
import { tableColumns } from "./schema";
import type { DimensionDef } from "@/lib/comptable/dimensions";
import { colonneCle } from "@/lib/comptable/dimensions";

export type LigneDimension = Record<string, string>;

export interface PageDimension {
  lignes: LigneDimension[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Valeurs distinctes de la colonne « catégorie » (type, nature). */
  categories: string[];
}

export const TAILLE_PAGE = 50;

/** Liste paginée, recherche plein texte sur toutes les colonnes, tri, filtre. */
export async function listerDimension(
  client: ClickHouseClient,
  dbName: string,
  def: DimensionDef,
  opts: {
    search?: string;
    categorie?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    page?: number;
  },
): Promise<PageDimension> {
  const noms = def.colonnes.map((c) => c.nom);
  const cle = colonneCle(def).nom;
  const colCategorie = def.colonnes.find((c) => c.categorie)?.nom;

  // Noms de colonnes issus de la définition (jamais de l'utilisateur).
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const recherche = (opts.search || "").trim();
  if (recherche) {
    where.push(
      "(" + noms.map((n) => `positionCaseInsensitive(${n}, {s:String}) > 0`).join(" OR ") + ")",
    );
    params.s = recherche;
  }
  if (colCategorie && opts.categorie) {
    where.push(`${colCategorie} = {cat:String}`);
    params.cat = opts.categorie;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const tri = noms.includes(opts.sortBy || "") ? opts.sortBy! : cle;
  const sens = opts.sortDir === "desc" ? "DESC" : "ASC";

  const vide: PageDimension = {
    lignes: [],
    total: 0,
    page: 1,
    pageSize: TAILLE_PAGE,
    totalPages: 1,
    categories: [],
  };

  try {
    const [cRes, categoriesRes] = await Promise.all([
      client.query({
        query: `SELECT count() AS n FROM ${dbName}.${def.table} FINAL ${whereSql}`,
        query_params: params,
        format: "JSONEachRow",
      }),
      colCategorie
        ? client.query({
            query: `SELECT DISTINCT ${colCategorie} AS v FROM ${dbName}.${def.table} FINAL
                    WHERE ${colCategorie} != '' ORDER BY v LIMIT 200`,
            format: "JSONEachRow",
          })
        : null,
    ]);
    const total = parseInt(((await cRes.json()) as Array<{ n: string }>)[0]?.n ?? "0", 10) || 0;
    const categories = categoriesRes
      ? ((await categoriesRes.json()) as Array<{ v: string }>).map((r) => r.v)
      : [];

    const totalPages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
    const page = Math.min(Math.max(1, opts.page || 1), totalPages);

    const res = await client.query({
      query: `SELECT ${noms.join(", ")}
              FROM ${dbName}.${def.table} FINAL
              ${whereSql}
              ORDER BY ${tri} ${sens}, ${cle} ASC
              LIMIT ${TAILLE_PAGE} OFFSET ${(page - 1) * TAILLE_PAGE}`,
      // LIMIT / OFFSET : entiers calculés ici, jamais issus de la requête.
      query_params: params,
      format: "JSONEachRow",
    });
    const lignes = (await res.json()) as LigneDimension[];
    return { lignes, total, page, pageSize: TAILLE_PAGE, totalPages, categories };
  } catch (e) {
    // Base ou table absente : client jamais importé.
    console.error(`[dimensions] lecture ${dbName}.${def.table} impossible:`, e);
    return vide;
  }
}

export interface ResultatModification {
  ligne: LigneDimension;
  modifiee: boolean;
  /** Colonnes du grand livre mises à jour, par nom. */
  grandLivre: string[];
}

/**
 * Modifie les colonnes éditables d'une ligne existante.
 * @throws Error « introuvable » si la clé n'existe pas dans la table.
 */
export async function modifierDimension(
  client: ClickHouseClient,
  dbName: string,
  def: DimensionDef,
  cle: string,
  valeurs: Record<string, string>,
): Promise<ResultatModification> {
  const noms = def.colonnes.map((c) => c.nom);
  const colCle = colonneCle(def).nom;

  const res = await client.query({
    query: `SELECT ${noms.join(", ")} FROM ${dbName}.${def.table} FINAL
            WHERE ${colCle} = {cle:String} LIMIT 1`,
    query_params: { cle },
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
