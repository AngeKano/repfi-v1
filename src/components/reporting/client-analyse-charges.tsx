"use client";

// ============================================================================
// Charges et rentabilité — onglet Résultats.
// Spécification « Click Insight — Analyse des charges » (F01 à F14) et
// document de référence (cascade, poids des charges, pont de résultat,
// commentaire) :
//   - cascade CA → 12 catégories de charges → autres produits (TE à TO, dans
//     la couleur du CA) → résultat net ;
//   - détail au clic : catégorie → rubriques → comptes → écritures ;
//   - poids de chaque charge dans le CA, N contre N-1, écart en points et
//     impact sur le résultat ;
//   - pont de résultat, contrôle indépendant et alertes (périodes non
//     comparables, CA nul ou négatif, données non disponibles).
// Les calculs sont dans lib/reporting/analyse-charges.ts.
// ============================================================================

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEVISE } from "@/lib/devise";
import { COMPTE_RESULTAT } from "@/lib/reporting/etats-financiers";
import {
  CATEGORIES_CHARGES,
  REFS_AUTRES_PRODUITS,
  calculerPeriode,
  cascade,
  complementDe,
  ecartPoints,
  pontResultat,
  type EtapeCascade,
} from "@/lib/reporting/analyse-charges";

interface CompteCharges {
  compte: string;
  intitule: string;
  montant: number;
}
interface PeriodeApi {
  year: number;
  disponible: boolean;
  debut: string;
  fin: string;
  nbMois: number;
  rubriques: Record<string, number>;
  comptes: Record<string, CompteCharges[]>;
  resultatComptes: number;
}
export interface ChargesData {
  client: { id: string; name: string };
  periodeLabel: string;
  n: PeriodeApi;
  n1: PeriodeApi;
}
interface Ecriture {
  date: string;
  journal: string;
  piece: string;
  tiers: string;
  debit: number;
  credit: number;
}
interface EcrituresCompte {
  chargement: boolean;
  erreur?: boolean;
  total: number;
  limite: number;
  ecritures: Ecriture[];
}

interface Props {
  clientId: string;
  year: string;
  periodType: string;
  selectedMonth: string | null;
}

// Couleurs : CA et autres produits en bleu, charge en orange, reprise
// (charge négative, favorable) en vert, résultat selon son signe. F11
const COULEURS = {
  ca: "#3367C7",
  charge: "#F2C744",
  reprise: "#2FA36B",
  resultatPositif: "#E07BB5",
  resultatNegatif: "#E5484D",
  piste: "#E6E6E6",
};

const LIBELLE_RUBRIQUE = new Map(COMPTE_RESULTAT.map((l) => [l.ref, l.libelle]));

// ---- Formats (arrondi uniquement à l'affichage) ----------------------------
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MOINS = "−";

const montant = (n: number) =>
  (Math.round(n) < 0 ? MOINS : "") + nf0.format(Math.abs(Math.round(n)));
const montantSigne = (n: number) => (Math.round(n) > 0 ? `+${nf0.format(Math.round(n))}` : montant(n));
/** Ratio en pourcentage ; « n.a. » si indisponible (CA nul), jamais 0 %. F10 */
const pct = (r: number | null) =>
  r === null ? "n.a." : `${r < 0 ? MOINS : ""}${nf2.format(Math.abs(r * 100))} %`;
const points = (p: number | null) =>
  p === null ? "n.a." : `${p > 0 ? "+" : p < 0 ? MOINS : ""}${nf2.format(Math.abs(p))}`;
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Montant en milliers, signé : « −11 766K », « +1 000K ». */
const montantK = (n: number) => {
  const k = Math.round(n / 1000);
  return `${k < 0 ? MOINS : k > 0 ? "+" : ""}${nf0.format(Math.abs(k))}K`;
};
// Libellé dans la barre : affiché si la barre occupe au moins ce % de la piste.
const LARGEUR_MIN_LIBELLE = 22;

const couleurEtape = (e: EtapeCascade) => {
  if (e.type === "ca" || e.type === "autresProduits") return COULEURS.ca;
  if (e.type === "resultat") return e.impact < 0 ? COULEURS.resultatNegatif : COULEURS.resultatPositif;
  return e.impact > 0 ? COULEURS.reprise : COULEURS.charge;
};

const TH = "py-2 px-2 font-semibold text-[#00122E] whitespace-nowrap";
const TD = "py-2 px-2 tabular-nums whitespace-nowrap";

export default function ClientAnalyseCharges({ clientId, year, periodType, selectedMonth }: Props) {
  const [data, setData] = useState<ChargesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filtres = useMemo(() => {
    const qs = new URLSearchParams({ year, periodType });
    if (selectedMonth) qs.set("month", selectedMonth);
    return qs.toString();
  }, [year, periodType, selectedMonth]);

  useEffect(() => {
    let annule = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/clients/${clientId}/reporting/charges?${filtres}`);
        if (!res.ok) throw new Error("Erreur API");
        const json = (await res.json()) as ChargesData;
        if (!annule) setData(json);
      } catch (e) {
        console.error(e);
        if (!annule) setError("Impossible de charger l'analyse des charges.");
      } finally {
        if (!annule) setLoading(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [clientId, filtres]);

  // Écritures d'un compte, sur le même périmètre que l'analyse.  T10
  const chargerEcritures = useCallback(
    async (compte: string) => {
      const res = await fetch(
        `/api/clients/${clientId}/reporting/charges?${filtres}&compte=${encodeURIComponent(compte)}`,
      );
      if (!res.ok) throw new Error("Erreur API");
      return (await res.json()) as Omit<EcrituresCompte, "chargement">;
    },
    [clientId, filtres],
  );

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
          <p>{error || "Aucune donnée"}</p>
        </CardContent>
      </Card>
    );
  }
  // La clé remet le détail ouvert à zéro quand les filtres changent.
  return <AnalyseChargesVue key={filtres} data={data} loading={loading} chargerEcritures={chargerEcritures} />;
}

/** Affichage seul, à partir des données de l'API (testable sans serveur). */
export function AnalyseChargesVue({
  data,
  loading = false,
  chargerEcritures,
}: {
  data: ChargesData;
  loading?: boolean;
  chargerEcritures: (compte: string) => Promise<Omit<EcrituresCompte, "chargement">>;
}) {
  // Navigation de détail : catégorie → rubrique → compte → écritures.  F12
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [rubriqueOuverte, setRubriqueOuverte] = useState<string | null>(null);
  const [compteOuvert, setCompteOuvert] = useState<string | null>(null);
  const [ecritures, setEcritures] = useState<Record<string, EcrituresCompte>>({});

  const ouvrirCompte = async (compte: string) => {
    if (compteOuvert === compte) {
      setCompteOuvert(null);
      return;
    }
    setCompteOuvert(compte);
    if (ecritures[compte] && !ecritures[compte].erreur) return;
    setEcritures((e) => ({ ...e, [compte]: { chargement: true, total: 0, limite: 0, ecritures: [] } }));
    try {
      const json = await chargerEcritures(compte);
      setEcritures((e) => ({ ...e, [compte]: { ...json, chargement: false } }));
    } catch (err) {
      console.error(err);
      setEcritures((e) => ({
        ...e,
        [compte]: { chargement: false, erreur: true, total: 0, limite: 0, ecritures: [] },
      }));
    }
  };

  const calc = useMemo(() => {
    const pN = calculerPeriode(data.n.rubriques);
    const pN1 = data.n1.disponible ? calculerPeriode(data.n1.rubriques) : null;
    return { pN, pN1, etapes: cascade(pN), pont: pN1 ? pontResultat(pN, pN1) : null };
  }, [data]);

  const { n, n1 } = data;
  const { pN, pN1, etapes, pont } = calc;

  // Mêmes bornes de mois et même date de situation : périodes comparables. F09
  const comparables = n.disponible && n1.disponible && n.debut.slice(0, 5) === n1.debut.slice(0, 5) && n.fin.slice(0, 5) === n1.fin.slice(0, 5);

  // Contrôle : CA + autres produits − charges − solde des comptes 6, 7 et 8. F12
  const controleN = pN.resultat - n.resultatComptes;
  const controleN1 = pN1 ? pN1.resultat - n1.resultatComptes : null;

  // ---- Alertes ----
  const alertes: string[] = [];
  if (!n.disponible) alertes.push(`Aucune écriture sur la période ${n.year} : données non disponibles.`);
  if (!n1.disponible)
    alertes.push(`Aucune écriture sur la période de référence ${n1.year} : comparaison non disponible.`);
  if (n.disponible && n1.disponible && !comparables)
    alertes.push(
      `Périodes non comparables : situation au ${n.fin} contre ${n1.fin}. Les écarts ne sont pas annualisés et ne se lisent pas comme une tendance.`,
    );
  if (n.disponible && pN.ca === 0)
    alertes.push("Chiffre d'affaires nul : les ratios sont non applicables (n.a.), les montants sont conservés.");
  if (pN.ca < 0) alertes.push("Chiffre d'affaires négatif : les ratios sont présentés signés.");
  if (n.disponible && Math.abs(controleN) >= 1)
    alertes.push(
      `Écart de réconciliation ${n.year} de ${montantSigne(controleN)} ${DEVISE} : le résultat analysé diffère du solde des comptes 6, 7 et 8 (écritures de gestion sans rubrique du compte de résultat). À expliquer avant interprétation.`,
    );
  if (controleN1 !== null && Math.abs(controleN1) >= 1)
    alertes.push(
      `Écart de réconciliation ${n1.year} de ${montantSigne(controleN1)} ${DEVISE} entre le résultat analysé et le solde des comptes 6, 7 et 8.`,
    );

  // ---- Échelle de la cascade (traverse zéro si le résultat est négatif) ----
  const bornes = etapes.flatMap((e) => [e.avant, e.apres]);
  const min = Math.min(0, ...bornes);
  const max = Math.max(0, ...bornes);
  const etendue = max - min || 1;
  const position = (v: number) => ((v - min) / etendue) * 100;

  // ---- Détail : rubriques → comptes → écritures ----
  const refsDetail = (id: string) =>
    id === "autresProduits"
      ? REFS_AUTRES_PRODUITS
      : (CATEGORIES_CHARGES.find((c) => c.id === id)?.refs ?? []);

  const detailEcritures = (compte: string) => {
    const e = ecritures[compte];
    if (!e || e.chargement)
      return (
        <div className="ml-6 flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Chargement des écritures…
        </div>
      );
    if (e.erreur)
      return <p className="ml-6 py-1 text-[11px] text-red-600">Écritures indisponibles.</p>;
    return (
      <div className="ml-6 mb-1 overflow-x-auto">
        <table className="w-full text-[11px] text-[#335890]">
          <thead>
            <tr className="text-left">
              <th className="pr-3 font-medium">Date</th>
              <th className="pr-3 font-medium">Journal</th>
              <th className="pr-3 font-medium">Pièce</th>
              <th className="pr-3 font-medium">Tiers</th>
              <th className="pr-3 text-right font-medium">Débit</th>
              <th className="text-right font-medium">Crédit</th>
            </tr>
          </thead>
          <tbody>
            {e.ecritures.map((x, i) => (
              <tr key={`${x.date}-${x.piece}-${i}`}>
                <td className="pr-3 whitespace-nowrap">{x.date}</td>
                <td className="pr-3">{x.journal}</td>
                <td className="pr-3">{x.piece}</td>
                <td className="pr-3 truncate max-w-[220px]">{x.tiers}</td>
                <td className="pr-3 text-right tabular-nums">{x.debit ? montant(x.debit) : ""}</td>
                <td className="text-right tabular-nums">{x.credit ? montant(x.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {e.total > e.ecritures.length && (
          <p className="py-1 text-[11px] text-muted-foreground">
            {e.ecritures.length} premières écritures sur {nf0.format(e.total)} — détail complet dans
            l&apos;onglet Comptabilité.
          </p>
        )}
      </div>
    );
  };

  const detail = (id: string) => (
    <div className="ml-5 mb-2 border-l-2 border-[#D0E3F5] pl-3">
      {refsDetail(id)
        .filter((ref) => Math.round(n.rubriques[ref] || 0) !== 0 || (n.comptes[ref] ?? []).length > 0)
        .map((ref) => {
        const v = n.rubriques[ref] || 0;
        const comptes = n.comptes[ref] ?? [];
        const ouvert = rubriqueOuverte === ref;
        return (
          <div key={ref}>
            <button
              type="button"
              disabled={comptes.length === 0}
              onClick={() => {
                setRubriqueOuverte(ouvert ? null : ref);
                setCompteOuvert(null);
              }}
              className="flex w-full items-center gap-2 rounded py-1 text-left text-xs hover:bg-[#F5F9FF] disabled:hover:bg-transparent"
            >
              {comptes.length > 0 ? (
                ouvert ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <span className="font-mono w-7 shrink-0 text-[#335890]">{ref}</span>
              <span className="flex-1 truncate text-[#00122E]">{LIBELLE_RUBRIQUE.get(ref) ?? ref}</span>
              <span className="text-muted-foreground shrink-0">
                {comptes.length} compte{comptes.length > 1 ? "s" : ""}
              </span>
              <span className="w-28 shrink-0 text-right tabular-nums">{montantSigne(v)}</span>
            </button>
            {ouvert && (
              <div className="ml-5">
                {comptes.map((c) => (
                  <Fragment key={c.compte}>
                    <button
                      type="button"
                      onClick={() => ouvrirCompte(c.compte)}
                      className="flex w-full items-center gap-2 rounded py-0.5 text-left text-[11px] text-[#335890] hover:bg-[#F5F9FF]"
                    >
                      {compteOuvert === c.compte ? (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 shrink-0" />
                      )}
                      <span className="font-mono w-16 shrink-0">{c.compte}</span>
                      <span className="flex-1 truncate">{c.intitule}</span>
                      <span className="w-28 shrink-0 text-right tabular-nums">{montantSigne(c.montant)}</span>
                    </button>
                    {compteOuvert === c.compte && detailEcritures(c.compte)}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ---- Commentaire (mêmes tournures que le document de référence) ----
  const commentaire: ReactNode[] = [];
  if (pN.poidsTotalCharges !== null && pN.marge !== null) {
    commentaire.push(
      <p key="c1" className="font-semibold">
        Les charges absorbent {pct(pN.poidsTotalCharges)} du chiffre d&apos;affaires :{" "}
        {pN.marge >= 0
          ? `il reste ${pct(pN.marge)} de résultat net.`
          : `le résultat net est déficitaire, à ${pct(pN.marge)} du chiffre d'affaires.`}
      </p>,
    );
  }
  const premier = [...CATEGORIES_CHARGES].sort((a, b) => pN.couts[b.id] - pN.couts[a.id])[0];
  if (premier && pN.couts[premier.id] > 0 && pN.poids[premier.id] !== null) {
    let suite: ReactNode = null;
    const e = pN1 ? ecartPoints(pN.poids[premier.id], pN1.poids[premier.id]) : null;
    if (pN1 && e !== null) {
      // Plus forte variation de poids parmi les autres catégories.
      const autre = CATEGORIES_CHARGES.filter((c) => c.id !== premier.id)
        .map((c) => ({ c, e: ecartPoints(pN.poids[c.id], pN1.poids[c.id]) ?? 0 }))
        .sort((a, b) => Math.abs(b.e) - Math.abs(a.e))[0];
      const sens = (x: number) =>
        `${x > 0 ? "augmente" : "diminue"}${Math.abs(x) >= 2 ? " nettement" : ""}`;
      suite = (
        <>
          {" "}
          Son poids {Math.abs(e) < 0.005 ? "est stable" : sens(e)} ({points(e)} points)
          {autre && Math.abs(autre.e) >= 0.5
            ? `, tandis que celui ${complementDe(autre.c.nom)} ${sens(autre.e)} (${points(autre.e)} points).`
            : "."}
        </>
      );
    }
    commentaire.push(
      <p key="c2">
        {majuscule(premier.nom)} représente le premier poste, à{" "}
        <strong>{pct(pN.poids[premier.id])} du CA</strong>.{suite}
      </p>,
    );
  }
  if (pN1 && pN.marge !== null && pN1.marge !== null) {
    const e = (pN.marge - pN1.marge) * 100;
    const verbe = Math.abs(e) < 0.005 ? "reste stable" : e > 0 ? "progresse" : "recule";
    commentaire.push(
      <p key="c3">
        La marge affichée {verbe} de <strong>{pct(pN1.marge)}</strong> à <strong>{pct(pN.marge)}</strong>
        {comparables ? (
          "."
        ) : (
          <>
            , mais le document compare le{" "}
            <strong>
              {n.fin} au {n1.fin}
            </strong>{" "}
            : cette {e > 0 ? "amélioration" : e < 0 ? "dégradation" : "évolution"} doit être confirmée sur
            des périodes de même durée.
          </>
        )}
      </p>,
    );
  }

  // ---- Tableau des poids (ordre de la spécification, sans tri) ----  F02/F05
  type LignePoids = {
    id: string;
    libelle: string;
    refs: string;
    mN: number;
    mN1: number | null;
    rN: number | null;
    rN1: number | null;
    /** Impact de la variation sur le résultat (hausse de coût = négatif). */
    impact: number | null;
    total?: boolean;
  };
  const lignesPoids: LignePoids[] = [
    {
      id: "ca",
      libelle: "Chiffre d'affaires",
      refs: "XB",
      mN: pN.ca,
      mN1: pN1?.ca ?? null,
      rN: pN.ca === 0 ? null : 1,
      rN1: pN1 ? (pN1.ca === 0 ? null : 1) : null,
      impact: pont?.ecartCA ?? null,
      total: true,
    },
    ...CATEGORIES_CHARGES.map((c) => ({
      id: c.id,
      libelle: c.libelle,
      refs: c.refs.join(", "),
      mN: pN.couts[c.id],
      mN1: pN1 ? pN1.couts[c.id] : null,
      rN: pN.poids[c.id],
      rN1: pN1 ? pN1.poids[c.id] : null,
      impact: pN1 ? pN1.couts[c.id] - pN.couts[c.id] : null,
    })),
    {
      id: "total",
      libelle: "Total charges",
      refs: "RA à RS",
      mN: pN.totalCharges,
      mN1: pN1?.totalCharges ?? null,
      rN: pN.poidsTotalCharges,
      rN1: pN1?.poidsTotalCharges ?? null,
      impact: pont?.impactCharges ?? null,
      total: true,
    },
    {
      id: "autresProduits",
      libelle: "Autres produits hors CA",
      refs: "TE à TO",
      mN: pN.autresProduits,
      mN1: pN1?.autresProduits ?? null,
      rN: pN.poidsAutresProduits,
      rN1: pN1?.poidsAutresProduits ?? null,
      impact: pont?.ecartAutresProduits ?? null,
    },
    {
      id: "marge",
      libelle: "Résultat net (marge nette)",
      refs: "XI",
      mN: pN.resultat,
      mN1: pN1?.resultat ?? null,
      rN: pN.marge,
      rN1: pN1?.marge ?? null,
      impact: pont?.ecartResultat ?? null,
      total: true,
    },
  ];

  // Une ligne à 0 % ne figure pas au classement : elle n'apporte rien à la
  // lecture. Le CA et le résultat net restent toujours affichés. « 0 % » =
  // ce qui s'affiche « 0,00 % » (moins de 0,005 % du CA), ou un montant nul
  // quand le CA est nul.
  const estNul = (montantLigne: number) =>
    Math.round(montantLigne) === 0 || (pN.ca !== 0 && Math.abs(montantLigne / pN.ca) < 0.00005);
  const etapesAffichees = etapes.filter(
    (e) => e.type === "ca" || e.type === "resultat" || !estNul(e.impact),
  );
  // Tableau : une catégorie (ou les autres produits) disparaît si elle est
  // nulle en N et en N-1 — une charge présente l'an passé reste comparée.
  const lignesPoidsAffichees = lignesPoids.filter(
    (l) =>
      l.total ||
      l.id === "marge" ||
      !estNul(l.mN) ||
      (l.mN1 !== null && Math.round(l.mN1) !== 0),
  );

  const resume = (label: string, v: number) => (
    <div className="text-sm text-[#335890]">
      {label} : <span className="font-semibold text-[#00122E] tabular-nums">{montant(v)}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Charges et rentabilité · {data.client.name}</CardTitle>
        <CardDescription>
          Situation au {n.fin}
          {n1.disponible ? ` · Référence : ${n1.fin}` : ""} · Montants en {DEVISE}
        </CardDescription>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 pt-3">
          {resume("CA", pN.ca)}
          {resume("Charges", pN.totalCharges)}
          {resume("Autres produits", pN.autresProduits)}
          {resume("Résultat net", pN.resultat)}
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Actualisation…
          </div>
        )}

        {alertes.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
            {alertes.map((a) => (
              <p key={a} className="flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {a}
              </p>
            ))}
          </div>
        )}

        {/* ==================== Cascade ==================== */}
        <div>
          <h3 className="font-semibold text-[#00122E]">
            {pN.marge === null
              ? "Chiffre d'affaires nul : part du résultat non applicable"
              : `Sur 100 de chiffre d'affaires, il reste ${pN.marge < 0 ? MOINS : ""}${nf2.format(Math.abs(pN.marge * 100))} de résultat`}
          </h3>
          <div className="flex flex-wrap items-center gap-4 mt-1 mb-4 text-xs text-[#335890]">
            {[
              { c: COULEURS.ca, l: "CA et autres produits" },
              { c: COULEURS.charge, l: "Charges déduites" },
              { c: COULEURS.reprise, l: "Reprises (charge négative)" },
              { c: pN.resultat < 0 ? COULEURS.resultatNegatif : COULEURS.resultatPositif, l: "Résultat" },
            ].map((x) => (
              <span key={x.l} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: x.c }} />
                {x.l}
              </span>
            ))}
            <span className="text-muted-foreground">
              Cliquez sur une ligne pour le détail par rubrique, compte et écriture.
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px] divide-y divide-[#EEF2F7]">
              {etapesAffichees.map((e, index) => {
                const gauche = position(Math.min(e.avant, e.apres));
                const largeur = position(Math.max(e.avant, e.apres)) - gauche;
                const poids = pN.ca === 0 ? null : (e.type === "charge" ? -e.impact : e.impact) / pN.ca;
                const cliquable = e.type === "charge" || e.type === "autresProduits";
                const ouvert = ouverte === e.id;
                const fort = e.type === "ca" || e.type === "resultat";
                // « −11 766K · 55,11 % » : montant en milliers et poids dans le CA.
                const libelleBarre = `${
                  e.type === "charge" || e.type === "autresProduits"
                    ? montantK(e.impact)
                    : montantK(e.impact).replace(/^\+/, "")
                } · ${e.type === "ca" ? (pN.ca === 0 ? "n.a." : "100 %") : pct(poids)}`;
                return (
                  <Fragment key={e.id}>
                    <button
                      type="button"
                      disabled={!cliquable}
                      onClick={() => {
                        setOuverte(ouvert ? null : e.id);
                        setRubriqueOuverte(null);
                        setCompteOuvert(null);
                      }}
                      className={cn(
                        "grid w-full grid-cols-[minmax(170px,1.3fr)_minmax(220px,2fr)_minmax(150px,1fr)] items-center gap-3 py-2 text-left",
                        cliquable && "hover:bg-[#F5F9FF] cursor-pointer",
                      )}
                    >
                      <span className={cn("flex items-center gap-1 text-sm text-[#00122E]", fort && "font-semibold")}>
                        {cliquable ? (
                          ouvert ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#335890] shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-[#335890] shrink-0" />
                          )
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        {e.libelle}
                      </span>
                      <span className="relative h-5 rounded-sm" style={{ backgroundColor: COULEURS.piste }}>
                        {/* Ligne à zéro : aucune barre artificielle. F11 */}
                        {Math.round(e.impact) !== 0 && (
                          <span
                            className="group/barre absolute top-0 h-full rounded-sm cursor-pointer"
                            style={{
                              left: `${gauche}%`,
                              width: `max(${largeur}%, 2px)`,
                              backgroundColor: couleurEtape(e),
                            }}
                          >
                            {/* Montant (K) et poids dans la barre quand elle est assez large. */}
                            {largeur >= LARGEUR_MIN_LIBELLE && (
                              <span
                                className={cn(
                                  "absolute inset-0 flex items-center justify-center px-1 text-[11px] font-semibold tabular-nums whitespace-nowrap overflow-hidden",
                                  e.type === "charge" && e.impact < 0 ? "text-[#00122E]" : "text-white",
                                )}
                              >
                                {libelleBarre}
                              </span>
                            )}
                            {/* Infobulle au survol : toujours disponible, indispensable
                                pour les petites barres. Sous la barre pour la première
                                ligne, pour ne pas sortir du cadre. */}
                            <span
                              role="tooltip"
                              className={cn(
                                "pointer-events-none absolute left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#00122E] px-2.5 py-1.5 text-xs text-white shadow-lg group-hover/barre:block",
                                index === 0 ? "top-full mt-1.5" : "bottom-full mb-1.5",
                              )}
                            >
                              <span className="block font-semibold">{e.libelle}</span>
                              <span className="block tabular-nums">{libelleBarre}</span>
                            </span>
                          </span>
                        )}
                        {min < 0 && (
                          <span
                            className="absolute top-0 h-full w-px bg-[#335890]"
                            style={{ left: `${position(0)}%` }}
                          />
                        )}
                      </span>
                      <span className={cn("text-right text-sm tabular-nums whitespace-nowrap", fort && "font-semibold")}>
                        {e.type === "charge" || e.type === "autresProduits"
                          ? montantSigne(e.impact)
                          : montant(e.impact)}
                        {" · "}
                        {e.type === "ca" ? (pN.ca === 0 ? "n.a." : "100 %") : pct(poids)}
                      </span>
                    </button>
                    {ouvert && detail(e.id)}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============ Poids de chaque charge dans le CA ============ */}
        <div>
          <h3 className="font-semibold text-[#00122E] mb-3">
            Poids de chaque charge dans le chiffre d&apos;affaires
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D0E3F5]">
                  <th className={cn(TH, "text-left")}>Charge</th>
                  <th className={cn(TH, "text-right")}>{n.year}</th>
                  <th className={cn(TH, "text-right")}>{n.year} / CA</th>
                  <th className={cn(TH, "text-right")}>{n1.year}</th>
                  <th className={cn(TH, "text-right")}>{n1.year} / CA</th>
                  <th className={cn(TH, "text-right")}>Écart en points</th>
                  <th className={cn(TH, "text-right")}>Impact sur le résultat</th>
                </tr>
              </thead>
              <tbody>
                {lignesPoidsAffichees.map((l) => (
                  <tr key={l.id} className={cn("border-b border-[#EEF2F7]", l.total && "font-semibold")}>
                    <td className="py-2 px-2 text-[#00122E]">{l.libelle}</td>
                    <td className={cn(TD, "text-right")}>{montant(l.mN)}</td>
                    <td className={cn(TD, "text-right")}>{pct(l.rN)}</td>
                    <td className={cn(TD, "text-right")}>{l.mN1 === null ? "" : montant(l.mN1)}</td>
                    <td className={cn(TD, "text-right")}>{l.mN1 === null ? "" : pct(l.rN1)}</td>
                    <td className={cn(TD, "text-right")}>
                      {l.mN1 === null || l.id === "ca" ? "" : points(ecartPoints(l.rN, l.rN1))}
                    </td>
                    <td className={cn(TD, "text-right")}>{l.impact === null ? "" : montantSigne(l.impact)}</td>
                  </tr>
                ))}
                {/* Contrôle indépendant : attendu 0 (à la précision de stockage). F12 */}
                <tr className="text-xs text-muted-foreground">
                  <td className="py-2 px-2">
                    Contrôle du résultat (CA + autres produits − charges − comptes 6/7/8)
                  </td>
                  <td className={cn(TD, "text-right", Math.abs(controleN) >= 1 && "text-red-600 font-semibold")}>
                    {n.disponible ? montantSigne(controleN) : ""}
                  </td>
                  <td />
                  <td
                    className={cn(
                      TD,
                      "text-right",
                      controleN1 !== null && Math.abs(controleN1) >= 1 && "text-red-600 font-semibold",
                    )}
                  >
                    {controleN1 === null ? "" : montantSigne(controleN1)}
                  </td>
                  <td colSpan={3} className="py-2 px-2 text-right">
                    Attendu : 0. Tout écart doit être expliqué avant interprétation.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ============ Pont de résultat ============ F14 */}
        {pont && (
          <div>
            <h3 className="font-semibold text-[#00122E] mb-3">Écart de résultat entre les deux situations</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D0E3F5]">
                  <th className={cn(TH, "text-left")}>Facteur</th>
                  <th className={cn(TH, "text-right")}>Impact sur le résultat</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { l: `${pont.ecartCA >= 0 ? "Hausse" : "Baisse"} du chiffre d'affaires`, v: pont.ecartCA },
                  {
                    l: `${pont.ecartAutresProduits >= 0 ? "Hausse" : "Baisse"} des autres produits`,
                    v: pont.ecartAutresProduits,
                  },
                  {
                    l: `${pont.impactCharges >= 0 ? "Diminution" : "Augmentation"} du total des charges`,
                    v: pont.impactCharges,
                  },
                ]
                  // Un facteur sans effet sur le résultat n'est pas listé.
                  .filter((x) => Math.round(x.v) !== 0)
                  .map((x) => (
                  <tr key={x.l} className="border-b border-[#EEF2F7]">
                    <td className="py-2 px-2 text-[#00122E]">{x.l}</td>
                    <td className={cn(TD, "text-right")}>{montantSigne(x.v)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 px-2 text-[#00122E]">Écart net de résultat</td>
                  <td className={cn(TD, "text-right")}>{montantSigne(pont.ecartResultat)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {commentaire.length > 0 && (
          <div className="space-y-2 text-sm text-[#00122E] leading-relaxed">{commentaire}</div>
        )}
      </CardContent>
    </Card>
  );
}
