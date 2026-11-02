"use client";

// ============================================================================
// Graphiques masquables des onglets de reporting (hors KPI).
//
// Chaque onglet déclare ses graphiques (identifiant + libellé) et appelle
// useGraphesMasques ; le menu <MenuGraphes /> se place près de « Configurer
// les KPIs » et chaque graphique est entouré de <Graphe id>. Le menu affiche
// ou masque chaque graphique ; le choix est mémorisé par onglet et par client
// dans le navigateur, comme la configuration des KPI. On mémorise les
// graphiques MASQUÉS : un graphique ajouté plus tard s'affiche par défaut.
// ============================================================================
import { useState } from "react";
import type { ReactNode } from "react";
import { PiChartLineDuotone } from "react-icons/pi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Graphique d'un onglet. */
export interface GrapheDef {
  id: string;
  label: string;
}

export interface EtatGraphes {
  defs: GrapheDef[];
  masques: string[];
  basculer: (id: string) => void;
  toutAfficher: () => void;
}

const cleStockage = (storageKey: string) => `graphes-config-${storageKey}`;

function charger(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const brut = localStorage.getItem(cleStockage(storageKey));
    const liste = brut ? (JSON.parse(brut) as unknown) : [];
    return Array.isArray(liste) ? liste.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function sauver(storageKey: string, masques: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cleStockage(storageKey), JSON.stringify(masques));
  } catch {
    // Stockage indisponible (navigation privée) : le choix reste en mémoire.
  }
}

/**
 * Graphiques masqués d'un onglet.
 * @param storageKey identifiant de persistance, unique par onglet et par client
 */
export function useGraphesMasques(storageKey: string, defs: GrapheDef[]): EtatGraphes {
  // État indexé par clé : un même composant sert plusieurs onglets (la clé
  // change avec l'onglet affiché, le composant reste monté).
  const [parCle, setParCle] = useState<Record<string, string[]>>({});
  const masques = parCle[storageKey] ?? charger(storageKey);

  const enregistrer = (liste: string[]) => {
    setParCle((p) => ({ ...p, [storageKey]: liste }));
    sauver(storageKey, liste);
  };

  return {
    defs,
    masques,
    basculer: (id) =>
      enregistrer(masques.includes(id) ? masques.filter((x) => x !== id) : [...masques, id]),
    toutAfficher: () => enregistrer([]),
  };
}

/** Affiche son contenu sauf si le graphique est masqué. */
export function Graphe({ etat, id, children }: { etat: EtatGraphes; id: string; children: ReactNode }) {
  if (etat.masques.includes(id)) return null;
  return <>{children}</>;
}

/** Menu « Graphiques » : une case par graphique de l'onglet (cochée = affiché). */
export function MenuGraphes({ etat, className }: { etat: EtatGraphes; className?: string }) {
  if (etat.defs.length === 0) return null;
  const nbMasques = etat.defs.filter((d) => etat.masques.includes(d.id)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 h-9 rounded-lg transition-colors border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF]",
            className,
          )}
        >
          <PiChartLineDuotone className="w-4 h-4" />
          Graphiques
          {nbMasques > 0 && (
            <span className="text-xs text-muted-foreground">
              ({nbMasques} masqué{nbMasques > 1 ? "s" : ""})
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[280px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Afficher ou masquer les graphiques de l&apos;onglet
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {etat.defs.map((d) => (
          <DropdownMenuCheckboxItem
            key={d.id}
            checked={!etat.masques.includes(d.id)}
            // Le menu reste ouvert pour basculer plusieurs graphiques.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => etat.basculer(d.id)}
          >
            {d.label}
          </DropdownMenuCheckboxItem>
        ))}
        {nbMasques > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => etat.toutAfficher()}>Tout afficher</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
