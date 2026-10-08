"use client";

// ============================================================================
// Onglet « Trésorerie » — KPI par rubrique BS… et détail par compte.
// Reprend la barre de filtres, les cartes KPI et l'histogramme horizontal
// déjà utilisés dans les autres onglets de reporting.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import type { DragEvent } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  EyeOffIcon,
} from "lucide-react";
import {
  PiWalletDuotone,
  PiCoinsDuotone,
  PiBankDuotone,
  PiHandCoinsDuotone,
  PiBuildingsDuotone,
  PiChartDonutDuotone,
  PiDeviceMobileDuotone,
  PiCertificateDuotone,
  PiGearDuotone,
} from "react-icons/pi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCompactOnly } from "./dette-table";
import {
  TRESORERIE_KPIS,
  formuleTresorerie,
  type TresorerieKpiDef,
} from "@/lib/reporting/tresorerie";

type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientTresorerieTabProps {
  clientId: string;
  year: string;
  setYear: (y: string) => void;
  periodType: PeriodType;
  setPeriodType: (p: PeriodType) => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  cumulGranularity: "mois" | "annee";
  setCumulGranularity: (g: "mois" | "annee") => void;
}

interface KpiValeur {
  valeurN: number;
  valeurN1: number;
  variation: number;
}
interface CompteTreso {
  compte: string;
  intituleCompte: string;
  montantN: number;
  montantN1: number;
  variation: number;
}
interface TresorerieData {
  yearN: number;
  yearN1: number;
  availableYears: number[];
  kpis: Record<string, KpiValeur>;
  comptes: CompteTreso[];
}

const MONTHS = [
  { value: "01", label: "Janvier" },
  { value: "02", label: "Février" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" },
  { value: "08", label: "Août" },
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
];

// Icône et couleur par indicateur (même palette duotone que les autres onglets).
const HABILLAGE: Record<string, { icon: React.ElementType; color: string }> = {
  total: { icon: PiWalletDuotone, color: "text-[#0077C3]" },
  caisse: { icon: PiCoinsDuotone, color: "text-blue-600" },
  banque: { icon: PiBankDuotone, color: "text-cyan-600" },
  regies: { icon: PiHandCoinsDuotone, color: "text-fuchsia-500" },
  etablissementsFinanciers: { icon: PiBuildingsDuotone, color: "text-indigo-600" },
  instrumentsTresorerie: { icon: PiChartDonutDuotone, color: "text-orange-600" },
  monnaieElectronique: { icon: PiDeviceMobileDuotone, color: "text-emerald-600" },
  accreditifs: { icon: PiCertificateDuotone, color: "text-rose-600" },
};

// Configuration des KPI propre à l'onglet : visibilité et ordre, mémorisés
// par client. Les indicateurs masqués par défaut (monnaie électronique,
// accréditifs) restent accessibles via « Configurer les KPIs ».
interface TresorerieKpiItem {
  id: string;
  visible: boolean;
  order: number;
}

const DEFAULT_KPI_CONFIG: TresorerieKpiItem[] = TRESORERIE_KPIS.map((k, i) => ({
  id: k.id,
  visible: k.visible,
  order: i,
}));

function loadKpiConfig(clientId: string): TresorerieKpiItem[] {
  if (typeof window === "undefined") return DEFAULT_KPI_CONFIG;
  try {
    const brut = localStorage.getItem(`kpi-config-tresorerie-${clientId}`);
    if (!brut) return DEFAULT_KPI_CONFIG;
    const enregistre = JSON.parse(brut) as TresorerieKpiItem[];
    return DEFAULT_KPI_CONFIG.map((d) => {
      const e = enregistre.find((x) => x.id === d.id);
      return e ? { ...d, visible: e.visible, order: e.order } : d;
    }).sort((a, b) => a.order - b.order);
  } catch {
    return DEFAULT_KPI_CONFIG;
  }
}

function saveKpiConfig(clientId: string, items: TresorerieKpiItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`kpi-config-tresorerie-${clientId}`, JSON.stringify(items));
  } catch {
    // Stockage indisponible (navigation privée) : la config reste en mémoire.
  }
}

const chartConfigTresorerie: ChartConfig = {
  montantN: { label: "Année N", color: "hsl(221, 83%, 53%)" },
  montantN1: { label: "Année N-1", color: "hsl(221, 83%, 73%)" },
};

function formatVariation(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function VariationBadge({ value }: { value: number }) {
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
      {formatVariation(value)}
    </Badge>
  );
}

function LegendLine({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="120" height="4" viewBox="0 0 199 3" fill="none" aria-hidden preserveAspectRatio="none">
      <path
        d="M1.5 1.5H197.5"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={dashed ? "6 6" : undefined}
      />
    </svg>
  );
}

export default function ClientTresorerieTab({
  clientId,
  year,
  setYear,
  periodType,
  setPeriodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
  setCumulGranularity,
}: ClientTresorerieTabProps) {
  const [data, setData] = useState<TresorerieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpiConfig, setKpiConfig] = useState<TresorerieKpiItem[]>(() =>
    loadKpiConfig(clientId),
  );
  const [kpiEditMode, setKpiEditMode] = useState(false);
  const [kpiDragId, setKpiDragId] = useState<string | null>(null);

  const updateKpiConfig = (items: TresorerieKpiItem[]) => {
    const reordonne = items.map((k, i) => ({ ...k, order: i }));
    setKpiConfig(reordonne);
    saveKpiConfig(clientId, reordonne);
  };
  const toggleKpiVisible = (id: string) =>
    updateKpiConfig(
      kpiConfig.map((k) => (k.id === id ? { ...k, visible: !k.visible } : k)),
    );
  const handleKpiDragOver = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (!kpiDragId || kpiDragId === targetId) return;
    const items = [...kpiConfig];
    const from = items.findIndex((k) => k.id === kpiDragId);
    const to = items.findIndex((k) => k.id === targetId);
    if (from === -1 || to === -1) return;
    const [deplace] = items.splice(from, 1);
    items.splice(to, 0, deplace);
    updateKpiConfig(items);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        `/api/clients/${clientId}/reporting/tresorerie` +
        `?year=${year}&periodType=${periodType}&month=${selectedMonth}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur API Trésorerie");
      setData((await res.json()) as TresorerieData);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement de la trésorerie");
    } finally {
      setLoading(false);
    }
  }, [clientId, year, periodType, selectedMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label ?? "Décembre";
  const cumule = periodType === "ytd" || periodType === "ytd-day";
  const periodLabel = cumule
    ? `Janvier - ${monthLabel} ${year}`
    : periodType === "year"
      ? `Janvier - Décembre ${year}`
      : `${monthLabel} ${year}`;

  const filtres = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
        <span className="text-xs text-[#335890]">Mode calcul :</span>
        <Select
          value={cumule ? "cumule" : "periodique"}
          onValueChange={(v: string) => {
            if (v === "cumule") {
              setPeriodType(cumulGranularity === "annee" ? "ytd" : "ytd-day");
              if (cumulGranularity === "annee") setSelectedMonth("12");
            } else {
              setPeriodType(cumulGranularity === "annee" ? "year" : "month");
            }
          }}
        >
          <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[90px] font-semibold text-[#00122E]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="periodique">Périodique</SelectItem>
            <SelectItem value="cumule">Cumulé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
        <span className="text-xs text-[#335890]">Année :</span>
        <span className="font-semibold text-[#00122E]">{year}</span>
        <div className="flex gap-1 ml-1">
          <button
            title="Année précédente"
            onClick={() => setYear(String(parseInt(year, 10) - 1))}
            className="text-[#94A3B8] hover:text-[#0077C3]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            title="Année suivante"
            onClick={() => setYear(String(parseInt(year, 10) + 1))}
            className="text-[#94A3B8] hover:text-[#0077C3]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
        <span className="text-xs text-[#335890]">Granularité :</span>
        {cumule ? (
          <Select
            value={cumulGranularity}
            onValueChange={(v: string) => {
              const g = v as "mois" | "annee";
              setCumulGranularity(g);
              if (g === "annee") {
                setPeriodType("ytd");
                setSelectedMonth("12");
              } else {
                setPeriodType("ytd-day");
              }
            }}
          >
            <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mois">Mois</SelectItem>
              <SelectItem value="annee">Année</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Select
            value={periodType === "month" ? "month" : "year"}
            onValueChange={(v: string) => setPeriodType(v as PeriodType)}
          >
            <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="year">Année</SelectItem>
              <SelectItem value="month">Mois</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {(periodType === "ytd-day" || periodType === "month") && (
        <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
          <span className="text-xs text-[#335890]">Mois :</span>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E]">
              <SelectValue placeholder="Mois" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2 bg-[#F5F9FF] rounded-lg px-4 h-10 text-xs text-[#335890]">
        <CalendarRange className="w-3.5 h-3.5 text-[#0077C3]" />
        <span>{periodLabel}</span>
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {filtres}
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        {filtres}
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mb-2 opacity-30" />
          <p>Aucune donnée de trésorerie</p>
        </div>
      </div>
    );
  }

  // En mode édition, tous les indicateurs sont rendus pour pouvoir les
  // réactiver ; hors édition, seuls ceux cochés sont affichés.
  const kpis = kpiConfig
    .map((c) => {
      const def = TRESORERIE_KPIS.find((k) => k.id === c.id);
      return def ? { def, visible: c.visible } : null;
    })
    .filter((x): x is { def: TresorerieKpiDef; visible: boolean } => x !== null)
    .filter((x) => kpiEditMode || x.visible);
  // Libellé d'axe « 571100 - Caisse Siège » : numéro et intitulé du compte.
  const comptesChart = data.comptes.map((c) => ({
    ...c,
    libelleAxe: `${c.compte} - ${c.intituleCompte}`,
  }));
  // Hauteur dynamique : 70px par compte, comme l'histogramme « Produits par Nature ».
  const chartHeight = Math.max(data.comptes.length * 70 + 40, 200);
  const totalN = data.comptes.reduce((s, c) => s + c.montantN, 0);
  const totalN1 = data.comptes.reduce((s, c) => s + c.montantN1, 0);

  return (
    <div className="space-y-6">
      {filtres}

      <div>
        <h1 className="text-3xl font-bold text-[#00122E]">Trésorerie</h1>
        <p className="text-sm text-[#335890] italic mt-1">
          Soldes de trésorerie — {periodLabel.toLowerCase()}, comparés à {data.yearN1}.
        </p>
      </div>

      {/* KPI — grille 3 colonnes, formule de calcul et rappel de l'exercice N-1.
          « Configurer les KPIs » donne accès aux indicateurs masqués par
          défaut et permet de réordonner les cartes par glisser-déposer. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setKpiEditMode(!kpiEditMode)}
            className={cn(
              "gap-2 h-9 rounded-lg transition-colors",
              kpiEditMode
                ? "bg-[#0077C3] text-white border-[#0077C3] hover:bg-[#005992]"
                : "border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF]",
            )}
          >
            <PiGearDuotone className="w-4 h-4" />
            {kpiEditMode ? "Terminer" : "Configurer les KPIs"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {kpis.map(({ def: kpi, visible }) => {
            const v = data.kpis[kpi.id] ?? { valeurN: 0, valeurN1: 0, variation: 0 };
            const hab = HABILLAGE[kpi.id] ?? { icon: PiWalletDuotone, color: "text-[#0077C3]" };
            const Icon = hab.icon;
            const isDragging = kpiDragId === kpi.id;
            return (
              <div
                key={kpi.id}
                draggable={kpiEditMode}
                onDragStart={() => setKpiDragId(kpi.id)}
                onDragOver={(e) => handleKpiDragOver(e, kpi.id)}
                onDragEnd={() => setKpiDragId(null)}
                className={cn(
                  "transition-all duration-200",
                  kpiEditMode && "cursor-grab active:cursor-grabbing",
                  isDragging && "opacity-50 rotate-2 scale-95",
                  !visible && "opacity-40",
                )}
              >
              <Card
                className={cn(
                  "relative overflow-hidden h-full",
                  kpiEditMode && "border-dashed border-[#0077C3] ring-1 ring-[#0077C3]/20",
                )}
              >
                {kpiEditMode && (
                  <button
                    onClick={() => toggleKpiVisible(kpi.id)}
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
                      <CardDescription className="text-sm font-medium">
                        {kpi.label}
                      </CardDescription>
                      <p className="text-xs text-muted-foreground italic mt-1">
                        {formuleTresorerie(kpi)}
                      </p>
                    </div>
                    {!kpiEditMode && <VariationBadge value={v.variation} />}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-3xl font-bold truncate",
                          v.valeurN < 0 ? "text-red-600" : "text-[#00122E]",
                        )}
                      >
                        {formatCompactOnly(v.valeurN)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {data.yearN1} : {formatCompactOnly(v.valeurN1)}
                      </p>
                    </div>
                    <Icon className={`w-8 h-8 shrink-0 ${hab.color}`} />
                  </div>
                </CardContent>
              </Card>
              </div>
            );
          })}
        </div>
      </div>

      {/* Histogramme horizontal — détail par compte de trésorerie. */}
      {data.comptes.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Trésorerie par comptes</CardTitle>
              <CardDescription>
                Soldes des comptes (rubriques BSA, BSB, BSC, BSD, BSE, BSF, BSG) —{" "}
                {data.yearN} vs {data.yearN1}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-base font-semibold text-[#335890]">Légende</span>
              <div className="flex items-center gap-3">
                <LegendLine color="#2463eb" />
                <span className="text-base font-medium" style={{ color: "#2463eb" }}>
                  {data.yearN}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <LegendLine color="#81a5f3" />
                <span className="text-base font-medium" style={{ color: "#81a5f3" }}>
                  {data.yearN1}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfigTresorerie}
              className="w-full"
              style={{ height: `${chartHeight}px` }}
            >
              <BarChart
                data={comptesChart}
                layout="vertical"
                margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(value) => {
                    const absVal = Math.abs(value);
                    if (absVal >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
                    if (absVal >= 1000) return `${(value / 1000).toFixed(0)}K`;
                    return value.toString();
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="libelleAxe"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={180}
                  tick={{ fill: "hsl(var(--foreground))" }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => [
                        formatCompactOnly(value as number),
                        name === `${data.yearN1}`
                          ? `Solde ${data.yearN1}`
                          : `Solde ${data.yearN}`,
                      ]}
                    />
                  }
                />
                <Bar
                  dataKey="montantN1"
                  name={`${data.yearN1}`}
                  fill="hsl(221, 83%, 73%)"
                  barSize={18}
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="montantN"
                  name={`${data.yearN}`}
                  fill="hsl(221, 83%, 53%)"
                  barSize={18}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>

            {/* Tableau récapitulatif sous le graphique */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Compte</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">
                      {data.yearN}
                    </th>
                    <th className="text-right py-2 font-medium text-muted-foreground">
                      {data.yearN1}
                    </th>
                    <th className="text-right py-2 font-medium text-muted-foreground">
                      Variation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.comptes.map((c) => (
                    <tr key={c.compte} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {c.compte}
                          </span>
                          <span className="font-medium">{c.intituleCompte}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 font-semibold">
                        {formatCompactOnly(c.montantN)}
                      </td>
                      <td className="text-right py-2.5 text-muted-foreground">
                        {formatCompactOnly(c.montantN1)}
                      </td>
                      <td className="text-right py-2.5">
                        <VariationBadge value={c.variation} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold">
                    <td className="py-2.5">Total Trésorerie</td>
                    <td className="text-right py-2.5 text-blue-600">
                      {formatCompactOnly(totalN)}
                    </td>
                    <td className="text-right py-2.5 text-muted-foreground">
                      {formatCompactOnly(totalN1)}
                    </td>
                    <td className="text-right py-2.5">
                      <VariationBadge
                        value={
                          totalN1 !== 0
                            ? ((totalN - totalN1) / Math.abs(totalN1)) * 100
                            : totalN !== 0
                              ? 100
                              : 0
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
