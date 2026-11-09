"use client";

// Choix des dossiers attribués à un membre : recherche, cases à cocher, compteur.

import { useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DossierOption } from "./types";

export function DossiersSelecteur({
  dossiers,
  selection,
  onChange,
  verrouilles = [],
}: {
  dossiers: DossierOption[];
  selection: string[];
  onChange: (ids: string[]) => void;
  /** Dossiers déjà attribués que l'utilisateur connecté ne peut pas retirer. */
  verrouilles?: string[];
}) {
  const [recherche, setRecherche] = useState("");
  const terme = recherche.trim().toLowerCase();
  const liste = dossiers.filter(
    (d) =>
      !terme ||
      d.name.toLowerCase().includes(terme) ||
      (d.denomination ?? "").toLowerCase().includes(terme),
  );

  const basculer = (id: string) =>
    onChange(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un dossier…"
            className="pl-9 h-9"
            aria-label="Rechercher un dossier"
          />
        </div>
        <button
          type="button"
          className="text-xs text-[#0077C3] hover:underline whitespace-nowrap"
          onClick={() => onChange([...new Set([...selection, ...liste.map((d) => d.id)])])}
        >
          Tout cocher
        </button>
        <button
          type="button"
          className="text-xs text-[#335890] hover:underline whitespace-nowrap"
          onClick={() => onChange(selection.filter((id) => verrouilles.includes(id)))}
        >
          Aucun
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-[#D0E3F5] divide-y divide-[#EEF2F7]">
        {liste.length === 0 ? (
          <p className="text-sm text-[#335890] text-center py-6">
            {dossiers.length === 0 ? "Aucun dossier dans l'entreprise." : "Aucun dossier trouvé."}
          </p>
        ) : (
          liste.map((d) => {
            const coche = selection.includes(d.id);
            const verrou = coche && verrouilles.includes(d.id);
            return (
              <label
                key={d.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm",
                  verrou ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-[#F5F9FF]",
                )}
              >
                <Checkbox checked={coche} disabled={verrou} onCheckedChange={() => basculer(d.id)} />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-[#00122E] truncate">{d.name}</span>
                  {d.denomination && (
                    <span className="block text-xs text-[#335890] truncate">{d.denomination}</span>
                  )}
                </span>
                {d.isSelfEntity && (
                  <Badge variant="outline" className="text-[10px]">
                    Votre entité
                  </Badge>
                )}
              </label>
            );
          })
        )}
      </div>
      <p className="text-xs text-[#335890]">
        {selection.length} dossier{selection.length > 1 ? "s" : ""} attribué
        {selection.length > 1 ? "s" : ""} sur {dossiers.length}
      </p>
    </div>
  );
}
