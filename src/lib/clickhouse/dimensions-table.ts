// ============================================================================
// Lecture des référentiels ClickHouse (plan_compte, ple, plan_tiers,
// code_journal) et modification ligne à ligne.
//
// Le schéma de ces tables varie selon les installations : nom des colonnes
// (ex. `compte_tiers` ou `n_tiers`), casse, colonnes ajoutées après coup et
// restées vides. On ne suppose donc rien :
//   - les colonnes réelles sont lues dans system.columns, sans tenir compte de
//     la casse ;
//   - chaque champ de dimensions.ts a un nom de référence et des variantes ;
//     sa valeur est la PREMIÈRE NON VIDE parmi les colonnes présentes
//     (expression `valeur effective`), utilisée partout : lecture, recherche,
//     filtres, tri, options et identification d'une ligne à modifier ;
//   - les valeurs sont lues sous des alias neutres (__c0, __c1…), jamais sous
//     le nom d'une colonne existante.
// Si une table renvoie des lignes sans aucune valeur exploitable, un
// diagnostic (colonnes réelles, correspondances) est joint à la réponse.
//
// La modification suit exactement les règles du DAG Airflow
// (plugins/clickhouse/dimensions.py) :
//   - les tables sont des ReplacingMergeTree(updated_at) : modifier une ligne,
//     c'est INSÉRER sa nouvelle version (updated_at = now()), qui remplace
//     l'ancienne à la fusion forcée par OPTIMIZE … FINAL ; rien n'est supprimé ;
//   - une ligne identique à l'existante n'est pas réécrite ;
//   - les intitulés recopiés dans grand_livre sont mis à jour pour la même clé,
//     sans jamais écraser une valeur par du vide (_GL_PROPAGATION).
// La clé n'est jamais modifiable. Elle est composite pour le mapping (racine,
// type, longueur de racine, sens du solde).
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
  /** Anomalie de lecture expliquée à l'utilisateur (schéma inattendu). */
  diagnostic?: string;
}

export const TAILLE_PAGE = 50;
/** Borne de l'export complet d'un référentiel. */
export const MAX_EXPORT = 100_000;
/** Borne du nombre de valeurs proposées par filtre. */
const MAX_OPTIONS = 5000;

/** Filtres par colonne : valeurs retenues (OU dans une colonne, ET entre colonnes). */
export type FiltresReferentiel = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Schéma réel
// ---------------------------------------------------------------------------

interface Schema {
  /** Toutes les colonnes réelles, avec leur casse d'origine. */
  reelles: string[];
  /** Champ de référence → colonnes réelles candidates présentes, dans l'ordre de préférence. */
  candidats: Map<string, string[]>;
}

/** Identifiant ClickHouse protégé (casse ou caractères inhabituels). */
const ident = (nom: string) => `\`${nom.replace(/`/g, "")}\``;

async function lireSchema(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
): Promise<Schema> {
  const reelles = [...(await tableColumns(client, dbName, def.table))];
  const parMinuscule = new Map(reelles.map((n) => [n.toLowerCase(), n]));
  const candidats = new Map<string, string[]>();
  for (const c of def.colonnes) {
    const presents = [c.nom, ...(c.alias ?? [])]
      .map((n) => parMinuscule.get(n.toLowerCase()))
      .filter((n): n is string => !!n);
    candidats.set(c.nom, [...new Set(presents)]);
  }
  return { reelles, candidats };
}

/**
 * Valeur effective d'un champ, en texte : la première non vide parmi ses
 * colonnes candidates. `null` si aucune colonne candidate n'existe.
 */
function expression(schema: Schema, nom: string): string | null {
  const cols = schema.candidats.get(nom) ?? [];
  if (cols.length === 0) return null;
  if (cols.length === 1) return `toString(${ident(cols[0])})`;
  const branches = cols.flatMap((c) => [`toString(${ident(c)}) != ''`, `toString(${ident(c)})`]);
  return `multiIf(${branches.join(", ")}, '')`;
}

function diagnosticSchema(def: TableReferentiel, schema: Schema, motif: string): string {
  const correspondances = def.colonnes
    .map((c) => `${c.libelle} → ${(schema.candidats.get(c.nom) ?? []).join(" | ") || "aucune"}`)
    .join(" ; ");
  return (
    `${motif} Table ${def.table} — colonnes réelles : ${schema.reelles.join(", ") || "aucune"}. ` +
    `Correspondances : ${correspondances}.`
  );
}

/**
 * Clause WHERE commune à la liste et au comptage. Les expressions viennent du
 * schéma réel (jamais de la requête) ; les valeurs passent toujours par des
 * paramètres nommés.
 */
function construireWhere(
  def: TableReferentiel,
  schema: Schema,
  search: string,
  filtres: FiltresReferentiel,
): { sql: string; params: Record<string, unknown> } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const exprs = def.colonnes
    .map((c) => ({ c, e: expression(schema, c.nom) }))
    .filter((x): x is { c: ColonneDimension; e: string } => x.e !== null);

  const recherche = search.trim();
  if (recherche && exprs.length) {
    where.push(
      "(" + exprs.map(({ e }) => `positionCaseInsensitive(${e}, {s:String}) > 0`).join(" OR ") + ")",
    );
    params.s = recherche;
  }

  exprs.forEach(({ c, e }, i) => {
    const valeurs = filtres[c.nom] ?? [];
    if (valeurs.length === 0) return;
    where.push(`${e} IN ({f${i}:Array(String)})`);
    params[`f${i}`] = valeurs;
  });

  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
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

  let schema: Schema;
  try {
    schema = await lireSchema(client, dbName, def);
  } catch (e) {
    console.error(`[referentiels] schéma ${dbName}.${def.table} illisible:`, e);
    return vide;
  }
  if (schema.reelles.length === 0) return vide; // table absente : client jamais importé

  const exprCle = expression(schema, colonneCle(def).nom);
  if (!exprCle) {
    return { ...vide, diagnostic: diagnosticSchema(def, schema, "Colonne clé introuvable.") };
  }

  try {
    const { sql: whereSql, params } = construireWhere(def, schema, opts.search || "", opts.filtres || {});
    const tri = expression(schema, opts.sortBy || "") ?? exprCle;
    const sens = opts.sortDir === "desc" ? "DESC" : "ASC";
    const departage = colonnesCles(def)
      .map((c) => expression(schema, c.nom))
      .filter((e): e is string => !!e)
      .map((e) => `${e} ASC`)
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

    // Alias neutres : aucune ambiguïté avec le nom d'une colonne réelle.
    const champs = def.colonnes.map((c, i) => ({ nom: c.nom, alias: `__c${i}`, e: expression(schema, c.nom) }));
    const res = await client.query({
      query: `SELECT ${champs.map((f) => `${f.e ?? "''"} AS ${f.alias}`).join(", ")}
              FROM ${dbName}.${def.table} FINAL
              ${whereSql}
              ORDER BY ${tri} ${sens}, ${departage}
              ${limite}`,
      query_params: params,
      format: "JSONEachRow",
    });
    const brutes = (await res.json()) as Array<Record<string, unknown>>;
    const lignes: LigneDimension[] = brutes.map((b) =>
      Object.fromEntries(
        champs.map((f) => {
          const v = b[f.alias];
          return [f.nom, v === null || v === undefined ? "" : String(v)];
        }),
      ),
    );

    // Des lignes existent mais aucune valeur n'est exploitable : on l'explique
    // au lieu d'afficher un tableau vide sans raison.
    const toutesVides =
      lignes.length > 0 && lignes.every((l) => Object.values(l).every((v) => v === ""));
    if (toutesVides) {
      const premiere = brutes[0] ? Object.keys(brutes[0]).join(", ") : "";
      console.warn(`[referentiels] ${dbName}.${def.table} : lignes sans valeur (clés : ${premiere})`);
    }

    return {
      lignes,
      total,
      page,
      pageSize: opts.tout ? lignes.length : TAILLE_PAGE,
      totalPages,
      ...(toutesVides
        ? { diagnostic: diagnosticSchema(def, schema, "Les lignes existent mais leurs champs sont vides.") }
        : {}),
    };
  } catch (e) {
    console.error(`[referentiels] lecture ${dbName}.${def.table} impossible:`, e);
    return {
      ...vide,
      diagnostic: diagnosticSchema(
        def,
        schema,
        `Lecture impossible (${e instanceof Error ? e.message.slice(0, 300) : String(e)}).`,
      ),
    };
  }
}

/**
 * Valeurs proposées par chaque filtre : les valeurs distinctes de chaque
 * champ, accompagnées du libellé quand le champ en a un (compte → intitulé),
 * comme les filtres du grand livre.
 */
export async function optionsFiltresDimension(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
): Promise<Record<string, OptionFiltre[]>> {
  let schema: Schema;
  try {
    schema = await lireSchema(client, dbName, def);
  } catch {
    return {};
  }

  const entrees = await Promise.all(
    def.colonnes.map(async (c): Promise<[string, OptionFiltre[]]> => {
      const e = expression(schema, c.nom);
      if (!e) return [c.nom, []];
      const lib = c.libelleDe ? expression(schema, c.libelleDe) : null;
      try {
        const res = await client.query({
          query: lib
            ? `SELECT ${e} AS v, anyIf(${lib}, ${lib} != '') AS l
               FROM ${dbName}.${def.table} FINAL
               WHERE ${e} != ''
               GROUP BY v ORDER BY v LIMIT ${MAX_OPTIONS}`
            : `SELECT DISTINCT ${e} AS v
               FROM ${dbName}.${def.table} FINAL
               WHERE ${e} != ''
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

const texte = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Valeur effective d'un champ dans une ligne lue avec SELECT * (noms réels). */
function valeurEffective(schema: Schema, nom: string, ligne: Record<string, unknown>): string {
  for (const col of schema.candidats.get(nom) ?? []) {
    const v = texte(ligne[col]);
    if (v !== "") return v;
  }
  return "";
}

/**
 * Modifie les champs éditables d'une ligne existante, identifiée par
 * l'ensemble de ses champs clés (noms de référence).
 * @throws Error « introuvable » si la ligne n'existe pas dans la table.
 */
export async function modifierDimension(
  client: ClickHouseClient,
  dbName: string,
  def: TableReferentiel,
  cles: Record<string, string>,
  valeurs: Record<string, string>,
): Promise<ResultatModification> {
  const schema = await lireSchema(client, dbName, def);
  const clesPresentes = colonnesCles(def)
    .map((c) => ({ c, e: expression(schema, c.nom) }))
    .filter((x): x is { c: ColonneDimension; e: string } => x.e !== null);
  if (clesPresentes.length === 0) throw new Error("introuvable");
  // Valeur de la clé principale : sert au report dans le grand livre.
  const cle = cles[colonneCle(def).nom] ?? "";

  const where = clesPresentes.map(({ e }, i) => `${e} = {k${i}:String}`).join(" AND ");
  const params = Object.fromEntries(clesPresentes.map(({ c }, i) => [`k${i}`, cles[c.nom] ?? ""]));

  // Ligne complète, types natifs et noms réels : la nouvelle version est
  // réinsérée telle quelle, seuls les champs éditables changent.
  const res = await client.query({
    query: `SELECT * FROM ${dbName}.${def.table} FINAL WHERE ${where} LIMIT 1`,
    query_params: params,
    format: "JSONEachRow",
  });
  const actuelle = ((await res.json()) as Array<Record<string, unknown>>)[0];
  if (!actuelle) throw new Error("introuvable");

  const nouvelle: Record<string, unknown> = { ...actuelle };
  // updated_at prend sa valeur par défaut (now()) : la nouvelle version
  // l'emporte à la fusion sur l'ancienne.
  for (const k of Object.keys(nouvelle)) if (k.toLowerCase() === "updated_at") delete nouvelle[k];

  for (const c of def.colonnes) {
    if (!c.editable || valeurs[c.nom] === undefined) continue;
    const cols = schema.candidats.get(c.nom) ?? [];
    if (cols.length === 0) continue;
    // On écrit dans la colonne qui porte la valeur affichée (la première non
    // vide), sinon dans la colonne de référence.
    const cible = cols.find((col) => texte(actuelle[col]) !== "") ?? cols[0];
    nouvelle[cible] = valeurs[c.nom].trim();
  }

  const avant = Object.fromEntries(def.colonnes.map((c) => [c.nom, valeurEffective(schema, c.nom, actuelle)]));
  const apres = Object.fromEntries(def.colonnes.map((c) => [c.nom, valeurEffective(schema, c.nom, nouvelle)]));
  const modifiee = def.colonnes.some((c) => avant[c.nom] !== apres[c.nom]);
  if (!modifiee) return { ligne: avant, modifiee: false, grandLivre: [] };

  await client.insert({
    table: `${dbName}.${def.table}`,
    values: [nouvelle],
    format: "JSONEachRow",
  });
  await client.command({ query: `OPTIMIZE TABLE ${dbName}.${def.table} FINAL` });

  // Report dans le grand livre des seuls champs recopiés et changés, jamais
  // par une valeur vide (même règle que le DAG).
  const reportees: string[] = [];
  if (def.cleGrandLivre) {
    const gl = await tableColumns(client, dbName, "grand_livre");
    if (gl.has(def.cleGrandLivre)) {
      for (const c of def.colonnes) {
        if (!c.grandLivre || !gl.has(c.grandLivre)) continue;
        const valeur = apres[c.nom];
        if (!valeur || valeur === avant[c.nom]) continue;
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

  return { ligne: apres, modifiee: true, grandLivre: reportees };
}
