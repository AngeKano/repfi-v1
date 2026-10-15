// ============================================================================
// Export des États Financiers (Bilan + Compte de résultat) en Excel ou PDF.
//
// L'export se fait côté navigateur, à partir des données déjà affichées : ce
// qui est téléchargé correspond exactement à ce que l'utilisateur voit, mêmes
// filtres et mêmes exercices comparés.
//
// La mise en forme reproduit celle de l'écran : en-tête sur deux niveaux
// (EXERCICE au … / BRUT · AMORT. et DEPREC. · NET), grille complète, lignes de
// total en gras sur fond gris, montants alignés à droite et montant nul laissé
// vide hors lignes de total.
// ============================================================================

export interface ExerciceExport {
  year: number;
  label: string;
}
export interface LigneActifExport {
  ref: string;
  libelle: string;
  total: boolean;
  bruts: number[];
  amorts: number[];
  nets: number[];
}
export interface LignePassifExport {
  ref: string;
  libelle: string;
  total: boolean;
  nets: number[];
}
export interface LigneResultatExport {
  ref: string;
  libelle: string;
  total: boolean;
  sens: string | null;
  repere: string | null;
  montants: number[];
}

export interface EtatsExportData {
  clientName: string;
  periodeLabel: string;
  /** Exercices affichés, dans l'ordre des colonnes. */
  exercices: ExerciceExport[];
  /** Décalage des exercices visibles dans les tableaux de montants. */
  offset: number;
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
  /** Deux lignes d'en-tête, à l'identique de l'écran. */
  entetes: CelluleEntete[][];
  /** Intitulé « à plat » d'une colonne de montant, pour Excel. */
  colonnesMontant: string[];
  lignes: LigneTableau[];
  note?: string;
}

const arrondi = (n: number) => Math.round(n || 0);

/**
 * Montant tel qu'affiché à l'écran : séparateur de milliers français, et rien
 * du tout quand la valeur est nulle sur une ligne de détail.
 *
 * `toLocaleString` produit une espace fine insécable (U+202F) que les polices
 * standard de jsPDF ne savent pas rendre — elle y apparaît comme un « / ». On
 * la remplace donc par une espace ordinaire.
 */
function montantTexte(n: number, total: boolean): string {
  if (!n) return total ? "0" : "";
  return Math.round(n)
    .toLocaleString("fr-FR")
    .replace(/[  ]/g, " ");
}

/** Nom de fichier sans caractère gênant pour le système. */
function nomFichier(d: EtatsExportData, ext: string): string {
  const client = d.clientName.replace(/[^a-zA-Z0-9]/g, "_");
  const exercices = d.exercices.map((e) => e.year).join("-");
  return `ETATS_FINANCIERS_${client}_${exercices}.${ext}`;
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

/** ACTIF : BRUT / AMORT. / NET sur le premier exercice, NET sur les suivants. */
function tableauActif(d: EtatsExportData): Tableau {
  const [premier, ...autres] = d.exercices;
  return {
    titre: "BILAN — ACTIF",
    colLibelle: "ACTIF",
    entetes: [
      [
        { texte: ["REF"], rowSpan: 2 },
        { texte: ["ACTIF"], rowSpan: 2 },
        { texte: [`EXERCICE au ${premier?.label ?? "—"}`], colSpan: 3 },
        ...autres.map((e) => ({ texte: ["EXERCICE AU", e.label] })),
      ],
      [
        { texte: ["BRUT"] },
        { texte: ["AMORT. et", "DEPREC."] },
        { texte: ["NET"] },
        ...autres.map(() => ({ texte: ["NET"] })),
      ],
    ],
    colonnesMontant: [
      `BRUT au ${premier?.label ?? "—"}`,
      `AMORT. et DEPREC. au ${premier?.label ?? "—"}`,
      `NET au ${premier?.label ?? "—"}`,
      ...autres.map((e) => `NET au ${e.label}`),
    ],
    lignes: d.actif.map((l) => ({
      ref: l.ref,
      libelle: l.libelle,
      total: l.total,
      montants: [
        arrondi(l.bruts[d.offset] ?? 0),
        arrondi(l.amorts[d.offset] ?? 0),
        arrondi(l.nets[d.offset] ?? 0),
        ...autres.map((_, i) => arrondi(l.nets[d.offset + 1 + i] ?? 0)),
      ],
    })),
  };
}

/** PASSIF : une colonne NET par exercice. */
function tableauPassif(d: EtatsExportData): Tableau {
  return {
    titre: "BILAN — PASSIF",
    colLibelle: "PASSIF",
    entetes: [
      [
        { texte: ["REF"], rowSpan: 2 },
        { texte: ["PASSIF"], rowSpan: 2 },
        ...d.exercices.map((e) => ({ texte: ["EXERCICE AU", e.label] })),
      ],
      [...d.exercices.map(() => ({ texte: ["NET"] }))],
    ],
    colonnesMontant: d.exercices.map((e) => `NET au ${e.label}`),
    lignes: d.passif.map((l) => ({
      ref: l.ref,
      libelle: l.libelle,
      total: l.total,
      montants: d.exercices.map((_, i) => arrondi(l.nets[d.offset + i] ?? 0)),
    })),
  };
}

/** COMPTE DE RÉSULTAT : une colonne par exercice, repère et sens en annotation. */
function tableauResultat(d: EtatsExportData): Tableau {
  return {
    titre: "COMPTE DE RÉSULTAT",
    colLibelle: "LIBELLES",
    entetes: [
      [
        { texte: ["REF"], rowSpan: 2 },
        { texte: ["LIBELLES"], rowSpan: 2 },
        ...d.exercices.map((e) => ({ texte: ["EXERCICE AU", e.label] })),
      ],
      [...d.exercices.map(() => ({ texte: ["NET (1)"] }))],
    ],
    colonnesMontant: d.exercices.map((e) => `EXERCICE au ${e.label}`),
    lignes: d.resultat.map((l) => ({
      ref: l.ref,
      libelle: l.libelle,
      annotation: [l.repere ? `(${l.repere})` : "", !l.total ? l.sens ?? "" : ""]
        .filter(Boolean)
        .join(" "),
      total: l.total,
      montants: d.exercices.map((_, i) => arrondi(l.montants[d.offset + i] ?? 0)),
    })),
    note:
      "(1) Les montants sont précédés du signe (+) ou (−) en fonction de leurs soldes dans la " +
      "balance générale. (2) Les signes affichés à côté des libellés indiquent le sens structurel " +
      "des soldes ; ils ne jouent pas le rôle de signes opérateurs.",
  };
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
      [`${d.clientName} — Période : ${d.periodeLabel}`],
      [],
    ];

    // En-tête : première ligne reprend les regroupements, la seconde le détail.
    const ligne1: (string | null)[] = Array(largeur).fill(null);
    const ligne2: (string | null)[] = Array(largeur).fill(null);
    ligne1[0] = "REF";
    ligne1[1] = t.colLibelle;
    const premiereEntete = t.entetes[0].slice(2);
    const detailEntete = t.entetes[1];
    let col = 2;
    for (const cel of premiereEntete) {
      ligne1[col] = cel.texte.join(" ");
      col += cel.colSpan ?? 1;
    }
    detailEntete.forEach((cel, i) => {
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
    // regroupement d'exercice couvre ses colonnes de détail.
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

    ws["!cols"] = [{ wch: 6 }, { wch: 52 }, ...t.colonnesMontant.map(() => ({ wch: 20 }))];

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
// PDF : reproduction de la grille affichée à l'écran.
// ---------------------------------------------------------------------------
export async function exporterEtatsPdf(d: EtatsExportData) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const LARGEUR_PAGE = pdf.internal.pageSize.getWidth();
  const HAUTEUR_PAGE = pdf.internal.pageSize.getHeight();
  const MARGE = 10;
  const H_LIGNE = 5;
  const H_ENTETE = 6;
  const L_REF = 14;
  const L_MONTANT = 32;

  // Gris de l'écran : en-tête #EDEDED, lignes de total #F2F2F2, filets #9AA9BC.
  const GRIS_ENTETE: [number, number, number] = [237, 237, 237];
  const GRIS_TOTAL: [number, number, number] = [242, 242, 242];
  const FILET: [number, number, number] = [154, 169, 188];

  const dessiner = (t: Tableau, premierePage: boolean) => {
    if (!premierePage) pdf.addPage();

    const nbMontants = t.colonnesMontant.length;
    const largeurTable = LARGEUR_PAGE - 2 * MARGE;
    const lLibelle = largeurTable - L_REF - nbMontants * L_MONTANT;
    const largeurs = [L_REF, lLibelle, ...Array<number>(nbMontants).fill(L_MONTANT)];
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
      pdf.setFontSize(6.8);

      const cellule = (
        texte: string[],
        xDebut: number,
        xFin: number,
        yDebut: number,
        yFin: number,
      ) => {
        pdf.rect(xDebut, yDebut, xFin - xDebut, yFin - yDebut);
        const milieuY = (yDebut + yFin) / 2;
        const depart = milieuY - ((texte.length - 1) * 2.4) / 2 + 0.9;
        texte.forEach((ligne, i) => {
          pdf.text(ligne, (xDebut + xFin) / 2, depart + i * 2.4, { align: "center" });
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
      // Seconde ligne : uniquement sous les regroupements (REF / libellé sont
      // déjà fusionnés sur toute la hauteur).
      col = 2;
      for (const cel of t.entetes[1]) {
        const xDebut = xs[col];
        const xFin = xs[col] + largeurs[col];
        cellule(cel.texte, xDebut, xFin, y + H_ENTETE, y + hTotal);
        col += 1;
      }
      y += hTotal;
    };

    dessinerEntete();

    // ---- Corps ----
    pdf.setFontSize(7);
    for (const l of t.lignes) {
      if (y + H_LIGNE > HAUTEUR_PAGE - MARGE) {
        pdf.addPage();
        y = MARGE + 4;
        dessinerEntete();
        pdf.setFontSize(7);
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
        pdf.text(montantTexte(m, l.total), xs[2 + i] + largeurs[2 + i] - 1.5, base, {
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

  telecharger(pdf.output("blob"), nomFichier(d, "pdf"));
}
