// ============================================================================
// Invariants de contrôle qualité du reporting (fonctions PURES, sans I/O).
//
// Ces fonctions encodent les règles de réconciliation issues de l'audit
// (docs/audit-reporting.md §3). Elles sont pures → testables unitairement et
// réutilisées par l'endpoint /api/clients/[id]/reporting/qc qui leur fournit
// des agrégats calculés INDÉPENDAMMENT (vérification croisée).
// ============================================================================

export type QcSeverity = "critique" | "moyen" | "mineur";
export type QcStatus = "pass" | "warn" | "fail";

export interface QcCheck {
  id: string;
  label: string;
  severity: QcSeverity;
  status: QcStatus;
  expected: string;
  actual: string;
  ecart?: string;
  detail?: string;
}

const fmt = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString("fr-FR") : String(n);

const pct = (n: number): string =>
  Number.isFinite(n) ? `${n.toFixed(1)}%` : String(n);

// ----------------------------------------------------------------------------
// A1 — Le CA attribué aux clients (Top 10 assujetti) ne doit jamais dépasser
// le CA total HT. Un dépassement = fan-out de jointure (double-comptage).
// ----------------------------------------------------------------------------
export function checkAttributedNotExceedTotal(
  attributed: number,
  total: number,
  tolRatio = 0.005,
): QcCheck {
  const limit = Math.abs(total) * (1 + tolRatio);
  const status: QcStatus = attributed <= limit ? "pass" : "fail";
  const coverage = total !== 0 ? (attributed / total) * 100 : 0;
  return {
    id: "A1-ca-attribue",
    label: "CA attribué aux clients ≤ CA total HT (anti double-comptage)",
    severity: "critique",
    status,
    expected: `≤ ${fmt(total)} (CA total HT)`,
    actual: `${fmt(attributed)} attribué`,
    ecart: status === "fail" ? `+${fmt(attributed - total)}` : undefined,
    detail:
      status === "pass"
        ? `Couverture d'attribution : ${pct(coverage)}`
        : "Dépassement → fan-out de jointure probable (régression A1).",
  };
}

// ----------------------------------------------------------------------------
// Σ des parts d'un Top N bornée à 100 % (+ tolérance).
// ----------------------------------------------------------------------------
export function checkSharesBounded(
  id: string,
  label: string,
  shares: number[],
  tolerance = 1,
): QcCheck {
  const sum = shares.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const status: QcStatus = sum <= 100 + tolerance ? "pass" : "fail";
  return {
    id,
    label,
    severity: "moyen",
    status,
    expected: "Σ parts ≤ 100%",
    actual: pct(sum),
    ecart: status === "fail" ? `+${pct(sum - 100)}` : undefined,
  };
}

// ----------------------------------------------------------------------------
// Un taux (recouvrement, remboursement…) doit rester dans [0 ; 100].
// Au-delà → trop-perçu / anomalie (warn), valeur absurde → fail.
// ----------------------------------------------------------------------------
export function checkRateBounded(
  id: string,
  label: string,
  rate: number,
  warnAbove = 100,
  failAbove = 150,
): QcCheck {
  let status: QcStatus = "pass";
  if (!Number.isFinite(rate) || rate < -0.01 || rate > failAbove) status = "fail";
  else if (rate > warnAbove) status = "warn";
  return {
    id,
    label,
    severity: "moyen",
    status,
    expected: `0% ≤ taux ≤ ${warnAbove}%`,
    actual: pct(rate),
    detail:
      status === "warn"
        ? "Taux > 100% : trop-perçu ou encaissements d'exercices antérieurs."
        : status === "fail"
          ? "Taux hors plage plausible."
          : undefined,
  };
}

// ----------------------------------------------------------------------------
// Égalité comptable attendue (ex: solde = débit − crédit) à une tolérance près.
// ----------------------------------------------------------------------------
export function checkIdentity(
  id: string,
  label: string,
  left: number,
  right: number,
  severity: QcSeverity = "moyen",
  tolerance = 1,
): QcCheck {
  const ecart = left - right;
  const status: QcStatus = Math.abs(ecart) <= tolerance ? "pass" : "fail";
  return {
    id,
    label,
    severity,
    status,
    expected: `${fmt(left)} == ${fmt(right)}`,
    actual: `écart ${fmt(ecart)}`,
    ecart: status === "fail" ? fmt(ecart) : undefined,
  };
}

// ----------------------------------------------------------------------------
// Aucun code (compte ou n_tiers) ne doit commencer par un préfixe interdit
// (418/419 pour les calculs clients).
// ----------------------------------------------------------------------------
export function checkNoForbiddenPrefix(
  id: string,
  label: string,
  codes: string[],
  prefixes: string[],
): QcCheck {
  const offenders = codes.filter((c) =>
    prefixes.some((p) => (c ?? "").startsWith(p)),
  );
  const status: QcStatus = offenders.length === 0 ? "pass" : "fail";
  return {
    id,
    label,
    severity: "critique",
    status,
    expected: `0 code commençant par ${prefixes.join("/")}`,
    actual: `${offenders.length} trouvé(s)`,
    detail: offenders.length ? offenders.slice(0, 5).join(", ") : undefined,
  };
}

// ----------------------------------------------------------------------------
// A10 — Les écritures de l'exercice N ne doivent contenir qu'une seule année
// (sinon mélange N / N-1 via batchIds mal bornés).
// ----------------------------------------------------------------------------
export function checkSingleExercise(
  years: string[],
  expectedYear: string,
): QcCheck {
  const distinct = Array.from(new Set(years.filter(Boolean)));
  const unexpected = distinct.filter((y) => y !== expectedYear);
  const status: QcStatus = unexpected.length === 0 ? "pass" : "warn";
  return {
    id: "A10-exercice-unique",
    label: "Les batchs de l'exercice N ne contiennent que l'année N",
    severity: "moyen",
    status,
    expected: `seulement ${expectedYear}`,
    actual: distinct.length ? distinct.sort().join(", ") : "aucune écriture",
    detail:
      status === "warn"
        ? `Années étrangères détectées : ${unexpected.join(", ")} → risque de mélange d'exercices.`
        : undefined,
  };
}

// ----------------------------------------------------------------------------
// Synthèse d'un lot de contrôles.
// ----------------------------------------------------------------------------
export interface QcSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  ok: boolean; // aucun fail
}

export function summarize(checks: QcCheck[]): QcSummary {
  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  return { total: checks.length, pass, warn, fail, ok: fail === 0 };
}
