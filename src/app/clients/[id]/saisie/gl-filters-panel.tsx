"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLAGS } from "@/lib/comptable/saisie-refs";

// ==================== Valeurs de filtre ====================
export interface GlFilterValues {
  dateFrom: string;
  dateTo: string;
  journaux: string[];
  comptes: string[];
  pieces: string[];
  tiers: string[];
  factures: string[];
  flags: string[];
}

export const EMPTY_GL_FILTERS: GlFilterValues = {
  dateFrom: "",
  dateTo: "",
  journaux: [],
  comptes: [],
  pieces: [],
  tiers: [],
  factures: [],
  flags: [],
};

export interface GlFilterOptions {
  journaux: string[];
  comptes: string[];
  pieces: string[];
  tiers: string[];
  factures: string[];
}

// Sérialise les filtres pour les routes /saisie et /saisie/export.
export function glFiltersToQuery(f: GlFilterValues): URLSearchParams {
  const qs = new URLSearchParams();
  if (f.dateFrom) qs.set("dateFrom", f.dateFrom);
  if (f.dateTo) qs.set("dateTo", f.dateTo);
  f.journaux.forEach((v) => qs.append("journal", v));
  f.comptes.forEach((v) => qs.append("compte", v));
  f.pieces.forEach((v) => qs.append("piece", v));
  f.tiers.forEach((v) => qs.append("tiers", v));
  f.factures.forEach((v) => qs.append("facture", v));
  f.flags.forEach((v) => qs.append("flag", v));
  return qs;
}

export function countActiveFilters(f: GlFilterValues): number {
  return (
    (f.dateFrom ? 1 : 0) +
    (f.dateTo ? 1 : 0) +
    f.journaux.length +
    f.comptes.length +
    f.pieces.length +
    f.tiers.length +
    f.factures.length +
    f.flags.length
  );
}

// ==================== Multi-sélection (1..n) ====================
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const src = needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
    return src.slice(0, 300); // borne le rendu pour les très longues listes
  }, [options, q]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="relative">
      <label className="text-xs text-[#335890]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full h-9 px-3 rounded-md border text-xs flex items-center justify-between gap-2 bg-background",
          selected.length > 0 ? "border-[#0077C3] text-[#00122E]" : "border-input text-muted-foreground",
        )}
      >
        <span className="truncate">
          {selected.length === 0 ? "Tous" : `${selected.length} sélectionné(s)`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-md border bg-popover shadow-lg p-2 space-y-2">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
              className="h-8 text-xs"
            />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">Aucune valeur</p>
              ) : (
                filtered.map((o) => (
                  <label
                    key={o}
                    className="flex items-center gap-2 text-xs p-1 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} />
                    <span className="truncate">{o}</span>
                  </label>
                ))
              )}
              {options.length > filtered.length && !q && (
                <p className="text-[10px] text-muted-foreground p-1">
                  {options.length - filtered.length} autres — affinez la recherche
                </p>
              )}
            </div>
            {selected.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => onChange([])}
              >
                <X className="w-3 h-3 mr-1" /> Tout effacer
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== Panneau de filtres ====================
export function GlFiltersPanel({
  value,
  onChange,
  options,
}: {
  value: GlFilterValues;
  onChange: (v: GlFilterValues) => void;
  options: GlFilterOptions;
}) {
  const set = (patch: Partial<GlFilterValues>) => onChange({ ...value, ...patch });
  const active = countActiveFilters(value);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-[#335890]">Date début</label>
          <Input
            type="date"
            value={value.dateFrom}
            onChange={(e) => set({ dateFrom: e.target.value })}
            className="h-9 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-[#335890]">Date fin</label>
          <Input
            type="date"
            value={value.dateTo}
            onChange={(e) => set({ dateTo: e.target.value })}
            className="h-9 text-xs"
          />
        </div>
        <MultiSelect
          label="Code journal"
          options={options.journaux}
          selected={value.journaux}
          onChange={(v) => set({ journaux: v })}
        />
        <MultiSelect
          label="Compte"
          options={options.comptes}
          selected={value.comptes}
          onChange={(v) => set({ comptes: v })}
        />
        <MultiSelect
          label="N° pièce"
          options={options.pieces}
          selected={value.pieces}
          onChange={(v) => set({ pieces: v })}
        />
        <MultiSelect
          label="N° tiers"
          options={options.tiers}
          selected={value.tiers}
          onChange={(v) => set({ tiers: v })}
        />
        <MultiSelect
          label="N° facture"
          options={options.factures}
          selected={value.factures}
          onChange={(v) => set({ factures: v })}
        />
        <MultiSelect
          label="Flags"
          options={FLAGS}
          selected={value.flags}
          onChange={(v) => set({ flags: v })}
        />
      </div>

      {active > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {active} filtre{active > 1 ? "s" : ""} actif{active > 1 ? "s" : ""}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange({ ...EMPTY_GL_FILTERS })}
          >
            <X className="w-3 h-3 mr-1" /> Réinitialiser
          </Button>
        </div>
      )}
    </div>
  );
}
