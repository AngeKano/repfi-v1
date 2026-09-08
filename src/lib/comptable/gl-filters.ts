// ============================================================================
// Filtres partagés du grand livre (vue « Grand livre » + export Excel).
// Le même contrat de query-params est utilisé par les deux routes afin que le
// bouton « Télécharger » exporte exactement ce que l'utilisateur voit.
//
// Params (tous optionnels, les listes sont répétables → multisélection 1..n) :
//   dateFrom=YYYY-MM-DD  dateTo=YYYY-MM-DD
//   journal=..&journal=..   compte=..   piece=..   tiers=..   facture=..
//   flag=Import (Brut) | Saisie (Utilisateur)
// ============================================================================
import { FLAG_IMPORT, FLAG_SAISIE } from "./saisie-refs";

export interface GlFilters {
  dateFrom: string; // YYYYMMDD (comparable), "" si absent
  dateTo: string;
  journaux: string[];
  comptes: string[];
  pieces: string[];
  tiers: string[];
  factures: string[];
  flags: string[];
}

// "YYYY-MM-DD" → "YYYYMMDD" (format comparable, aligné sur date_transaction).
function toComparable(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((d || "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

export function parseGlFilters(sp: URLSearchParams): GlFilters {
  const list = (k: string) => sp.getAll(k).map((v) => v.trim()).filter((v) => v !== "");
  return {
    dateFrom: toComparable(sp.get("dateFrom") || ""),
    dateTo: toComparable(sp.get("dateTo") || ""),
    journaux: list("journal"),
    comptes: list("compte"),
    pieces: list("piece"),
    tiers: list("tiers"),
    factures: list("facture"),
    flags: list("flag"),
  };
}

export function hasAnyFilter(f: GlFilters): boolean {
  return (
    !!f.dateFrom ||
    !!f.dateTo ||
    f.journaux.length > 0 ||
    f.comptes.length > 0 ||
    f.pieces.length > 0 ||
    f.tiers.length > 0 ||
    f.factures.length > 0 ||
    (f.flags.length > 0 && f.flags.length < 2)
  );
}

// date_transaction est une String "DD/MM/YYYY" → on la rend comparable.
const CH_DATE_SORTABLE =
  "concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2), substring(date_transaction, 1, 2))";

// Construit le fragment SQL (à concaténer après un WHERE existant) + les
// query_params ClickHouse associés. Les valeurs passent TOUJOURS par des
// paramètres nommés (aucune interpolation de valeur utilisateur).
export function buildClickhouseFilter(f: GlFilters): {
  sql: string;
  params: Record<string, unknown>;
} {
  const parts: string[] = [];
  const params: Record<string, unknown> = {};

  if (f.dateFrom) {
    parts.push(`AND ${CH_DATE_SORTABLE} >= {fDateFrom:String}`);
    params.fDateFrom = f.dateFrom;
  }
  if (f.dateTo) {
    parts.push(`AND ${CH_DATE_SORTABLE} <= {fDateTo:String}`);
    params.fDateTo = f.dateTo;
  }
  if (f.journaux.length) {
    parts.push(`AND code_journal IN ({fJournaux:Array(String)})`);
    params.fJournaux = f.journaux;
  }
  if (f.comptes.length) {
    parts.push(`AND compte IN ({fComptes:Array(String)})`);
    params.fComptes = f.comptes;
  }
  if (f.pieces.length) {
    parts.push(`AND numero_piece IN ({fPieces:Array(String)})`);
    params.fPieces = f.pieces;
  }
  if (f.tiers.length) {
    parts.push(`AND n_tiers IN ({fTiers:Array(String)})`);
    params.fTiers = f.tiers;
  }
  if (f.factures.length) {
    parts.push(`AND numero_facture IN ({fFactures:Array(String)})`);
    params.fFactures = f.factures;
  }

  // Flags : dérivés du batch_id (les saisies vivent dans le batch `manual_…`).
  const wantImport = f.flags.includes(FLAG_IMPORT);
  const wantSaisie = f.flags.includes(FLAG_SAISIE);
  if (wantImport && !wantSaisie) parts.push(`AND NOT startsWith(batch_id, 'manual_')`);
  else if (wantSaisie && !wantImport) parts.push(`AND startsWith(batch_id, 'manual_')`);

  return { sql: parts.join("\n            "), params };
}

// Équivalent Prisma pour les lignes saisies (source de vérité Postgres).
// Renvoie null si les filtres excluent totalement les saisies.
export function buildManualWhere(f: GlFilters): Record<string, unknown> | null {
  if (f.flags.length === 1 && f.flags[0] === FLAG_IMPORT) return null;

  const where: Record<string, unknown> = {};
  if (f.dateFrom || f.dateTo) {
    const range: Record<string, Date> = {};
    if (f.dateFrom)
      range.gte = new Date(
        `${f.dateFrom.slice(0, 4)}-${f.dateFrom.slice(4, 6)}-${f.dateFrom.slice(6, 8)}T00:00:00.000Z`,
      );
    if (f.dateTo)
      range.lte = new Date(
        `${f.dateTo.slice(0, 4)}-${f.dateTo.slice(4, 6)}-${f.dateTo.slice(6, 8)}T23:59:59.999Z`,
      );
    where.dateTransaction = range;
  }
  if (f.journaux.length) where.codeJournal = { in: f.journaux };
  if (f.comptes.length) where.compte = { in: f.comptes };
  if (f.pieces.length) where.numeroPiece = { in: f.pieces };
  if (f.tiers.length) where.nTiers = { in: f.tiers };
  if (f.factures.length) where.numeroFacture = { in: f.factures };
  return where;
}
