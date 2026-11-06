"use client";

// Fenêtre « Visibilité » : ce qu'un membre voit du reporting, onglet par onglet.
// Tout est visible par défaut ; l'administrateur coupe ce qui ne doit pas l'être.

import { useMemo, useState } from "react";
import type { ComponentProps } from "react";
import {
  Check,
  FileText,
  Gauge,
  LineChart,
  Loader2,
  Search,
  Table2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getRoleBadgeVariant, getRoleLabel } from "@/lib/permissions/role-utils";
import {
  LIBELLES_TYPES,
  NB_ELEMENTS,
  ONGLETS_REPORTING,
  nbMasquesOnglet,
  type ElementReporting,
  type TypeElement,
} from "@/lib/reporting/elements";
import { cn } from "@/lib/utils";
import type { MembreDossier } from "./types";

const ICONES: Record<TypeElement, React.ElementType> = {
  kpi: Gauge,
  graphe: LineChart,
  tableau: Table2,
  commentaire: FileText,
};

const TYPES = Object.keys(LIBELLES_TYPES) as TypeElement[];

const sansAccents = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function LigneElement({
  element,
  visible,
  onChange,
}: {
  element: ElementReporting;
  visible: boolean;
  onChange: (visible: boolean) => void;
}) {
  const Icone = ICONES[element.type];
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
        visible ? "border-[#D0E3F5] bg-white hover:bg-[#F5F9FF]" : "border-slate-200 bg-slate-50",
      )}
    >
      <Icone className={cn("w-4 h-4 shrink-0", visible ? "text-[#0077C3]" : "text-slate-400")} />
      <span className={cn("flex-1 text-sm", visible ? "text-[#00122E]" : "text-slate-500 line-through")}>
        {element.label}
      </span>
      <span className={cn("text-xs w-14 text-right", visible ? "text-emerald-700" : "text-slate-500")}>
        {visible ? "Visible" : "Masqué"}
      </span>
      <Switch
        checked={visible}
        onCheckedChange={onChange}
        aria-label={`${element.label} : ${visible ? "visible" : "masqué"}`}
      />
    </label>
  );
}

export function VisibiliteDialog({
  clientId,
  membre,
  onClose,
  onEnregistre,
}: {
  clientId: string;
  membre: MembreDossier;
  onClose: () => void;
  onEnregistre: () => void;
}) {
  const initial = useMemo(() => new Set(membre.masques ?? []), [membre.masques]);
  const [masques, setMasques] = useState<Set<string>>(() => new Set(initial));
  const [ongletId, setOngletId] = useState<string>(ONGLETS_REPORTING[0].id);
  const [recherche, setRecherche] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

  const onglet = ONGLETS_REPORTING.find((o) => o.id === ongletId) ?? ONGLETS_REPORTING[0];

  const basculer = (ids: string[], visible: boolean) =>
    setMasques((m) => {
      const suivant = new Set(m);
      for (const id of ids) {
        if (visible) suivant.delete(id);
        else suivant.add(id);
      }
      return suivant;
    });

  const nbModifications =
    [...masques].filter((id) => !initial.has(id)).length +
    [...initial].filter((id) => !masques.has(id)).length;

  // Recherche sur tous les onglets ; sinon, les éléments de l'onglet choisi.
  const terme = sansAccents(recherche.trim());
  const resultats = terme
    ? ONGLETS_REPORTING.map((o) => ({
        onglet: o,
        elements: o.elements.filter((e) => sansAccents(e.label).includes(terme)),
      })).filter((r) => r.elements.length > 0)
    : [];

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/membres/${membre.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masques: [...masques] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de l'enregistrement");
      toast.success(`Accès de ${membre.nom} enregistrés`);
      onEnregistre();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#D0E3F5]">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-[#00122E]">
            Visibilité du reporting : {membre.nom}
            <Badge
              variant={getRoleBadgeVariant(membre.role) as ComponentProps<typeof Badge>["variant"]}
              className="text-xs"
            >
              {getRoleLabel(membre.role)}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Par défaut, un membre voit tout ce que son rôle autorise. Coupez ce qu&apos;il ne doit
            pas voir sur ce dossier : l&apos;élément disparaît de son écran et n&apos;est plus envoyé
            à son navigateur.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs text-[#335890]">Droits de son rôle :</span>
            {[
              { label: "Voir", permis: membre.voitReporting },
              { label: "Filtrer", permis: membre.peutFiltrer },
              { label: "Exporter", permis: membre.peutExporter },
            ].map((d) => (
              <span
                key={d.label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  d.permis
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500",
                )}
              >
                {d.permis ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {d.label}
              </span>
            ))}
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Onglets de reporting, avec leur état. */}
          <nav className="w-72 shrink-0 border-r border-[#D0E3F5] overflow-y-auto p-3 space-y-1">
            {ONGLETS_REPORTING.map((o) => {
              const nb = nbMasquesOnglet(o, masques);
              const actif = !terme && o.id === ongletId;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOngletId(o.id);
                    setRecherche("");
                  }}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    actif ? "bg-[#EBF5FF] text-[#0077C3] font-medium" : "text-[#335890] hover:bg-[#F5F9FF]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "w-2.5 h-2.5 rounded-sm shrink-0",
                      nb === 0 ? "bg-emerald-500" : nb === o.elements.length ? "bg-slate-300" : "bg-amber-400",
                    )}
                  />
                  <span className="flex-1 truncate">{o.label}</span>
                  <span className="text-xs tabular-nums text-[#94A3B8]">
                    {o.elements.length - nb}/{o.elements.length}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Éléments de l'onglet choisi, ou résultats de la recherche. */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[#D0E3F5]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <Input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher un KPI, un graphique…"
                  className="pl-9 h-9"
                  aria-label="Rechercher un élément du reporting"
                />
              </div>
              {!terme && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => basculer(onglet.elements.map((e) => e.id), true)}
                  >
                    Tout afficher
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => basculer(onglet.elements.map((e) => e.id), false)}
                  >
                    Masquer l&apos;onglet
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {terme ? (
                resultats.length === 0 ? (
                  <p className="text-sm text-[#335890] text-center py-10">
                    Aucun élément ne correspond à « {recherche.trim()} ».
                  </p>
                ) : (
                  resultats.map((r) => (
                    <section key={r.onglet.id} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase text-[#335890]">{r.onglet.label}</h4>
                      {r.elements.map((e) => (
                        <LigneElement
                          key={e.id}
                          element={e}
                          visible={!masques.has(e.id)}
                          onChange={(v) => basculer([e.id], v)}
                        />
                      ))}
                    </section>
                  ))
                )
              ) : (
                TYPES.map((type) => {
                  const elements = onglet.elements.filter((e) => e.type === type);
                  if (elements.length === 0) return null;
                  return (
                    <section key={type} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase text-[#335890]">
                        {LIBELLES_TYPES[type]}
                      </h4>
                      {elements.map((e) => (
                        <LigneElement
                          key={e.id}
                          element={e}
                          visible={!masques.has(e.id)}
                          onChange={(v) => basculer([e.id], v)}
                        />
                      ))}
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-[#D0E3F5]">
          <p className="flex-1 min-w-[200px] text-sm text-[#335890]">
            <span className="font-semibold text-[#00122E]">{masques.size}</span> élément
            {masques.size > 1 ? "s" : ""} masqué{masques.size > 1 ? "s" : ""} sur {NB_ELEMENTS}
            {nbModifications > 0 && (
              <span className="text-amber-700">
                {" "}
                · {nbModifications} modification{nbModifications > 1 ? "s" : ""} non enregistrée
                {nbModifications > 1 ? "s" : ""}
              </span>
            )}
          </p>
          {masques.size > 0 && (
            <Button variant="ghost" onClick={() => setMasques(new Set())} disabled={enregistrement}>
              Tout rendre visible
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={enregistrement}>
            Annuler
          </Button>
          <Button onClick={enregistrer} disabled={enregistrement || nbModifications === 0} className="gap-2">
            {enregistrement && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
