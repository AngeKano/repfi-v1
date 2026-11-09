"use client";

// ============================================================================
// Grille de KPI partagée par les onglets de reporting.
//
// Mise en page unique : 3 cartes par ligne et un bouton « Configurer les
// KPIs » qui permet d'afficher les indicateurs masqués par défaut et de
// réordonner les cartes par glisser-déposer. La configuration (visibilité +
// ordre) est mémorisée par client dans le navigateur.
// ============================================================================
import { useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Eye, EyeOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactOnly, formatNombre } from "@/lib/nombres";
import type { OngletReportingId } from "@/lib/reporting/elements";
import { useVisibilite } from "./visibilite";
import { BoutonConfiguration, nbGraphesMasques, type EtatGraphes } from "./graphes-masquables";

/** Définition d'un indicateur : ce qui ne dépend pas des données. */
export interface KpiDef {
  id: string;
  label: string;
  /** Formule de calcul, affichée en italique sous le libellé. */
  formule?: string;
  /** Pastille accolée au libellé (ex. « HT », « TTC », « TG »). */
  tag?: string;
  icon: React.ElementType;
  color: string;
  /** Affiché tant que l'utilisateur n'a rien configuré (défaut : true). */
  visible?: boolean;
}

/** Valeurs d'un indicateur pour la période courante. */
export interface KpiValue {
  valeur: number;
  /** Exercice précédent, affiché sous la valeur quand `labelN1` est fourni. */
  valeurN1?: number;
  labelN1?: string | number;
  /** Aucun reporting en N-1 : « non disponible » au lieu d'un montant. */
  n1Indisponible?: boolean;
  /** Variation N / N-1 en %, affichée en pastille. Omise = pas de pastille. */
  variation?: number;
  /** Formatage spécifique (pourcentage, jours…). Défaut : montant compact. */
  format?: (v: number) => string;
}

interface KpiConfigItem {
  id: string;
  visible: boolean;
  order: number;
}

export function formatPourcent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatJours(value: number): string {
  return `${formatNombre(Math.round(value))} j`;
}

export function VariationBadge({ value }: { value: number }) {
  if (value === 0) {
    return (
      <Badge variant="outline" className="text-gray-500 text-xs">
        <Minus className="w-3 h-3 mr-1" /> 0%
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`text-xs ${
        value > 0 ? "text-green-600 border-green-200" : "text-red-600 border-red-200"
      }`}
    >
      {value > 0 ? (
        <TrendingUp className="w-3 h-3 mr-1" />
      ) : (
        <TrendingDown className="w-3 h-3 mr-1" />
      )}
      {`${value > 0 ? "+" : ""}${value.toFixed(1)}%`}
    </Badge>
  );
}

function defaultConfig(defs: KpiDef[]): KpiConfigItem[] {
  return defs.map((d, i) => ({ id: d.id, visible: d.visible !== false, order: i }));
}

function loadConfig(storageKey: string, defs: KpiDef[]): KpiConfigItem[] {
  const defauts = defaultConfig(defs);
  if (typeof window === "undefined") return defauts;
  try {
    const brut = localStorage.getItem(`kpi-config-${storageKey}`);
    if (!brut) return defauts;
    const enregistre = JSON.parse(brut) as KpiConfigItem[];
    // On repart toujours des définitions : un indicateur ajouté depuis la
    // dernière configuration apparaît, un indicateur retiré disparaît.
    return defauts
      .map((d) => {
        const e = enregistre.find((x) => x.id === d.id);
        return e ? { ...d, visible: e.visible, order: e.order } : d;
      })
      .sort((a, b) => a.order - b.order);
  } catch {
    return defauts;
  }
}

function saveConfig(storageKey: string, items: KpiConfigItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`kpi-config-${storageKey}`, JSON.stringify(items));
  } catch {
    // Stockage indisponible (navigation privée) : la config reste en mémoire.
  }
}

export function KpiGrid({
  storageKey,
  defs,
  values,
  columns = 3,
  actions,
  onglet,
  graphes,
}: {
  /** Identifiant de persistance, unique par onglet et par client. */
  storageKey: string;
  defs: KpiDef[];
  values: Record<string, KpiValue | undefined>;
  /** Cartes par ligne. 3 par défaut ; 2 quand l'onglet n'a que 4 indicateurs. */
  columns?: 2 | 3 | 4;
  /** Boutons placés à côté de « Configurer l'affichage ». */
  actions?: ReactNode;
  /** Graphiques de l'onglet : un seul bouton configure KPI et graphiques. */
  graphes?: EtatGraphes;
  /** Onglet du catalogue : les KPI masqués à ce membre ne sont jamais proposés. */
  onglet?: OngletReportingId;
}) {
  const [config, setConfig] = useState<KpiConfigItem[]>(() => loadConfig(storageKey, defs));
  const [editionLocale, setEditionLocale] = useState(false);
  const editMode = graphes ? graphes.edition : editionLocale;
  const setEditMode = graphes ? graphes.setEdition : setEditionLocale;
  const [dragId, setDragId] = useState<string | null>(null);
  const { estVisible } = useVisibilite();
  const permis = (id: string) => !onglet || estVisible(onglet, "kpi", id);

  const update = (items: KpiConfigItem[]) => {
    const reordonne = items.map((k, i) => ({ ...k, order: i }));
    setConfig(reordonne);
    saveConfig(storageKey, reordonne);
  };
  const toggleVisible = (id: string) =>
    update(config.map((k) => (k.id === id ? { ...k, visible: !k.visible } : k)));
  const onDragOver = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const items = [...config];
    const from = items.findIndex((k) => k.id === dragId);
    const to = items.findIndex((k) => k.id === targetId);
    if (from === -1 || to === -1) return;
    const [deplace] = items.splice(from, 1);
    items.splice(to, 0, deplace);
    update(items);
  };

  // En mode édition, tous les indicateurs sont rendus pour pouvoir les
  // réactiver ; hors édition, seuls ceux cochés sont affichés.
  const cartes = config
    .map((c) => {
      const def = defs.find((d) => d.id === c.id);
      return def ? { def, visible: c.visible } : null;
    })
    .filter((x): x is { def: KpiDef; visible: boolean } => x !== null)
    .filter((x) => permis(x.def.id) && (editMode || x.visible));

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {(defs.some((d) => permis(d.id)) || (graphes?.defs.length ?? 0) > 0) && (
          <BoutonConfiguration
            edition={editMode}
            onClick={() => setEditMode(!editMode)}
            nbMasques={
              config.filter((c) => !c.visible && permis(c.id) && defs.some((d) => d.id === c.id)).length +
              (graphes ? nbGraphesMasques(graphes) : 0)
            }
          />
        )}
        {actions}
      </div>

      <div
        className={cn(
          "grid gap-4",
          columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {cartes.map(({ def, visible }) => {
          const v = values[def.id] ?? { valeur: 0 };
          const fmt = v.format ?? formatCompactOnly;
          const Icon = def.icon;
          const isDragging = dragId === def.id;
          return (
            <div
              key={def.id}
              draggable={editMode}
              onDragStart={() => setDragId(def.id)}
              onDragOver={(e) => onDragOver(e, def.id)}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "transition-all duration-200",
                editMode && "cursor-grab active:cursor-grabbing",
                isDragging && "opacity-50 rotate-2 scale-95",
                !visible && "opacity-40",
              )}
            >
              <Card
                className={cn(
                  "relative overflow-hidden h-full",
                  editMode && "border-dashed border-[#0077C3] ring-1 ring-[#0077C3]/20",
                )}
              >
                {editMode && (
                  <button
                    onClick={() => toggleVisible(def.id)}
                    className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-white border border-[#D0E3F5] text-[#94A3B8] hover:text-[#0077C3] transition-colors"
                    title={visible ? "Masquer" : "Afficher"}
                  >
                    {visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOffIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardDescription className="flex items-center gap-2 text-sm font-medium">
                        {def.label}
                        {def.tag && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {def.tag}
                          </Badge>
                        )}
                      </CardDescription>
                      {def.formule && (
                        <p className="text-xs text-muted-foreground italic mt-1">
                          {def.formule}
                        </p>
                      )}
                    </div>
                    {/* Le bouton œil occupe le coin en mode édition. */}
                    {!editMode && v.variation !== undefined && (
                      <VariationBadge value={v.variation} />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-3xl font-bold truncate",
                          v.valeur < 0 ? "text-red-600" : "text-[#00122E]",
                        )}
                      >
                        {fmt(v.valeur)}
                      </div>
                      {v.labelN1 !== undefined && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {v.labelN1} : {v.n1Indisponible ? "non disponible" : fmt(v.valeurN1 ?? 0)}
                        </p>
                      )}
                    </div>
                    <Icon className={`w-8 h-8 shrink-0 ${def.color}`} />
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
