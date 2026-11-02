// ============================================================================
// Période comptable d'une ligne du grand livre et mois couverts par un
// reporting importé. Partagé par les API de reporting.
//
// date_transaction est une String « JJ/MM/AAAA ». Les à-nouveaux (journaux RAN
// et AN, comme dans Airflow) sont acceptés à l'import même hors période : un
// à-nouveau daté du 31/12 de l'exercice précédent ouvre l'exercice. Il compte
// donc en JANVIER (1er janvier), jamais en décembre — sinon le solde
// d'ouverture n'apparaîtrait qu'au dernier mois.
// ============================================================================

/** La ligne appartient à un journal d'à-nouveaux (RAN, AN). */
export const A_NOUVEAU_SQL = "upper(trim(code_journal)) IN ('RAN', 'AN')";

const RAN_DE_DECEMBRE = `(${A_NOUVEAU_SQL} AND substring(date_transaction, 4, 2) = '12')`;

/** Mois « MM » d'une ligne (à-nouveau de décembre : janvier). */
export const MOIS_SQL = `if(${RAN_DE_DECEMBRE}, '01', substring(date_transaction, 4, 2))`;

/** Jour « JJ » d'une ligne (à-nouveau de décembre : le 1er). */
export const JOUR_SQL = `if(${RAN_DE_DECEMBRE}, '01', substring(date_transaction, 1, 2))`;

/** Période « AAAAMM » (à-nouveau de décembre : janvier de l'année suivante). */
export const YM_SQL =
  `if(${RAN_DE_DECEMBRE}, ` +
  `concat(toString(toInt32OrZero(substring(date_transaction, 7, 4)) + 1), '01'), ` +
  `concat(substring(date_transaction, 7, 4), substring(date_transaction, 4, 2)))`;

/**
 * Mois « 01 » … « 12 » couverts par les périodes importées (du début à la fin
 * saisis à l'import), triés. Seuls ces mois se proposent dans le filtre ; la
 * fenêtre « Année » s'arrête au dernier. Les dates sont lues en UTC, comme
 * elles sont enregistrées (« AAAA-MM-JJ » à minuit UTC).
 */
export function moisCouverts(periodes: { periodStart: Date; periodEnd: Date }[]): string[] {
  const mois = new Set<number>();
  for (const p of periodes) {
    let a = p.periodStart.getUTCFullYear();
    let m = p.periodStart.getUTCMonth() + 1;
    const aFin = p.periodEnd.getUTCFullYear();
    const mFin = p.periodEnd.getUTCMonth() + 1;
    // Au plus 12 mois : le grand livre regroupe par numéro de mois.
    for (let i = 0; i < 12 && (a < aFin || (a === aFin && m <= mFin)); i++) {
      mois.add(m);
      m += 1;
      if (m > 12) {
        m = 1;
        a += 1;
      }
    }
  }
  return [...mois].sort((x, y) => x - y).map((x) => String(x).padStart(2, "0"));
}
