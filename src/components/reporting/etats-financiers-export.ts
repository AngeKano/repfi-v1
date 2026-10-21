// ============================================================================
// Export des États Financiers (Bilan + Compte de résultat) en Excel ou PDF.
//
// L'export se fait côté navigateur, à partir des données déjà chargées. À la
// différence de l'écran (qui montre un mois à la fois), il contient TOUS les
// mois de janvier au mois sélectionné, suivis du cumul N et du cumul N-1.
//
// La mise en forme reproduit celle de l'écran : en-tête sur deux niveaux,
// grille complète, lignes de total en gras sur fond gris, montants alignés à
// droite et montant nul laissé vide hors lignes de total.
// ============================================================================
import { DEVISE } from "@/lib/devise";

export interface MoisExport {
  ym: string;
  label: string;
}
export interface CumulExport {
  label: string;
  dateFin: string;
}
export interface LigneActifExport {
  ref: string;
  libelle: string;
  total: boolean;
  mois: number[];
  brut: number;
  amort: number;
  net: number;
  netN1: number;
}
export interface LignePassifExport {
  ref: string;
  libelle: string;
  total: boolean;
  mois: number[];
  cumul: number;
  cumulN1: number;
}
export interface LigneResultatExport extends LignePassifExport {
  sens: string | null;
  repere: string | null;
}

export interface EtatsExportData {
  clientName: string;
  periodeLabel: string;
  yearN: number;
  mois: MoisExport[];
  cumulN: CumulExport;
  cumulN1: CumulExport | null;
  actif: LigneActifExport[];
  passif: LignePassifExport[];
  resultat: LigneResultatExport[];
}

// ---------------------------------------------------------------------------
// Modèle de tableau commun aux deux formats.
// ---------------------------------------------------------------------------

/** Cellule d'en-tête, avec fusion horizontale et verticale comme en HTML. */
interface CelluleEntete {
  texte: string[];
  colSpan?: number;
  rowSpan?: number;
}

interface LigneTableau {
  ref: string;
  libelle: string;
  /** Suffixe affiché après le libellé (repère et sens du compte de résultat). */
  annotation?: string;
  montants: number[];
  total: boolean;
}

interface Tableau {
  titre: string;
  /** Intitulé de la colonne des libellés : ACTIF, PASSIF ou LIBELLES. */
  colLibelle: string;
  /**
   * Deux lignes d'en-tête. La première contient REF et le libellé (fusionnés
   * sur deux niveaux) puis les regroupements ; la seconde, une cellule par
   * colonne de montant.
   */
  entetes: CelluleEntete[][];
  /** Intitulé « à plat » d'une colonne de montant, pour Excel. */
  colonnesMontant: string[];
  lignes: LigneTableau[];
  note?: string;
}

const arrondi = (n: number) => Math.round(n || 0);

/**
 * Groupe les milliers d'un entier avec une espace simple : « 2 218 101 ».
 *
 * Volontairement sans toLocaleString : selon le navigateur, le séparateur
 * français est une espace fine insécable (U+202F) ou insécable (U+00A0), que
 * les polices standard de jsPDF ne savent pas dessiner — elle sortait en « / »
 * (« 541/176/746 »). Ici, uniquement des caractères ASCII.
 */
function grouperMilliers(n: number): string {
  const entier = Math.round(n);
  const chiffres = Math.abs(entier).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return entier < 0 ? `-${chiffres}` : chiffres;
}

/**
 * Montant tel qu'affiché à l'écran : milliers séparés, et rien du tout quand
 * la valeur est nulle sur une ligne de détail (« 0 » sur une ligne de total).
 */
function montantTexte(n: number, total: boolean): string {
  if (!Math.round(n || 0)) return total ? "0" : "";
  return grouperMilliers(n);
}

/** Nom de fichier sans caractère gênant pour le système. */
function nomFichier(d: EtatsExportData, ext: string): string {
  const client = d.clientName.replace(/[^a-zA-Z0-9]/g, "_");
  const fin = d.mois[d.mois.length - 1]?.ym ?? String(d.yearN);
  return `ETATS_FINANCIERS_${client}_${fin}.${ext}`;
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Construction des trois tableaux.
// ---------------------------------------------------------------------------

/** Regroupement « Mois (périodique) » au-dessus des colonnes mensuelles. */
function enteteMois(d: EtatsExportData, sousTitre: string) {
  return {
    groupe: { texte: ["MOIS (PÉRIODIQUE)"], colSpan: d.mois.length },
    detail: d.mois.map((m) => ({ texte: [m.label.toUpperCase(), sousTitre] })),
  };
}

/**
 * ACTIF : NET de chaque mois, puis BRUT / AMORT. / NET du cumul N, puis NET du
 * cumul N-1.
 */
function tableauActif(d: EtatsExportData): Tableau {
  const m = enteteMois(d, "NET");
  return {
    titre: "BILAN — ACTIF",
    colLibelle: "ACTIF",
    entetes: [
      [
        { texte: ["REF"], rowSpan: 2 },
        { texte: ["ACTIF"], rowSpan: 2 },
        m.groupe,
        { texte: [`CUMUL ${d.cumulN.label.toUpperCase()}`], colSpan: 3 },
        ...(d.cumulN1 ? [{ texte: [`CUMUL ${d.cumulN1.label.toUpperCase()}`] }] : []),
      ],
      [
        ...m.detail,
        { texte: ["BRUT"] },
        { texte: ["AMORT. et", "DEPREC."] },
        { texte: ["NET"] },
        ...(d.cumulN1 ? [{ texte: ["NET"] }] : []),
      ],
    ],
    colonnesMontant: [
      ...d.mois.map((x) => `NET ${x.label}`),
      `BRUT cumul ${d.cumulN.label}`,
      `AMORT. et DEPREC. cumul ${d.cumulN.label}`,
      `NET cumul ${d.cumulN.label}`,
      ...(d.cumulN1 ? [`NET cumul ${d.cumulN1.label}`] : []),
    ],
    lignes: d.actif.map((l) => ({
      ref: l.ref,
      libelle: l.libelle,
      total: l.total,
      montants: [
        ...d.mois.map((_, i) => arrondi(l.mois[i] ?? 0)),
        arrondi(l.brut),
        arrondi(l.amort),
        arrondi(l.net),
        ...(d.cumulN1 ? [arrondi(l.netN1)] : []),
      ],
    })),
  };
}

/** PASSIF / RÉSULTAT : chaque mois, puis le cumul N et le cumul N-1. */
function tableauSimple(
  d: EtatsExportData,
  titre: string,
  colLibelle: string,
  sousTitre: string,
  lignes: LigneTableau[],
  note?: string,
): Tableau {
  const m = enteteMois(d, sousTitre);
  return {
    titre,
    colLibelle,
    entetes: [
      [
        { texte: ["REF"], rowSpan: 2 },
        { texte: [colLibelle], rowSpan: 2 },
        m.groupe,
        { texte: [`CUMUL ${d.cumulN.label.toUpperCase()}`] },
        ...(d.cumulN1 ? [{ texte: [`CUMUL ${d.cumulN1.label.toUpperCase()}`] }] : []),
      ],
      [
        ...m.detail,
        { texte: [sousTitre] },
        ...(d.cumulN1 ? [{ texte: [sousTitre] }] : []),
      ],
    ],
    colonnesMontant: [
      ...d.mois.map((x) => x.label),
      `Cumul ${d.cumulN.label}`,
      ...(d.cumulN1 ? [`Cumul ${d.cumulN1.label}`] : []),
    ],
    lignes,
    note,
  };
}

function montantsSimples(d: EtatsExportData, l: LignePassifExport): number[] {
  return [
    ...d.mois.map((_, i) => arrondi(l.mois[i] ?? 0)),
    arrondi(l.cumul),
    ...(d.cumulN1 ? [arrondi(l.cumulN1)] : []),
  ];
}

function tableauPassif(d: EtatsExportData): Tableau {
  return tableauSimple(
    d,
    "BILAN — PASSIF",
    "PASSIF",
    "NET",
    d.passif.map((l) => ({
      ref: l.ref,
      libelle: l.libelle,
      total: l.total,
      montants: montantsSimples(d, l),
    })),
  );
}

function tableauResultat(d: EtatsExportData): Tableau {
  return tableauSimple(
    d,
    "COMPTE DE RÉSULTAT",
    "LIBELLES",
    "NET (1)",
    d.resultat.map((l) => ({
      ref: l.ref,
      libelle: l.libelle,
      annotation: [l.repere ? `(${l.repere})` : "", !l.total ? l.sens ?? "" : ""]
        .filter(Boolean)
        .join(" "),
      total: l.total,
      montants: montantsSimples(d, l),
    })),
    "(1) Les montants sont précédés du signe (+) ou (−) en fonction de leurs soldes dans la " +
      "balance générale. (2) Les signes affichés à côté des libellés indiquent le sens structurel " +
      "des soldes ; ils ne jouent pas le rôle de signes opérateurs. Les colonnes mensuelles sont " +
      "calculées en périodique (mouvements du mois) ; le cumul N est leur somme.",
  );
}

function tousLesTableaux(d: EtatsExportData): Tableau[] {
  return [tableauActif(d), tableauPassif(d), tableauResultat(d)];
}

// ---------------------------------------------------------------------------
// Excel : un onglet par état, en-tête sur deux lignes fusionnées.
// ---------------------------------------------------------------------------
export async function exporterEtatsExcel(d: EtatsExportData) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (const [t, nomOnglet] of [
    [tableauActif(d), "Bilan Actif"],
    [tableauPassif(d), "Bilan Passif"],
    [tableauResultat(d), "Compte de Résultat"],
  ] as const) {
    const nbMontants = t.colonnesMontant.length;
    const largeur = 2 + nbMontants;

    // Lignes 1-3 : titre, contexte, séparateur. Lignes 4-5 : en-tête.
    const aoa: (string | number | null)[][] = [
      [t.titre],
      [`${d.clientName} — Période : ${d.periodeLabel} — Montants en ${DEVISE}`],
      [],
    ];

    // En-tête : première ligne reprend les regroupements, la seconde le détail.
    const ligne1: (string | null)[] = Array(largeur).fill(null);
    const ligne2: (string | null)[] = Array(largeur).fill(null);
    ligne1[0] = "REF";
    ligne1[1] = t.colLibelle;
    const premiereEntete = t.entetes[0].slice(2);
    let col = 2;
    for (const cel of premiereEntete) {
      ligne1[col] = cel.texte.join(" ");
      col += cel.colSpan ?? 1;
    }
    t.entetes[1].forEach((cel, i) => {
      ligne2[2 + i] = cel.texte.join(" ");
    });
    aoa.push(ligne1, ligne2);

    const premiereLigneDonnees = aoa.length; // index 0-based de la 1re donnée
    for (const l of t.lignes) {
      aoa.push([
        l.ref,
        l.annotation ? `${l.libelle} ${l.annotation}` : l.libelle,
        // Montant nul laissé vide hors total, comme à l'écran.
        ...l.montants.map((m) => (m === 0 && !l.total ? null : m)),
      ]);
    }
    if (t.note) aoa.push([], [t.note]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Fusions : REF et le libellé couvrent les deux lignes d'en-tête ; chaque
    // regroupement couvre ses colonnes de détail.
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
      { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
      { s: { r: 0, c: 0 }, e: { r: 0, c: largeur - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: largeur - 1 } },
    ];
    col = 2;
    for (const cel of premiereEntete) {
      const span = cel.colSpan ?? 1;
      if (span > 1) merges.push({ s: { r: 3, c: col }, e: { r: 3, c: col + span - 1 } });
      col += span;
    }
    ws["!merges"] = merges;

    // REF et libellé figés à gauche, en-tête figé en haut, comme à l'écran.
    ws["!cols"] = [{ wch: 6 }, { wch: 52 }, ...t.colonnesMontant.map(() => ({ wch: 18 }))];
    (ws as Record<string, unknown>)["!views"] = [
      { state: "frozen", xSplit: 2, ySplit: premiereLigneDonnees },
    ];

    // Format des montants : séparateur de milliers, sans décimale.
    for (let r = premiereLigneDonnees; r < premiereLigneDonnees + t.lignes.length; r++) {
      for (let c = 2; c < largeur; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = ws[ref] as { t?: string; z?: string } | undefined;
        if (cell && cell.t === "n") cell.z = "#,##0";
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, nomOnglet);
  }

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  telecharger(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nomFichier(d, "xlsx"),
  );
}

// ---------------------------------------------------------------------------
// PDF : reproduction de la grille affichée à l'écran, avec tous les mois.
// ---------------------------------------------------------------------------
export async function exporterEtatsPdf(d: EtatsExportData) {
  const { jsPDF } = await import("jspdf");

  // Le nombre de colonnes dépend du mois sélectionné (jusqu'à 12 mois + 4
  // cumuls à l'actif) : au-delà de 8 colonnes de montant, l'A4 paysage ne
  // laisse plus la place aux grands montants — on passe en A3 paysage.
  const maxMontants = Math.max(...tousLesTableaux(d).map((t) => t.colonnesMontant.length));
  const grand = maxMontants > 8;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: grand ? "a3" : "a4" });

  const LARGEUR_PAGE = pdf.internal.pageSize.getWidth();
  const HAUTEUR_PAGE = pdf.internal.pageSize.getHeight();
  const MARGE = 10;
  const H_LIGNE = 5;
  const H_ENTETE = 7;
  const L_REF = 12;
  const L_LIBELLE_MIN = 70;
  const L_MONTANT_MAX = 32;
  const TAILLE_TEXTE = grand ? 6.6 : 7;

  // Gris de l'écran : en-tête #EDEDED, lignes de total #F2F2F2, filets #9AA9BC.
  const GRIS_ENTETE: [number, number, number] = [237, 237, 237];
  const GRIS_TOTAL: [number, number, number] = [242, 242, 242];
  const FILET: [number, number, number] = [154, 169, 188];

  const dessiner = (t: Tableau, premierePage: boolean) => {
    if (!premierePage) pdf.addPage();

    const nbMontants = t.colonnesMontant.length;
    const largeurTable = LARGEUR_PAGE - 2 * MARGE;
    const lMontant = Math.min(
      L_MONTANT_MAX,
      (largeurTable - L_REF - L_LIBELLE_MIN) / Math.max(nbMontants, 1),
    );
    const lLibelle = largeurTable - L_REF - nbMontants * lMontant;
    const largeurs = [L_REF, lLibelle, ...Array<number>(nbMontants).fill(lMontant)];
    const x0 = MARGE;
    const xs: number[] = [];
    let curseur = x0;
    for (const w of largeurs) {
      xs.push(curseur);
      curseur += w;
    }

    let y = MARGE + 6;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(0, 18, 46);
    pdf.text(t.titre, MARGE, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`${d.clientName} — Période : ${d.periodeLabel}`, MARGE, y);
    // Devise de l'application, rappelée en haut à droite de chaque état.
    pdf.setFont("helvetica", "bold");
    pdf.text(`Montants en ${DEVISE}`, LARGEUR_PAGE - MARGE, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0);
    y += 5;

    // ---- En-tête sur deux niveaux, identique à l'écran ----
    const dessinerEntete = () => {
      const hTotal = 2 * H_ENTETE;
      pdf.setFillColor(...GRIS_ENTETE);
      pdf.rect(x0, y, largeurTable, hTotal, "F");
      pdf.setDrawColor(...FILET);
      pdf.setLineWidth(0.15);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(grand ? 6 : 6.4);

      const cellule = (
        texte: string[],
        xDebut: number,
        xFin: number,
        yDebut: number,
        yFin: number,
      ) => {
        pdf.rect(xDebut, yDebut, xFin - xDebut, yFin - yDebut);
        // Un intitulé trop long pour sa colonne passe sur plusieurs lignes.
        const lignes = texte.flatMap((l) => pdf.splitTextToSize(l, xFin - xDebut - 1.5) as string[]);
        const milieuY = (yDebut + yFin) / 2;
        const depart = milieuY - ((lignes.length - 1) * 2.3) / 2 + 0.9;
        lignes.forEach((ligne, i) => {
          pdf.text(ligne, (xDebut + xFin) / 2, depart + i * 2.3, { align: "center" });
        });
      };

      // Première ligne : REF et le libellé couvrent les deux niveaux.
      let col = 0;
      for (const cel of t.entetes[0]) {
        const span = cel.colSpan ?? 1;
        const xDebut = xs[col];
        const xFin = xs[col] + largeurs.slice(col, col + span).reduce((a, b) => a + b, 0);
        const yFin = y + (cel.rowSpan === 2 ? hTotal : H_ENTETE);
        cellule(cel.texte, xDebut, xFin, y, yFin);
        col += span;
      }
      // Seconde ligne : une cellule par colonne de montant.
      col = 2;
      for (const cel of t.entetes[1]) {
        cellule(cel.texte, xs[col], xs[col] + largeurs[col], y + H_ENTETE, y + hTotal);
        col += 1;
      }
      y += hTotal;
    };

    dessinerEntete();

    // ---- Corps ----
    pdf.setFontSize(TAILLE_TEXTE);
    for (const l of t.lignes) {
      if (y + H_LIGNE > HAUTEUR_PAGE - MARGE - 4) {
        pdf.addPage();
        y = MARGE + 4;
        dessinerEntete();
        pdf.setFontSize(TAILLE_TEXTE);
      }

      if (l.total) {
        pdf.setFillColor(...GRIS_TOTAL);
        pdf.rect(x0, y, largeurTable, H_LIGNE, "F");
      }
      pdf.setDrawColor(...FILET);
      pdf.setLineWidth(0.15);
      largeurs.forEach((w, i) => pdf.rect(xs[i], y, w, H_LIGNE));

      pdf.setFont("helvetica", l.total ? "bold" : "normal");
      const base = y + H_LIGNE / 2 + 1;

      pdf.text(l.ref, xs[0] + largeurs[0] / 2, base, { align: "center" });

      const libelle = l.annotation ? `${l.libelle}  ${l.annotation}` : l.libelle;
      const coupe = pdf.splitTextToSize(libelle, largeurs[1] - 3) as string[];
      pdf.text(coupe[0] ?? libelle, xs[1] + 1.5, base);

      l.montants.forEach((m, i) => {
        pdf.text(montantTexte(m, l.total), xs[2 + i] + largeurs[2 + i] - 1.2, base, {
          align: "right",
        });
      });

      y += H_LIGNE;
    }

    if (t.note) {
      y += 4;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.setTextColor(120);
      for (const ligne of pdf.splitTextToSize(t.note, largeurTable) as string[]) {
        if (y > HAUTEUR_PAGE - MARGE) break;
        pdf.text(ligne, MARGE, y);
        y += 3;
      }
      pdf.setTextColor(0);
    }
  };

  tousLesTableaux(d).forEach((t, i) => dessiner(t, i === 0));

  // Pied de page : client, devise et numéro de page sur toutes les pages.
  const nbPages = pdf.getNumberOfPages();
  for (let i = 1; i <= nbPages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(120);
    pdf.text(`${d.clientName} — États financiers en ${DEVISE}`, MARGE, HAUTEUR_PAGE - 5);
    pdf.text(`Page ${i} / ${nbPages}`, LARGEUR_PAGE - MARGE, HAUTEUR_PAGE - 5, { align: "right" });
  }
  pdf.setTextColor(0);

  telecharger(pdf.output("blob"), nomFichier(d, "pdf"));
}
