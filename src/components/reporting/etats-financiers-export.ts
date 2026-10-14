// ============================================================================
// Export des États Financiers (Bilan + Compte de résultat) en Excel ou PDF.
//
// L'export se fait côté navigateur, à partir des données déjà affichées : ce
// qui est téléchargé correspond exactement à ce que l'utilisateur voit, mêmes
// filtres et mêmes exercices comparés.
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

type Cellule = string | number;

const arrondi = (n: number) => Math.round(n || 0);

/** Nom de fichier sans caractère gênant pour le système. */
function nomFichier(d: EtatsExportData, ext: string): string {
  const client = d.clientName.replace(/[^a-zA-Z0-9]/g, "_");
  const exercices = d.exercices.map((e) => e.year).join("-");
  return `ETATS_FINANCIERS_${client}_${exercices}.${ext}`;
}

// ---------------------------------------------------------------------------
// Construction des tableaux, partagée entre les deux formats.
// ---------------------------------------------------------------------------

function tableauActif(d: EtatsExportData): { entetes: string[]; lignes: Cellule[][] } {
  const [premier, ...autres] = d.exercices;
  const entetes = [
    "REF",
    "ACTIF",
    `BRUT au ${premier?.label ?? "—"}`,
    `AMORT. et DEPREC. au ${premier?.label ?? "—"}`,
    `NET au ${premier?.label ?? "—"}`,
    ...autres.map((e) => `NET au ${e.label}`),
  ];
  const lignes = d.actif.map((l) => [
    l.ref,
    l.libelle,
    arrondi(l.bruts[d.offset] ?? 0),
    arrondi(l.amorts[d.offset] ?? 0),
    arrondi(l.nets[d.offset] ?? 0),
    ...autres.map((_, i) => arrondi(l.nets[d.offset + 1 + i] ?? 0)),
  ]);
  return { entetes, lignes };
}

function tableauPassif(d: EtatsExportData): { entetes: string[]; lignes: Cellule[][] } {
  const entetes = ["REF", "PASSIF", ...d.exercices.map((e) => `NET au ${e.label}`)];
  const lignes = d.passif.map((l) => [
    l.ref,
    l.libelle,
    ...d.exercices.map((_, i) => arrondi(l.nets[d.offset + i] ?? 0)),
  ]);
  return { entetes, lignes };
}

function tableauResultat(d: EtatsExportData): { entetes: string[]; lignes: Cellule[][] } {
  const entetes = ["REF", "LIBELLES", ...d.exercices.map((e) => `EXERCICE au ${e.label}`)];
  const lignes = d.resultat.map((l) => [
    l.ref,
    l.libelle,
    ...d.exercices.map((_, i) => arrondi(l.montants[d.offset + i] ?? 0)),
  ]);
  return { entetes, lignes };
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
// Excel : un onglet par état.
// ---------------------------------------------------------------------------
export async function exporterEtatsExcel(d: EtatsExportData) {
  const XLSX = await import("xlsx");

  const feuille = (
    titre: string,
    t: { entetes: string[]; lignes: Cellule[][] },
  ) => {
    const aoa: Cellule[][] = [
      [titre],
      [`${d.clientName} — Période : ${d.periodeLabel}`],
      [],
      t.entetes,
      ...t.lignes,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Largeurs : REF étroit, libellé large, montants moyens.
    ws["!cols"] = [
      { wch: 6 },
      { wch: 52 },
      ...t.entetes.slice(2).map(() => ({ wch: 18 })),
    ];
    return ws;
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, feuille("BILAN — ACTIF", tableauActif(d)), "Bilan Actif");
  XLSX.utils.book_append_sheet(wb, feuille("BILAN — PASSIF", tableauPassif(d)), "Bilan Passif");
  XLSX.utils.book_append_sheet(
    wb,
    feuille("COMPTE DE RÉSULTAT", tableauResultat(d)),
    "Compte de Résultat",
  );

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  telecharger(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nomFichier(d, "xlsx"),
  );
}

// ---------------------------------------------------------------------------
// PDF : une section par état, tableau dessiné à la main (pas d'autotable).
// ---------------------------------------------------------------------------
export async function exporterEtatsPdf(d: EtatsExportData) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const LARGEUR = pdf.internal.pageSize.getWidth();
  const HAUTEUR = pdf.internal.pageSize.getHeight();
  const MARGE = 10;
  const LIGNE = 5.2;

  const dessinerTableau = (
    titre: string,
    t: { entetes: string[]; lignes: Cellule[][] },
    lignesTotal: boolean[],
    premierePage: boolean,
  ) => {
    if (!premierePage) pdf.addPage();
    let y = MARGE + 6;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(titre, MARGE, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(90);
    pdf.text(`${d.clientName} — Période : ${d.periodeLabel}`, MARGE, y);
    pdf.setTextColor(0);
    y += 5;

    // Colonnes : REF fixe, libellé extensible, montants fixes.
    const nbMontants = t.entetes.length - 2;
    const lRef = 14;
    const lMontant = 30;
    const lLibelle = LARGEUR - 2 * MARGE - lRef - nbMontants * lMontant;
    const largeurs: number[] = [lRef, lLibelle, ...Array(nbMontants).fill(lMontant)];
    const x0 = MARGE;
    // Abscisse de début de chaque colonne.
    const xs: number[] = [];
    let curseur = x0;
    for (const w of largeurs) {
      xs.push(curseur);
      curseur += w;
    }

    const entete = () => {
      pdf.setFillColor(237, 237, 237);
      pdf.rect(x0, y, LARGEUR - 2 * MARGE, LIGNE + 1.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.5);
      t.entetes.forEach((h, i) => {
        const texte = pdf.splitTextToSize(h, largeurs[i] - 2) as string[];
        pdf.text(texte[0] ?? h, xs[i] + 1, y + 4);
      });
      y += LIGNE + 1.5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
    };

    entete();

    t.lignes.forEach((ligne, idx) => {
      if (y > HAUTEUR - MARGE - LIGNE) {
        pdf.addPage();
        y = MARGE + 4;
        entete();
      }
      const estTotal = lignesTotal[idx];
      if (estTotal) {
        pdf.setFillColor(242, 242, 242);
        pdf.rect(x0, y, LARGEUR - 2 * MARGE, LIGNE, "F");
      }
      pdf.setFont("helvetica", estTotal ? "bold" : "normal");

      ligne.forEach((cel, i) => {
        if (i <= 1) {
          const texte = pdf.splitTextToSize(String(cel), largeurs[i] - 2) as string[];
          pdf.text(texte[0] ?? String(cel), xs[i] + 1, y + 3.6);
        } else {
          const n = Number(cel);
          // Un montant nul n'est imprimé que sur les lignes de total, comme à
          // l'écran : les lignes de détail restent vides.
          const texte = n === 0 && !estTotal ? "" : n.toLocaleString("fr-FR");
          pdf.text(texte, xs[i] + largeurs[i] - 1, y + 3.6, { align: "right" });
        }
      });

      pdf.setDrawColor(200);
      pdf.line(x0, y + LIGNE, LARGEUR - MARGE, y + LIGNE);
      y += LIGNE;
    });
  };

  dessinerTableau("BILAN — ACTIF", tableauActif(d), d.actif.map((l) => l.total), true);
  dessinerTableau("BILAN — PASSIF", tableauPassif(d), d.passif.map((l) => l.total), false);
  dessinerTableau(
    "COMPTE DE RÉSULTAT",
    tableauResultat(d),
    d.resultat.map((l) => l.total),
    false,
  );

  telecharger(pdf.output("blob"), nomFichier(d, "pdf"));
}
