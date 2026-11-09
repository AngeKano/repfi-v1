"use client";

// ============================================================================
// Graphiques des onglets de reporting (hors KPI) : affichés, masqués et
// réordonnés par l'utilisateur.
//
// Un seul bouton par onglet, <BoutonConfiguration />, met KPI et graphiques en
// mode configuration : les KPI s'échangent entre eux (KpiGrid), les graphiques
// entre eux. Chaque onglet déclare ses graphiques (identifiant + libellé),
// appelle useGraphesMasques et entoure chaque graphique de <Graphe id> ; les
// graphiques réordonnables sont regroupés dans <ZoneGraphes>. Le choix est
// mémorisé par onglet et par client dans le navigateur. On mémorise les
// graphiques MASQUÉS : un graphique ajouté plus tard s'affiche par défaut.
//
// Avec l'onglet du catalogue, un graphique masqué à ce membre par un
// administrateur (onglet Membres) n'est ni affiché ni proposé.
// ============================================================================
import { Children, createContext, isValidElement, useContext, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from "lucide-react";
import { PiGearDuotone } from "react-icons/pi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OngletReportingId } from "@/lib/reporting/elements";
import { useVisibilite } from "./visibilite";

/** Graphique d'un onglet. */
export interface GrapheDef {
  id: string;
  label: string;
}

export interface EtatGraphes {
  /** Graphiques que ce membre peut voir, dans l'ordre choisi. */
  defs: GrapheDef[];
  /** Graphiques masqués (choix de l'utilisateur et restrictions). */
  masques: string[];
  /** Mode configuration de l'onglet, partagé avec les KPI. */
  edition: boolean;
  setEdition: (edition: boolean) => void;
  basculer: (id: string) => void;
  toutAfficher: () => void;
  /** Place le graphique `id` à la position de `cible`. */
  deplacer: (id: string, cible: string) => void;
}

interface Configuration {
  masques: string[];
  ordre: string[];
}

const cleStockage = (storageKey: string) => `graphes-config-${storageKey}`;
const textes = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);

function charger(storageKey: string): Configuration {
  if (typeof window === "undefined") return { masques: [], ordre: [] };
  try {
    const brut = localStorage.getItem(cleStockage(storageKey));
    const lu = brut ? (JSON.parse(brut) as unknown) : null;
    // Ancien format : la seule liste des graphiques masqués.
    if (Array.isArray(lu)) return { masques: textes(lu), ordre: [] };
    const objet = (lu ?? {}) as Record<string, unknown>;
    return { masques: textes(objet.masques), ordre: textes(objet.ordre) };
  } catch {
    return { masques: [], ordre: [] };
  }
}

function sauver(storageKey: string, configuration: Configuration) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cleStockage(storageKey), JSON.stringify(configuration));
  } catch {
    // Stockage indisponible (navigation privée) : le choix reste en mémoire.
  }
}

/**
 * Graphiques masqués et ordre des graphiques d'un onglet.
 * @param storageKey identifiant de persistance, unique par onglet et par client
 * @param onglet onglet du catalogue des éléments de reporting
 */
export function useGraphesMasques(
  storageKey: string,
  defs: GrapheDef[],
  onglet?: OngletReportingId,
): EtatGraphes {
  const { estVisible } = useVisibilite();
  const permis = (id: string) => !onglet || estVisible(onglet, "graphe", id);
  // État indexé par clé : un même composant sert plusieurs onglets (la clé
  // change avec l'onglet affiché, le composant reste monté). Le mode
  // configuration se referme quand l'onglet change.
  const [parCle, setParCle] = useState<Record<string, Configuration>>({});
  const [editionCle, setEditionCle] = useState<string | null>(null);
  const configuration = parCle[storageKey] ?? charger(storageKey);

  const enregistrer = (c: Configuration) => {
    setParCle((p) => ({ ...p, [storageKey]: c }));
    sauver(storageKey, c);
  };

  // Ordre mémorisé, puis les graphiques jamais déplacés dans l'ordre de l'onglet.
  const rang = (id: string) => {
    const i = configuration.ordre.indexOf(id);
    return i === -1 ? configuration.ordre.length + defs.findIndex((d) => d.id === id) : i;
  };
  const ordonnes = [...defs].sort((a, b) => rang(a.id) - rang(b.id));

  return {
    defs: ordonnes.filter((d) => permis(d.id)),
    masques: [...configuration.masques, ...defs.filter((d) => !permis(d.id)).map((d) => d.id)],
    edition: editionCle === storageKey,
    setEdition: (edition) => setEditionCle(edition ? storageKey : null),
    basculer: (id) =>
      enregistrer({
        ...configuration,
        masques: configuration.masques.includes(id)
          ? configuration.masques.filter((x) => x !== id)
          : [...configuration.masques, id],
      }),
    toutAfficher: () => enregistrer({ ...configuration, masques: [] }),
    deplacer: (id, cible) => {
      if (id === cible) return;
      const ordre = ordonnes.map((d) => d.id);
      const de = ordre.indexOf(id);
      const vers = ordre.indexOf(cible);
      if (de === -1 || vers === -1) return;
      ordre.splice(vers, 0, ...ordre.splice(de, 1));
      enregistrer({ ...configuration, ordre });
    },
  };
}

/** Nombre de graphiques que l'utilisateur a masqués (hors restrictions). */
export const nbGraphesMasques = (etat: EtatGraphes) =>
  etat.defs.filter((d) => etat.masques.includes(d.id)).length;

/** Bouton unique de l'onglet : configure KPI et graphiques ensemble. */
export function BoutonConfiguration({
  edition,
  onClick,
  nbMasques = 0,
  className,
}: {
  edition: boolean;
  onClick: () => void;
  nbMasques?: number;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-pressed={edition}
      className={cn(
        "gap-2 h-9 rounded-lg transition-colors",
        edition
          ? "bg-[#0077C3] text-white border-[#0077C3] hover:bg-[#005992]"
          : "border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF]",
        className,
      )}
    >
      <PiGearDuotone className="w-4 h-4" />
      {edition ? "Terminer" : "Configurer l'affichage"}
      {!edition && nbMasques > 0 && (
        <span className="text-xs text-muted-foreground">
          ({nbMasques} masqué{nbMasques > 1 ? "s" : ""})
        </span>
      )}
    </Button>
  );
}

// Zone de graphiques réordonnables : ordre courant et graphique en cours de glisser.
interface ValeurZone {
  ordre: string[];
  glisse: string | null;
  setGlisse: (id: string | null) => void;
}
const ContexteZone = createContext<ValeurZone | null>(null);

/** Regroupe des <Graphe> que l'utilisateur peut réordonner entre eux. */
export function ZoneGraphes({ etat, children }: { etat: EtatGraphes; children: ReactNode }) {
  const [glisse, setGlisse] = useState<string | null>(null);
  const ordre = etat.defs.map((d) => d.id);
  const rang = (enfant: ReactNode) => {
    const id = isValidElement(enfant) ? (enfant as ReactElement<{ id?: string }>).props.id : undefined;
    const i = id ? ordre.indexOf(id) : -1;
    return i === -1 ? ordre.length : i;
  };
  const enfants = Children.toArray(children).sort((a, b) => rang(a) - rang(b));
  return (
    <ContexteZone.Provider value={{ ordre, glisse, setGlisse }}>
      <div className="space-y-6">{enfants}</div>
    </ContexteZone.Provider>
  );
}

/**
 * Un graphique : masqué, il n'est pas rendu. En mode configuration, une barre
 * permet de le masquer ou de l'afficher et, dans une ZoneGraphes, de le
 * déplacer parmi les autres graphiques.
 */
export function Graphe({ etat, id, children }: { etat: EtatGraphes; id: string; children: ReactNode }) {
  const zone = useContext(ContexteZone);
  const def = etat.defs.find((d) => d.id === id);
  // Masqué par un administrateur : jamais rendu, même en configuration.
  if (!def) return null;
  const masque = etat.masques.includes(id);
  if (!etat.edition) return masque ? null : <>{children}</>;

  const rang = zone ? zone.ordre.indexOf(id) : -1;
  const ordonnable = !!zone && zone.ordre.length > 1;
  return (
    <div
      draggable={ordonnable}
      onDragStart={() => zone?.setGlisse(id)}
      onDragOver={(e) => {
        if (!zone?.glisse) return;
        e.preventDefault();
        etat.deplacer(zone.glisse, id);
      }}
      onDragEnd={() => zone?.setGlisse(null)}
      className={cn(
        "rounded-xl border-2 border-dashed border-[#0077C3]/60 overflow-hidden transition-opacity",
        zone?.glisse === id && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-[#F5F9FF] border-b border-[#D0E3F5]">
        {ordonnable && <GripVertical className="w-4 h-4 text-[#94A3B8] cursor-grab" aria-hidden />}
        <span className={cn("flex-1 text-sm font-medium", masque ? "text-[#94A3B8]" : "text-[#00122E]")}>
          {def.label}
        </span>
        {ordonnable && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={rang <= 0}
              onClick={() => etat.deplacer(id, zone.ordre[rang - 1])}
              aria-label={`Monter « ${def.label} »`}
              title="Monter"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={rang >= zone.ordre.length - 1}
              onClick={() => etat.deplacer(id, zone.ordre[rang + 1])}
              aria-label={`Descendre « ${def.label} »`}
              title="Descendre"
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-8 border-[#D0E3F5] text-[#335890]"
          onClick={() => etat.basculer(id)}
        >
          {masque ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {masque ? "Afficher" : "Masquer"}
        </Button>
      </div>
      {masque ? (
        <p className="px-4 py-3 text-sm text-[#94A3B8]">Graphique masqué</p>
      ) : (
        <div className="p-2">{children}</div>
      )}
    </div>
  );
}
