// ============================================================================
// Mapping `ple` (racine de compte → rubrique) appliqué côté web.
//
// Les écritures SAISIES ne passent pas par l'ETL : leur rubrique doit être
// calculée ici, avec exactement la même règle qu'Airflow
// (plugins/clickhouse/ple.py, PleIndex.classify) :
//   - classes 6/7/8 → rubrique de type PL, classes 1 à 5 → type BILAN ;
//   - racine la plus longue d'abord (longueurs réellement présentes en table) ;
//   - à longueur égale, ordre '' < 'credit' < 'debit' (clé de tri) ;
//   - exclusions : racines écartées (ex. BI = « 41 » sauf « 419 ») ;
//   - solde_filter : 'debit' ignoré si le solde est créditeur, 'credit' ignoré
//     s'il est débiteur (comptes mixtes : 52 en BS si débiteur, en DQ sinon).
// Le solde retenu est celui du compte sur le lot, arrondi au centime.
//
// La table est lue à chaque appel (quelques centaines de lignes) : une
// modification du mapping depuis l'interface s'applique immédiatement.
// ============================================================================
import type { ClickHouseClient } from "@clickhouse/client";

type TypeRubrique = "PL" | "BILAN";

interface Regle {
  soldeFilter: string;
  rubrique: string;
  exclusions: string[];
}

export interface PleIndex {
  /** type → longueur de racine → racine → règles triées. */
  index: Map<string, Map<number, Map<string, Regle[]>>>;
  /** type → longueurs présentes, de la plus longue à la plus courte. */
  longueurs: Map<string, number[]>;
  taille: number;
}

const CLASSES_PL = ["6", "7", "8"];
const CLASSES_BILAN = ["1", "2", "3", "4", "5"];

export const estClassePL = (compte: string) => CLASSES_PL.some((c) => compte.trim().startsWith(c));
export const estClasseBilan = (compte: string) =>
  CLASSES_BILAN.some((c) => compte.trim().startsWith(c));

/** Solde signé retenu pour le classement (> 0 débiteur), arrondi au centime. */
export const soldeSigne = (debitMoinsCredit: number) => Math.round(debitMoinsCredit * 100) / 100;

/** Charge le mapping d'un client. `null` si la table est absente ou illisible. */
export async function chargerPle(client: ClickHouseClient, dbName: string): Promise<PleIndex | null> {
  let rows: Array<{
    racine: string;
    rubrique: string;
    nb_racine: number | string;
    type_rubrique: string;
    solde_filter: string;
    exclusions: string;
  }>;
  try {
    const res = await client.query({
      query: `SELECT racine, rubrique, nb_racine, type_rubrique, solde_filter, exclusions
              FROM ${dbName}.ple FINAL`,
      format: "JSONEachRow",
    });
    rows = await res.json();
  } catch (e) {
    console.warn(`[ple] mapping indisponible (${dbName}):`, e);
    return null;
  }

  const index: PleIndex["index"] = new Map();
  let taille = 0;
  for (const r of rows) {
    const racine = (r.racine || "").trim();
    if (!racine) continue;
    const nb = Number(r.nb_racine) || racine.length;
    const parNb = index.get(r.type_rubrique) ?? new Map<number, Map<string, Regle[]>>();
    index.set(r.type_rubrique, parNb);
    const parRacine = parNb.get(nb) ?? new Map<string, Regle[]>();
    parNb.set(nb, parRacine);
    const regles = parRacine.get(racine) ?? [];
    parRacine.set(racine, regles);
    regles.push({
      soldeFilter: r.solde_filter || "",
      rubrique: (r.rubrique || "").trim().toUpperCase(),
      exclusions: (r.exclusions || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
    });
    taille++;
  }
  // Même ordre que la lecture ClickHouse côté Airflow : '' < 'credit' < 'debit'.
  for (const parNb of index.values())
    for (const parRacine of parNb.values())
      for (const regles of parRacine.values())
        regles.sort((a, b) => (a.soldeFilter < b.soldeFilter ? -1 : a.soldeFilter > b.soldeFilter ? 1 : 0));

  const longueurs = new Map<string, number[]>();
  for (const [type, parNb] of index) longueurs.set(type, [...parNb.keys()].sort((a, b) => b - a));
  return { index, longueurs, taille };
}

function rechercher(ple: PleIndex, compte: string, type: TypeRubrique, solde: number): string {
  const parNb = ple.index.get(type);
  if (!compte || !parNb) return "";
  for (const nb of ple.longueurs.get(type) ?? []) {
    if (nb > compte.length) continue;
    for (const r of parNb.get(nb)?.get(compte.slice(0, nb)) ?? []) {
      if (r.exclusions.some((e) => compte.startsWith(e))) continue;
      if (r.soldeFilter === "debit" && solde < 0) continue;
      if (r.soldeFilter === "credit" && solde > 0) continue;
      return r.rubrique;
    }
  }
  return "";
}

/**
 * Rubrique d'un compte, comme Airflow : `pl` pour les classes 6/7/8, `bilan`
 * pour les classes 1 à 5 (l'autre reste vide). `solde` = débit − crédit.
 */
export function classerCompte(
  ple: PleIndex,
  compte: string,
  solde: number,
): { pl: string; bilan: string } {
  const c = (compte || "").trim();
  const s = soldeSigne(solde);
  if (estClassePL(c)) return { pl: rechercher(ple, c, "PL", s), bilan: "" };
  if (estClasseBilan(c)) return { pl: "", bilan: rechercher(ple, c, "BILAN", s) };
  return { pl: "", bilan: "" };
}
