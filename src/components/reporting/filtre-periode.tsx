"use client";

// ============================================================================
// Filtre de période commun aux onglets de reporting : l'année (flèches), puis
// un curseur à deux poignées sur les mois couverts par le reporting de cette
// année. Plus de mode « périodique » ou « cumulé » :
//   - un seul mois (poignées réunies, ou double-clic sur le mois) : ce mois,
//     jour par jour ;
//   - plusieurs mois : la somme des mois choisis.
// Sur un onglet de soldes (`finSeule`), la période part toujours du premier
// mois : seule la fin se règle.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnneeReporting {
  annee: number;
  /** Mois « 01 » … « 12 » couverts par le reporting, triés. */
  mois: string[];
}

export interface Periode {
  annee: string;
  /** Mois de début « MM » (inclus). */
  debut: string;
  /** Mois de fin « MM » (inclus). */
  fin: string;
}

const NOMS_MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const nomMois = (mm: string) => NOMS_MOIS[parseInt(mm, 10) - 1] ?? mm;
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Période ramenée sur les mois couverts d'une année (tous les mois par défaut). */
export function periodeSurAnnee(a: AnneeReporting, souhait?: Pick<Periode, "debut" | "fin">): Periode {
  const premier = a.mois[0] ?? "01";
  const dernier = a.mois[a.mois.length - 1] ?? "12";
  let debut = souhait && a.mois.includes(souhait.debut) ? souhait.debut : premier;
  let fin = souhait && a.mois.includes(souhait.fin) ? souhait.fin : dernier;
  if (debut > fin) {
    debut = premier;
    fin = dernier;
  }
  return { annee: String(a.annee), debut, fin };
}

/** Libellé de la période calculée, sous le curseur. */
export function libellePeriode(p: Periode, finSeule: boolean, premierMois: string): string {
  if (finSeule) return `Soldes à fin ${nomMois(p.fin)} ${p.annee} (depuis ${nomMois(premierMois)})`;
  if (p.debut === p.fin) return `${majuscule(nomMois(p.fin))} ${p.annee} — mois seul`;
  const nb = parseInt(p.fin, 10) - parseInt(p.debut, 10) + 1;
  return `${majuscule(nomMois(p.debut))} – ${nomMois(p.fin)} ${p.annee} — ${nb} mois`;
}

interface Props {
  annees: AnneeReporting[];
  valeur: Periode;
  /** Onglet de soldes : début fixé au premier mois, seule la fin se règle. */
  finSeule?: boolean;
  onChange: (p: Periode) => void;
}

type Poignee = "debut" | "fin";

export default function FiltrePeriode({ annees, valeur, finSeule = false, onChange }: Props) {
  const iAnnee = annees.findIndex((a) => String(a.annee) === valeur.annee);
  const annee = annees[iAnnee] ?? annees[0];
  const mois = annee?.mois ?? [];
  const n = mois.length;
  const dernier = Math.max(0, n - 1);

  const indexDe = (mm: string, defaut: number) => {
    const i = mois.indexOf(mm);
    return i >= 0 ? i : defaut;
  };
  const iDebut = finSeule ? 0 : indexDe(valeur.debut, 0);
  const iFin = Math.max(iDebut, indexDe(valeur.fin, dernier));

  // Pendant un glisser, les poignées bougent localement ; le parent n'est
  // prévenu qu'au relâcher (un seul chargement des données).
  const [glisse, setGlisse] = useState<{ poignee: Poignee; debut: number; fin: number } | null>(null);
  const debutAffiche = glisse?.debut ?? iDebut;
  const finAffichee = glisse?.fin ?? iFin;

  const piste = useRef<HTMLDivElement>(null);
  // Un clic simple attend un éventuel double-clic, pour ne pas lancer deux
  // chargements.
  const minuterieClic = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (minuterieClic.current) clearTimeout(minuterieClic.current);
  }, []);

  const position = (i: number) => (n <= 1 ? 50 : (i / dernier) * 100);

  const emettre = (d: number, f: number) => {
    const p = { annee: valeur.annee, debut: mois[finSeule ? 0 : d], fin: mois[f] };
    if (p.debut !== valeur.debut || p.fin !== valeur.fin || p.annee !== valeur.annee) onChange(p);
  };

  const indexAuPoint = (clientX: number) => {
    const r = piste.current?.getBoundingClientRect();
    if (!r || r.width === 0 || n <= 1) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(ratio * dernier);
  };

  // Clic sur un mois : la poignée la plus proche s'y place.
  const placerPoigneeProche = (i: number) => {
    if (finSeule) return emettre(0, i);
    if (i <= iDebut) return emettre(i, iFin);
    if (i >= iFin) return emettre(iDebut, i);
    return i - iDebut < iFin - i ? emettre(i, iFin) : emettre(iDebut, i);
  };
  const clicMois = (i: number) => {
    if (minuterieClic.current) clearTimeout(minuterieClic.current);
    minuterieClic.current = setTimeout(() => placerPoigneeProche(i), 220);
  };
  // Double-clic : ce mois seul (sur un onglet de soldes, la fin seule).
  const doubleClicMois = (i: number) => {
    if (minuterieClic.current) clearTimeout(minuterieClic.current);
    emettre(i, i);
  };

  const commencerGlisser = (poignee: Poignee) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setGlisse({ poignee, debut: iDebut, fin: iFin });
  };
  const glisser = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!glisse) return;
    const i = indexAuPoint(e.clientX);
    setGlisse((g) =>
      !g
        ? g
        : g.poignee === "debut"
          ? { ...g, debut: Math.min(i, g.fin) }
          : { ...g, fin: Math.max(i, g.debut) },
    );
  };
  const finirGlisser = () => {
    if (!glisse) return;
    emettre(glisse.debut, glisse.fin);
    setGlisse(null);
  };

  const clavier = (poignee: Poignee) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const pas: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
    let d = iDebut;
    let f = iFin;
    if (e.key in pas) {
      if (poignee === "debut") d = Math.min(Math.max(0, d + pas[e.key]), f);
      else f = Math.max(Math.min(dernier, f + pas[e.key]), d);
    } else if (e.key === "Home") {
      if (poignee === "debut") d = 0;
      else f = d;
    } else if (e.key === "End") {
      if (poignee === "debut") d = f;
      else f = dernier;
    } else return;
    e.preventDefault();
    emettre(d, f);
  };

  // Changement d'année : mêmes mois si l'année les couvre ; toute l'année si
  // la sélection couvrait déjà toute l'année affichée.
  const changerAnnee = (j: number) => {
    const cible = annees[j];
    if (!cible) return;
    const toutLAnnee = iDebut === 0 && iFin === dernier;
    onChange(periodeSurAnnee(cible, toutLAnnee ? undefined : valeur));
  };

  if (!annee || n === 0) return null;

  const poignee = (p: Poignee, i: number) => {
    const verrouillee = finSeule && p === "debut";
    return (
      <button
        type="button"
        role="slider"
        aria-label={p === "debut" ? "Mois de début" : "Mois de fin"}
        aria-valuemin={1}
        aria-valuemax={12}
        aria-valuenow={parseInt(mois[i], 10)}
        aria-valuetext={majuscule(nomMois(mois[i]))}
        aria-disabled={verrouillee || undefined}
        tabIndex={verrouillee ? -1 : 0}
        title={
          verrouillee
            ? "Les soldes se lisent depuis l'ouverture de l'exercice"
            : majuscule(nomMois(mois[i]))
        }
        onPointerDown={verrouillee ? undefined : commencerGlisser(p)}
        onPointerMove={verrouillee ? undefined : glisser}
        onPointerUp={verrouillee ? undefined : finirGlisser}
        onPointerCancel={verrouillee ? undefined : () => setGlisse(null)}
        // Le clic d'une poignée ne doit pas déclencher celui de la piste.
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!verrouillee) doubleClicMois(i);
        }}
        onKeyDown={verrouillee ? undefined : clavier(p)}
        className={cn(
          "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center",
          "w-5 h-5 rounded-full border-2 border-white shadow-md touch-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0077C3]/40",
          verrouillee
            ? "bg-[#94A3B8] cursor-not-allowed"
            : "bg-[#0077C3] cursor-grab active:cursor-grabbing",
          glisse?.poignee === p && "scale-110",
          // La poignée active passe devant quand les deux se rejoignent.
          glisse?.poignee === p || (p === "fin" && !glisse) ? "z-20" : "z-10",
        )}
        style={{ left: `${position(i)}%`, transition: glisse ? "none" : "left 150ms ease-out" }}
      >
        {verrouillee && <Lock className="w-2.5 h-2.5 text-white" aria-hidden />}
      </button>
    );
  };

  const flecheAnnee = (sens: "prec" | "suiv") => {
    // Années triées de la plus récente à la plus ancienne.
    const j = sens === "prec" ? iAnnee + 1 : iAnnee - 1;
    const possible = j >= 0 && j < annees.length;
    const Icone = sens === "prec" ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        onClick={() => changerAnnee(j)}
        disabled={!possible}
        title={sens === "prec" ? "Année précédente" : "Année suivante"}
        aria-label={sens === "prec" ? "Année précédente" : "Année suivante"}
        className={cn(
          "w-9 h-9 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
          possible
            ? "border-[#D0E3F5] text-[#00122E] hover:border-[#0077C3] hover:text-[#0077C3]"
            : "border-[#E2E8F0] text-[#CBD5E1] cursor-not-allowed",
        )}
      >
        <Icone className="w-5 h-5" />
      </button>
    );
  };

  return (
    // select-none : un double-clic sur le curseur ne sélectionne pas de texte.
    <div className="rounded-xl border border-[#D0E3F5] bg-white px-5 pt-3 pb-3 select-none">
      <div className="flex items-center justify-between gap-4">
        {flecheAnnee("prec")}
        <span className="text-2xl font-semibold text-[#00122E] tabular-nums">{annee.annee}</span>
        {flecheAnnee("suiv")}
      </div>

      {/* Curseur : piste, segment choisi, poignées. */}
      <div className="px-3 mt-3">
        <div
          ref={piste}
          className="relative h-5 cursor-pointer select-none"
          onClick={(e) => clicMois(indexAuPoint(e.clientX))}
          onDoubleClick={(e) => doubleClicMois(indexAuPoint(e.clientX))}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#E2ECF7]" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#0077C3]"
            style={{
              left: `${position(debutAffiche)}%`,
              width: `${position(finAffichee) - position(debutAffiche)}%`,
              transition: glisse ? "none" : "left 150ms ease-out, width 150ms ease-out",
            }}
          />
          {mois.map((m, i) => (
            <span
              key={m}
              aria-hidden
              className={cn(
                "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full",
                i >= debutAffiche && i <= finAffichee ? "bg-white/80" : "bg-[#B6CDE6]",
              )}
              style={{ left: `${position(i)}%` }}
            />
          ))}
          {poignee("debut", debutAffiche)}
          {poignee("fin", finAffichee)}
        </div>

        {/* Mois : clic = la poignée la plus proche y va ; double-clic = ce mois seul. */}
        <div className="relative h-6 mt-1.5">
          {mois.map((m, i) => {
            const dedans = i >= debutAffiche && i <= finAffichee;
            return (
              <button
                key={m}
                type="button"
                onClick={() => clicMois(i)}
                onDoubleClick={() => doubleClicMois(i)}
                title={`${majuscule(nomMois(m))} — double-clic pour ce mois seul`}
                className={cn(
                  "absolute -translate-x-1/2 px-1.5 rounded text-sm tabular-nums select-none transition-colors",
                  dedans ? "text-[#00122E] font-semibold" : "text-[#94A3B8] hover:text-[#335890]",
                )}
                style={{ left: `${position(i)}%` }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <span className="text-[#335890] font-medium">
          {libellePeriode(
            { annee: valeur.annee, debut: mois[debutAffiche], fin: mois[finAffichee] },
            finSeule,
            mois[0],
          )}
        </span>
        <span className="text-[#94A3B8] italic">
          {finSeule
            ? "Soldes : seule la fin de période se règle"
            : "Glissez les poignées · double-clic sur un mois pour l'afficher seul"}
        </span>
      </div>
    </div>
  );
}
