"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Loader2, Eye, EyeOffIcon, AlertTriangle } from "lucide-react";
import {
  PiCoinsDuotone,
  PiMoneyWavyDuotone,
  PiWalletDuotone,
  PiChartDonutDuotone,
  PiReceiptDuotone,
  PiGearDuotone,
  PiPercentDuotone,
  PiWarningDuotone,
  PiScalesDuotone,
} from "react-icons/pi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ==================== TYPES ====================
interface DetteChartPoint {
  label: string;
  period: string;
  yearMonth: string;
  detteFournisseurNee: number;
  detteFournisseurRemboursee: number;
  detteNeeTotal: number;
  rembourseTotal: number;
  tauxRemboursement: number;
  cumulDetteNeeTotal: number;
  cumulRembourseTotal: number;
  tauxRemboursementCumule: number;
}

interface TopDette {
  label: string;
  montantDette: number;
  montantRembourse: number;
  solde: number;
  pourcentage: number;
}

interface TopDetteFournisseur extends TopDette {
  numeroFournisseur: string;
}

interface DetteKpis {
  dettesFournisseurs: number;
  dettesPersonnel: number;
  dettesSociales: number;
  dettesFiscales: number;
  dettesHAO: number;
  tauxRemboursement: number;
}

interface DetteData {
  endPeriod: string;
  mode: "cumule" | "periodique";
  granularity: "month" | "day";
  kpis: DetteKpis;
  totals: {
    detteNeeTotal: number;
    rembourseTotal: number;
    tauxRemboursement: number;
    soldeDettes: number;
  };
  chartData: DetteChartPoint[];
  topByType: TopDette[];
  topByFournisseur: TopDetteFournisseur[];
}

// ==================== KPI CONFIG ====================
interface DetteKpiItem {
  id: string;
  label: string;
  key: keyof DetteKpis;
  color: string;
  icon: React.ElementType;
  percent?: boolean;
  visible: boolean;
  order: number;
}

const DEFAULT_DETTE_KPIS: DetteKpiItem[] = [
  {
    id: "fournisseurs",
    label: "Dettes fournisseurs",
    key: "dettesFournisseurs",
    color: "text-blue-600",
    icon: PiCoinsDuotone,
    visible: true,
    order: 0,
  },
  {
    id: "sociales",
    label: "Dettes sociales",
    key: "dettesSociales",
    color: "text-orange-600",
    icon: PiMoneyWavyDuotone,
    visible: true,
    order: 1,
  },
  {
    id: "personnel",
    label: "Dettes personnel",
    key: "dettesPersonnel",
    color: "text-fuchsia-500",
    icon: PiWalletDuotone,
    visible: true,
    order: 2,
  },
  {
    id: "fiscales",
    label: "Dettes fiscales",
    key: "dettesFiscales",
    color: "text-indigo-600",
    icon: PiReceiptDuotone,
    visible: true,
    order: 3,
  },
  {
    id: "hao",
    label: "Dettes HAO",
    key: "dettesHAO",
    color: "text-cyan-600",
    icon: PiChartDonutDuotone,
    visible: true,
    order: 4,
  },
  {
    id: "taux",
    label: "Taux de remboursement",
    key: "tauxRemboursement",
    color: "text-violet-600",
    icon: PiPercentDuotone,
    percent: true,
    visible: true,
    order: 5,
  },
];

function loadDetteKpiConfig(clientId: string): DetteKpiItem[] {
  if (typeof window === "undefined") return DEFAULT_DETTE_KPIS;
  try {
    const raw = localStorage.getItem(`kpi-config-dettes-${clientId}`);
    if (!raw) return DEFAULT_DETTE_KPIS;
    const saved = JSON.parse(raw) as Array<{
      id: string;
      visible: boolean;
      order: number;
    }>;
    return DEFAULT_DETTE_KPIS.map((d) => {
      const s = saved.find((x) => x.id === d.id);
      return s ? { ...d, visible: s.visible, order: s.order } : d;
    }).sort((a, b) => a.order - b.order);
  } catch {
    return DEFAULT_DETTE_KPIS;
  }
}

function saveDetteKpiConfig(clientId: string, items: DetteKpiItem[]) {
  if (typeof window === "undefined") return;
  const data = items.map((i) => ({
    id: i.id,
    visible: i.visible,
    order: i.order,
  }));
  localStorage.setItem(`kpi-config-dettes-${clientId}`, JSON.stringify(data));
}

// ==================== HELPERS ====================
function formatCompactOnly(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    const formatted = Math.round(value / 1000)
      .toLocaleString("fr-FR")
      .replace(/ /g, " ");
    return `${formatted}K`;
  }
  return value.toLocaleString("fr-FR").replace(/ /g, " ");
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

interface ClientDettesTabProps {
  clientId: string;
}

export default function ClientDettesTab({ clientId }: ClientDettesTabProps) {
  const [data, setData] = useState<DetteData | null>(null);
  const [loading, setLoading] = useState(true);

  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [month, setMonth] = useState<string>("12");
  // Mode de calcul : cumulé / périodique + granularité mensuelle / journalière.
  const [mode, setMode] = useState<"cumule" | "periodique">("cumule");
  const [granularite, setGranularite] = useState<"mois" | "jour">("mois");

  // Config KPIs (séparée de la synthèse)
  const [kpiItems, setKpiItems] = useState<DetteKpiItem[]>(() =>
    loadDetteKpiConfig(clientId),
  );
  const [kpiEditMode, setKpiEditMode] = useState(false);
  const [kpiDragId, setKpiDragId] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years: string[] = [];
    for (let y = current + 2; y >= current - 10; y--) years.push(y.toString());
    return years;
  }, []);

  useEffect(() => {
    const fetchDettes = async () => {
      setLoading(true);
      try {
        let startMonth: string;
        let endMonth: string;
        let granularity: "month" | "day";
        if (granularite === "jour") {
          // Cumul journalier intra-mois : un seul mois, abscisse = jours.
          startMonth = month;
          endMonth = month;
          granularity = "day";
        } else {
          endMonth = month;
          startMonth = mode === "cumule" ? "01" : month;
          granularity = "month";
        }
        const startPeriod = `${year}-${startMonth}`;
        const endPeriod = `${year}-${endMonth}`;
        const url = `/api/clients/${clientId}/reporting/dettes?endPeriod=${endPeriod}&startPeriod=${startPeriod}&mode=${mode}&granularity=${granularity}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Erreur API Dettes");
        const json = (await res.json()) as DetteData;
        setData(json);
      } catch (error) {
        console.error("Fetch dettes error:", error);
        toast.error("Erreur lors du chargement des données de dettes");
      } finally {
        setLoading(false);
      }
    };
    fetchDettes();
  }, [clientId, year, month, mode, granularite]);

  // ----- KPI config handlers -----
  const updateKpi = (items: DetteKpiItem[]) => {
    const reordered = items.map((k, i) => ({ ...k, order: i }));
    setKpiItems(reordered);
    saveDetteKpiConfig(clientId, reordered);
  };
  const toggleKpiVisible = (id: string) => {
    updateKpi(
      kpiItems.map((k) => (k.id === id ? { ...k, visible: !k.visible } : k)),
    );
  };
  const handleKpiDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!kpiDragId || kpiDragId === targetId) return;
    const items = [...kpiItems];
    const fromIdx = items.findIndex((k) => k.id === kpiDragId);
    const toIdx = items.findIndex((k) => k.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    updateKpi(items);
  };

  const formatKpiValue = (item: DetteKpiItem, value: number) =>
    item.percent ? `${value.toFixed(1)}%` : formatCompactOnly(value);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Aucune donnée de dettes disponible
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barre de filtres — Mode de calcul */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Année
            </span>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[110px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Mois
            </span>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue />
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
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Mode de calcul
            </span>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as "cumule" | "periodique")}
            >
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cumule">Cumulé</SelectItem>
                <SelectItem value="periodique">Périodique</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Granularité
            </span>
            <Select
              value={granularite}
              onValueChange={(v) => setGranularite(v as "mois" | "jour")}
            >
              <SelectTrigger className="w-[170px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mois">Mensuelle</SelectItem>
                <SelectItem value="jour">Journalière (cumul)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs configurables */}
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
          {kpiItems
            .filter((k) => kpiEditMode || k.visible)
            .map((kpi) => {
              const Icon = kpi.icon;
              const value = data.kpis[kpi.key];
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
                    !kpi.visible && "opacity-40",
                  )}
                >
                  <Card
                    className={cn(
                      "relative overflow-hidden",
                      kpiEditMode &&
                        "border-dashed border-[#0077C3] ring-1 ring-[#0077C3]/20",
                    )}
                  >
                    {kpiEditMode && (
                      <button
                        onClick={() => toggleKpiVisible(kpi.id)}
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-white border border-[#D0E3F5] text-[#94A3B8] hover:text-[#0077C3] transition-colors"
                        title={kpi.visible ? "Masquer" : "Afficher"}
                      >
                        {kpi.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOffIcon className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <CardHeader className="pb-2">
                      <CardDescription className="text-sm font-medium">
                        {kpi.label}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-end justify-between gap-2">
                        <div
                          className={cn(
                            "text-3xl font-bold truncate",
                            value < 0 ? "text-red-600" : "text-[#00122E]",
                          )}
                        >
                          {formatKpiValue(kpi, value)}
                        </div>
                        <Icon className={`w-8 h-8 shrink-0 ${kpi.color}`} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
        </div>
      </div>

      {/* Chart 1 — Évolution du taux de remboursement */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution du Taux de Remboursement des Dettes</CardTitle>
          <CardDescription>
            (Remboursements / Dettes nées) × 100 — taux cumulé et périodique
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              tauxRemboursementCumule: {
                label: "Taux cumulé",
                color: "hsl(262, 83%, 58%)",
              },
              tauxRemboursement: {
                label: "Taux périodique",
                color: "hsl(262, 83%, 78%)",
              },
            }}
            className="h-[400px] w-full"
          >
            <LineChart
              data={data.chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value.toFixed(0)}%`}
                fontSize={12}
                domain={[0, "auto"]}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      `${(value as number).toFixed(1)}%`,
                      name === "Taux cumulé" ? "Taux cumulé" : "Taux périodique",
                    ]}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="tauxRemboursementCumule"
                name="Taux cumulé"
                stroke="hsl(262, 83%, 58%)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="tauxRemboursement"
                name="Taux périodique"
                stroke="hsl(262, 83%, 78%)"
                strokeWidth={2}
                dot={{ r: 3 }}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Chart 2 — Dette fournisseurs vs dettes fournisseurs remboursées */}
      <Card>
        <CardHeader>
          <CardTitle>
            Dette Fournisseurs vs Dettes Fournisseurs Remboursées
          </CardTitle>
          <CardDescription>
            Dettes fournisseurs nées (crédit DJ) vs remboursées (débit DJ)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              detteFournisseurNee: {
                label: "Dette fournisseurs",
                color: "hsl(221, 83%, 53%)",
              },
              detteFournisseurRemboursee: {
                label: "Dette remboursée",
                color: "hsl(142, 76%, 36%)",
              },
            }}
            className="h-[350px] w-full"
          >
            <BarChart
              data={data.chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                fontSize={12}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      formatCompactOnly(value as number),
                      name === "detteFournisseurNee"
                        ? "Dette fournisseurs"
                        : "Dette remboursée",
                    ]}
                  />
                }
              />
              <Bar
                dataKey="detteFournisseurNee"
                name="detteFournisseurNee"
                fill="hsl(221, 83%, 53%)"
                barSize={24}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="detteFournisseurRemboursee"
                name="detteFournisseurRemboursee"
                fill="hsl(142, 76%, 36%)"
                barSize={24}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Tableau Top — par type de dette */}
      <DetteTable
        title="Analyse des Dettes par Type — Top 10"
        description="Dettes regroupées par type (Solde = Dette − Remboursé)"
        firstColLabel="Type de dette"
        icon={<PiScalesDuotone className="w-5 h-5 text-orange-500" />}
        rows={data.topByType}
      />

      {/* Tableau Top — par fournisseur */}
      <DetteTable
        title="Analyse des Dettes par Fournisseur — Top 10"
        description="Fournisseurs avec les dettes les plus élevées (DJ)"
        firstColLabel="Fournisseur"
        icon={<PiWarningDuotone className="w-5 h-5 text-orange-500" />}
        rows={data.topByFournisseur}
        getSubLabel={(r) =>
          (r as TopDetteFournisseur).numeroFournisseur ?? undefined
        }
      />
    </div>
  );
}

// ==================== TABLEAU GÉNÉRIQUE TOP DETTES ====================
function DetteTable({
  title,
  description,
  firstColLabel,
  icon,
  rows,
  getSubLabel,
}: {
  title: string;
  description: string;
  firstColLabel: string;
  icon: React.ReactNode;
  rows: TopDette[];
  getSubLabel?: (row: TopDette) => string | undefined;
}) {
  const totalDette = rows.reduce((s, r) => s + r.montantDette, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-3">{firstColLabel}</div>
              <div className="col-span-2 text-right">Montant dette</div>
              <div className="col-span-2 text-right">Montant remboursé</div>
              <div className="col-span-2 text-right">Solde</div>
              <div className="col-span-2 text-right">%</div>
            </div>
            {rows.map((row, index) => {
              const sub = getSubLabel?.(row);
              return (
                <div
                  key={`${row.label}-${index}`}
                  className={cn(
                    "grid grid-cols-12 gap-4 p-3 text-sm items-center",
                    index % 2 === 0 ? "bg-background" : "bg-muted/20",
                  )}
                >
                  <div className="col-span-1">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                        index === 0 && "bg-orange-100 text-orange-700",
                        index === 1 && "bg-orange-50 text-orange-600",
                        index === 2 && "bg-amber-50 text-amber-600",
                        index > 2 && "bg-gray-100 text-gray-600",
                      )}
                    >
                      {index + 1}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <div className="font-medium truncate">{row.label}</div>
                    {sub && (
                      <div className="text-xs text-muted-foreground">{sub}</div>
                    )}
                  </div>
                  <div className="col-span-2 text-right font-medium text-blue-600">
                    {formatCompactOnly(row.montantDette)}
                  </div>
                  <div className="col-span-2 text-right font-medium text-green-600">
                    {formatCompactOnly(row.montantRembourse)}
                  </div>
                  <div className="col-span-2 text-right font-bold text-orange-600">
                    {formatCompactOnly(row.solde)}
                  </div>
                  <div className="col-span-2 text-right">
                    <Badge variant="outline" className="text-xs">
                      {row.pourcentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted font-medium text-sm border-t">
              <div className="col-span-1"></div>
              <div className="col-span-3">Total Top 10</div>
              <div className="col-span-2 text-right font-bold text-blue-600">
                {formatCompactOnly(totalDette)}
              </div>
              <div className="col-span-2 text-right"></div>
              <div className="col-span-2 text-right"></div>
              <div className="col-span-2 text-right"></div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mb-2 opacity-20" />
            <p>Aucune dette disponible</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
