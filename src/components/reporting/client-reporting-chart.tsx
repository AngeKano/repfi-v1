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
  ChartConfig,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  EyeOff,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Users,
  Activity,
  Wallet,
  PiggyBank,
  ShoppingCart,
  Calendar,
  CalendarDays,
  CalendarRange,
  Receipt,
  BarChart3,
  Settings2,
  Eye,
  EyeOffIcon,
  ArrowUp,
  ArrowDown,
  LayoutDashboard,
  LineChartIcon,
  PieChart,
  ChevronDown,
  Percent,
  Building2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DataPoint {
  label: string;
  period: string;
  periodNumber: string;
  charges: number;
  produits: number;
  resultat: number;
  cumulativeBalance: number;
  nbTransactions: number;
  chiffreAffaires: number;
  chiffreAffairesN1: number;
  soldeTresorerie: number;
  soldeTresorerieN1: number;
  margeCommerciale: number;
  margeCommercialeN1: number;
  tauxRecouvrement: number;
  tauxRecouvrementN1: number;
  caTTCTotal: number;
  caEncaisseTTC: number;
}

interface Period {
  batch_id: string;
  id?: string;
  periodStart?: string;
  periodEnd?: string;
  status: string;
  excelFileUrl?: string;
  charges: number;
  produits: number;
  nb_transactions: number;
}

interface IndicateursFinanciers {
  chiffreAffaires: number;
  masseSalariale: number;
  resultatExploitation: number;
  resultatNet: number;
  soldeTresorerie: number;
  margeCommerciale: number;
  valeurAjoutee: number;
  ebe: number;
  resultatFinancier: number;
  resultatHAO: number;
  tauxRecouvrement: number;
  caTTCTotal: number;
  caEncaisseTTC: number;
}

interface Variations {
  chiffreAffaires: number;
  masseSalariale: number;
  resultatExploitation: number;
  resultatNet: number;
  soldeTresorerie: number;
  margeCommerciale: number;
  valeurAjoutee: number;
  ebe: number;
  resultatFinancier: number;
  resultatHAO: number;
  tauxRecouvrement: number;
}

interface TopClient {
  numeroClient: string;
  nomClient: string;
  montantCA: number;
  pourcentageCA: number;
}

interface ReportingData {
  client: { id: string; name: string };
  year: string;
  yearN1: string;
  periodType: string;
  selectedMonth: string | null;
  availableYears: string[];
  chartData: DataPoint[];
  periods: Period[];
  totals: {
    totalCharges: number;
    totalProduits: number;
    totalTransactions: number;
    resultat: number;
  };
  indicateurs: {
    anneeN: IndicateursFinanciers;
    anneeN1: IndicateursFinanciers;
    variations: Variations;
  };
  topClients: TopClient[];
}

type PeriodType = "year" | "month" | "ytd";
type TabId = "synthese" | "chiffre-affaires" | "resultat" | "recouvrement";

interface TunnelMetric {
  id: string;
  label: string;
  key: keyof IndicateursFinanciers;
  visible: boolean;
  order: number;
}

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
  subItems?: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "synthese",
    label: "Synthèse financière",
    icon: LayoutDashboard,
    subItems: [
      // "CA",
      // "Masse Salariale",
      // "Résultat d'exploitation",
      // "Résultat net",
      // "Trésorerie",
      // "Évolution trésorerie",
      // "Tunnel de rentabilité",
    ],
  },
  {
    id: "chiffre-affaires",
    label: "Chiffre d'affaires",
    icon: LineChartIcon,
    // subItems: ["Évolution du CA"],
    subItems: [],
  },
  {
    id: "resultat",
    label: "Résultat",
    icon: PieChart,
    // subItems: ["Tunnel de rentabilité"],
    subItems: [],
  },
  {
    id: "recouvrement",
    label: "Recouvrement",
    icon: Percent,
    subItems: [],
  },
];

const INITIAL_TUNNEL_METRICS: TunnelMetric[] = [
  {
    id: "ca",
    label: "Chiffre d'affaires",
    key: "chiffreAffaires",
    visible: true,
    order: 0,
  },
  {
    id: "marge",
    label: "Marge Commerciale",
    key: "margeCommerciale",
    visible: true,
    order: 1,
  },
  {
    id: "va",
    label: "Valeur Ajoutée",
    key: "valeurAjoutee",
    visible: true,
    order: 2,
  },
  {
    id: "rex",
    label: "Résultat Exploitation",
    key: "resultatExploitation",
    visible: true,
    order: 3,
  },
  {
    id: "rf",
    label: "Résultat Financier",
    key: "resultatFinancier",
    visible: true,
    order: 4,
  },
  {
    id: "rhao",
    label: "Résultat HAO",
    key: "resultatHAO",
    visible: true,
    order: 5,
  },
  {
    id: "rn",
    label: "Résultat Net",
    key: "resultatNet",
    visible: true,
    order: 6,
  },
];

const chartConfigFlux: ChartConfig = {
  produits: { label: "Produits", color: "hsl(142, 76%, 36%)" },
  charges: { label: "Charges", color: "hsl(0, 84%, 60%)" },
};

const chartConfigCA: ChartConfig = {
  chiffreAffaires: { label: "CA N", color: "hsl(221, 83%, 53%)" },
  chiffreAffairesN1: { label: "CA N-1", color: "hsl(221, 83%, 73%)" },
};

const chartConfigTresorerie: ChartConfig = {
  soldeTresorerie: { label: "Trésorerie N", color: "hsl(174, 72%, 46%)" },
  soldeTresorerieN1: { label: "Trésorerie N-1", color: "hsl(174, 72%, 66%)" },
};


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

export default function ClientReportingChart({
  clientId,
}: {
  clientId: string;
}) {
  const [data, setData] = useState<ReportingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [periodType, setPeriodType] = useState<PeriodType>("year");
  const [selectedMonth, setSelectedMonth] = useState<string>("12");
  const [hiddenPeriods, setHiddenPeriods] = useState<Set<string>>(new Set());
  const [tunnelMetrics, setTunnelMetrics] = useState<TunnelMetric[]>(
    INITIAL_TUNNEL_METRICS
  );
  const [activeTab, setActiveTab] = useState<TabId>("synthese");
  const [expandedNav, setExpandedNav] = useState<Set<TabId>>(
    new Set(["synthese"])
  );

  // États spécifiques au recouvrement
  const [recouvrementData, setRecouvrementData] = useState<{
    chartData: Array<{
      label: string;
      period: string;
      yearMonth: string;
      caTTCTotal: number;
      caEncaisseTTC: number;
      tauxRecouvrement: number;
      cumulativeCaTTC: number;
      cumulativeCaEncaisse: number;
      tauxRecouvrementCumule: number;
    }>;
    totals: {
      caTTCTotal: number;
      caEncaisseTTC: number;
      tauxRecouvrement: number;
    };
    periodRange: {
      start: { year: number; month: number; label: string };
      end: { year: number; month: number; label: string };
    };
  } | null>(null);

  // Sélecteurs mois et année pour le recouvrement (choix libre)
  const [recouvrementMonth, setRecouvrementMonth] = useState<string>(() => {
    const now = new Date();
    return (now.getMonth() + 1).toString().padStart(2, "0");
  });
  const [recouvrementYear, setRecouvrementYear] = useState<string>(() => {
    return new Date().getFullYear().toString();
  });
  const [recouvrementLoading, setRecouvrementLoading] = useState(false);

  // Générer la liste des années disponibles (5 ans en arrière, 2 ans en avant)
  const recouvrementYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: string[] = [];
    for (let y = currentYear + 2; y >= currentYear - 10; y--) {
      years.push(y.toString());
    }
    return years;
  }, []);

  useEffect(() => {
    fetchData();
  }, [clientId, year, periodType, selectedMonth]);

  // Charger les données de recouvrement quand l'onglet est actif ou quand le mois/année change
  useEffect(() => {
    if (activeTab === "recouvrement") {
      fetchRecouvrementData();
    }
  }, [clientId, activeTab, recouvrementMonth, recouvrementYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/clients/${clientId}/reporting?year=${year}&periodType=${periodType}`;
      if ((periodType === "month" || periodType === "ytd") && selectedMonth) {
        url += `&month=${selectedMonth}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur API");
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const fetchRecouvrementData = async () => {
    setRecouvrementLoading(true);
    try {
      const endPeriod = `${recouvrementYear}-${recouvrementMonth}`;
      const url = `/api/clients/${clientId}/reporting/recouvrement?endPeriod=${endPeriod}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur API Recouvrement");
      const json = await res.json();
      setRecouvrementData(json);
    } catch (error) {
      console.error("Fetch recouvrement error:", error);
      toast.error("Erreur lors du chargement des données de recouvrement");
    } finally {
      setRecouvrementLoading(false);
    }
  };

  const handleYearChange = (direction: "prev" | "next") => {
    if (!data?.availableYears) return;
    const currentIndex = data.availableYears.indexOf(year);
    if (direction === "prev" && currentIndex < data.availableYears.length - 1) {
      setYear(data.availableYears[currentIndex + 1]);
    } else if (direction === "next" && currentIndex > 0) {
      setYear(data.availableYears[currentIndex - 1]);
    }
  };

  const handleDeletePeriod = async (period: Period) => {
    if (!period.id) {
      toast.error("ID de période manquant");
      return;
    }
    if (!confirm(`Supprimer cette période ?`)) return;
    try {
      const res = await fetch(`/api/files/comptable/periods/${period.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erreur suppression");
      toast.success("Période supprimée");
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleHidePeriod = (periodId: string) => {
    setHiddenPeriods((prev) => {
      const next = new Set(prev);
      next.has(periodId) ? next.delete(periodId) : next.add(periodId);
      return next;
    });
  };

  const handleDownloadExcel = async (period: Period) => {
    if (!period.id) {
      toast.error("ID de période manquant");
      return;
    }
    try {
      const res = await fetch(`/api/files/download/${period.id}`);
      const json = await res.json();
      if (json.url) {
        window.open(json.url, "_blank");
      } else {
        throw new Error("URL non disponible");
      }
    } catch (error) {
      toast.error("Erreur lors du téléchargement");
    }
  };

  const toggleMetricVisibility = (id: string) => {
    setTunnelMetrics((prev) =>
      prev.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m))
    );
  };

  const moveMetric = (id: string, direction: "up" | "down") => {
    setTunnelMetrics((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((m) => m.id === id);
      if (index === -1) return prev;

      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sorted.length) return prev;

      const newSorted = [...sorted];
      [newSorted[index], newSorted[newIndex]] = [
        newSorted[newIndex],
        newSorted[index],
      ];

      return newSorted.map((m, i) => ({ ...m, order: i }));
    });
  };

  const toggleNavExpand = (id: TabId) => {
    setExpandedNav((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompact = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000000) {
      return `${(value / 1000000000).toFixed(2)}Md`;
    }
    if (absValue >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    }
    if (absValue >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toFixed(0);
  };

  const formatCompactOnly = (value: number): string => {
    const absValue = Math.abs(value);

    if (absValue >= 1000) {
      // Ajoute des espaces pour les milliers avant d'ajouter le "K"
      const formatted = Math.round(value / 1000)
        .toLocaleString("fr-FR")
        .replace(/\u00A0/g, " ");
      return `${formatted}K`;
    }
    // Ajoute simplement l'espace pour les milliers si nécessaire
    return value.toLocaleString("fr-FR").replace(/\u00A0/g, " ");
  };

  const formatVariation = (value: number): string => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  const formatPeriodLabel = (
    periodStart?: string,
    periodEnd?: string
  ): string => {
    if (!periodStart || !periodEnd) return "Période";
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const months = [
      "Janvier",
      "Février",
      "Mars",
      "Avril",
      "Mai",
      "Juin",
      "Juillet",
      "Août",
      "Septembre",
      "Octobre",
      "Novembre",
      "Décembre",
    ];
    const startMonth = months[start.getMonth()];
    const endMonth = months[end.getMonth()];
    const yearStr = start.getFullYear();
    if (start.getMonth() === end.getMonth()) return `${startMonth} ${yearStr}`;
    return `${startMonth} - ${endMonth} ${yearStr}`;
  };

  const getPeriodLabel = (): string => {
    if (periodType === "year") return `Année ${year}`;
    if (periodType === "month") {
      const month = MONTHS.find((m) => m.value === selectedMonth);
      return `${month?.label || ""} ${year}`;
    }
    if (periodType === "ytd") {
      const month = MONTHS.find((m) => m.value === selectedMonth);
      return `Janvier - ${month?.label || ""} ${year}`;
    }
    return year;
  };

  const getXAxisLabel = (): string => {
    return periodType === "month" ? "Jour" : "Mois";
  };

  const VariationBadge = ({ value }: { value: number }) => {
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
          value > 0
            ? "text-green-600 border-green-200"
            : "text-red-600 border-red-200"
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
  };

  const visibleChartData = useMemo(() => {
    if (!data) return [];
    return data.chartData.filter((d) => !hiddenPeriods.has(d.period));
  }, [data, hiddenPeriods]);

  const tunnelData = useMemo(() => {
    if (!data) return [];

    const ca = data.indicateurs.anneeN.chiffreAffaires;
    const sortedMetrics = [...tunnelMetrics]
      .filter((m) => m.visible)
      .sort((a, b) => a.order - b.order);

    return sortedMetrics.map((metric) => {
      const value = data.indicateurs.anneeN[metric.key];
      const percentage = ca !== 0 ? (value / ca) * 100 : 0;

      return {
        id: metric.id,
        name: metric.label,
        value,
        percentage,
      };
    });
  }, [data, tunnelMetrics]);

  const maxAbsValue = useMemo(() => {
    if (tunnelData.length === 0) return 0;
    return Math.max(...tunnelData.map((d) => Math.abs(d.value)));
  }, [tunnelData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.chartData.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">
            Aucune donnée disponible pour {year}
          </p>
        </CardContent>
      </Card>
    );
  }

  const yearN = parseInt(year);
  const yearN1 = yearN - 1;

  // Composant Tunnel de rentabilité
  const TunnelRentabilite = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tunnel de rentabilité</CardTitle>
            <CardDescription>
              Décomposition du résultat - Base 100% = Chiffre d&apos;affaires
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="w-4 h-4" />
                Configurer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {[...tunnelMetrics]
                .sort((a, b) => a.order - b.order)
                .map((metric, index) => (
                  <div
                    key={metric.id}
                    className="flex items-center gap-2 px-2 py-1.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        onClick={() => moveMetric(metric.id, "up")}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        onClick={() => moveMetric(metric.id, "down")}
                        disabled={index === tunnelMetrics.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleMetricVisibility(metric.id)}
                    >
                      {metric.visible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOffIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <span
                      className={`text-sm flex-1 ${
                        !metric.visible ? "text-muted-foreground" : ""
                      }`}
                    >
                      {metric.label}
                    </span>
                  </div>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tunnelData.map((item) => {
            const barWidth =
              maxAbsValue !== 0 ? (Math.abs(item.value) / maxAbsValue) * 50 : 0;
            const isPositive = item.value >= 0;

            return (
              <div key={item.id} className="flex items-center gap-4">
                <div className="w-44 text-sm font-medium text-right shrink-0">
                  {item.name}
                </div>
                <div className="flex-1 flex items-center h-9">
                  <div className="w-1/2 flex justify-end pr-1">
                    {!isPositive && (
                      <div
                        className="h-7 rounded-l-md transition-all duration-500 ease-out flex items-center justify-end pr-2"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: "hsl(0, 84%, 60%)",
                          minWidth: item.value !== 0 ? "40px" : "0",
                        }}
                      >
                        <span className="text-xs font-semibold text-white whitespace-nowrap">
                          {formatCompactOnly(item.value)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="w-0.5 h-9 bg-gray-300 shrink-0" />
                  <div className="w-1/2 flex justify-start pl-1">
                    {isPositive && (
                      <div
                        className="h-7 rounded-r-md transition-all duration-500 ease-out flex items-center pl-2"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: "hsl(221, 83%, 53%)",
                          minWidth: item.value !== 0 ? "40px" : "0",
                        }}
                      >
                        <span className="text-xs font-semibold text-white whitespace-nowrap">
                          {formatCompactOnly(item.value)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-20 text-sm font-medium text-right shrink-0">
                  {item.percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 mt-6 pt-4 border-t">
            <div className="w-44" />
            <div className="flex-1 flex items-center text-xs text-muted-foreground">
              <span className="w-1/2 text-right pr-4">← Négatif</span>
              <div className="w-0.5 h-4 bg-gray-300" />
              <span className="w-1/2 text-left pl-4">Positif →</span>
            </div>
            <div className="w-20 text-xs text-muted-foreground text-right">
              % du CA
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Composant Evolution CA
  const EvolutionCA = () => (
    <Card>
      <CardHeader>
        <CardTitle>Évolution du Chiffre d&apos;Affaires</CardTitle>
        <CardDescription>
          Comparaison {yearN} vs {yearN1} - par {getXAxisLabel().toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfigCA} className="h-[400px] w-full">
          <BarChart
            data={visibleChartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
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
                    name === "chiffreAffaires" ? `CA ${yearN}` : `CA ${yearN1}`,
                  ]}
                />
              }
            />
            <Bar
              dataKey="chiffreAffairesN1"
              name={`CA ${yearN1}`}
              fill="hsl(221, 83%, 73%)"
              barSize={32}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="chiffreAffaires"
              name={`CA ${yearN}`}
              fill="hsl(221, 83%, 53%)"
              barSize={32}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );

  // Composant Evolution Trésorerie
  const EvolutionTresorerie = () => (
    <Card>
      <CardHeader>
        <CardTitle>Évolution de la Trésorerie</CardTitle>
        <CardDescription>
          Solde cumulé {yearN} vs {yearN1} - par {getXAxisLabel().toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfigTresorerie}
          className="h-[400px] w-full"
        >
          <LineChart
            data={visibleChartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
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
                    name === "soldeTresorerie"
                      ? `Trésorerie ${yearN}`
                      : `Trésorerie ${yearN1}`,
                  ]}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="soldeTresorerieN1"
              name={`Trésorerie ${yearN1}`}
              stroke="hsl(174, 72%, 66%)"
              strokeWidth={2}
              dot={{ r: 3 }}
              strokeDasharray="5 5"
            />
            <Line
              type="monotone"
              dataKey="soldeTresorerie"
              name={`Trésorerie ${yearN}`}
              stroke="hsl(174, 72%, 46%)"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );

  // Contenu selon l'onglet actif
  const renderTabContent = () => {
    switch (activeTab) {
      case "synthese":
        return (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <DollarSign className="w-4 h-4 text-blue-600" />
                      CA
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.chiffreAffaires}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xl font-bold text-blue-600">
                    {formatCompactOnly(data.indicateurs.anneeN.chiffreAffaires)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {yearN1}:{" "}
                    {formatCompactOnly(
                      data.indicateurs.anneeN1.chiffreAffaires
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Users className="w-4 h-4 text-orange-600" />
                      Masse Salariale
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.masseSalariale}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xl font-bold text-orange-600">
                    {formatCompactOnly(data.indicateurs.anneeN.masseSalariale)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {yearN1}:{" "}
                    {formatCompactOnly(data.indicateurs.anneeN1.masseSalariale)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Activity className="w-4 h-4 text-purple-600" />
                      Résultat Exploitation
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.resultatExploitation}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.resultatExploitation >= 0
                        ? "text-purple-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(
                      data.indicateurs.anneeN.resultatExploitation
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {yearN1}:{" "}
                    {formatCompactOnly(
                      data.indicateurs.anneeN1.resultatExploitation
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <PiggyBank className="w-4 h-4 text-green-600" />
                      Résultat Net
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.resultatNet}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.resultatNet >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(data.indicateurs.anneeN.resultatNet)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {yearN1}:{" "}
                    {formatCompactOnly(data.indicateurs.anneeN1.resultatNet)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Wallet className="w-4 h-4 text-cyan-600" />
                      Trésorerie
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.soldeTresorerie}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.soldeTresorerie >= 0
                        ? "text-cyan-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(data.indicateurs.anneeN.soldeTresorerie)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {yearN1}:{" "}
                    {formatCompactOnly(
                      data.indicateurs.anneeN1.soldeTresorerie
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <ShoppingCart className="w-4 h-4 text-indigo-600" />
                      Marge Commerciale
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.margeCommerciale}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.margeCommerciale >= 0
                        ? "text-indigo-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(
                      data.indicateurs.anneeN.margeCommerciale
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {yearN1}:{" "}
                    {formatCompactOnly(
                      data.indicateurs.anneeN1.margeCommerciale
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Evolution Trésorerie */}
            <EvolutionTresorerie />

            {/* Tunnel de rentabilité */}
            <TunnelRentabilite />

            {/* Périodes déclarées */}
            <Card>
              <CardHeader>
                <CardTitle>Périodes déclarées</CardTitle>
                <CardDescription>Clic droit pour les actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 max-h-[300px] overflow-y-auto">
                  {data.periods.map((period) => (
                    <ContextMenu key={period.batch_id}>
                      <ContextMenuTrigger>
                        <div
                          className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                            hiddenPeriods.has(period.id || "")
                              ? "opacity-40 bg-muted"
                              : "bg-card hover:bg-accent"
                          }`}
                        >
                          <div className="font-medium text-sm">
                            {formatPeriodLabel(
                              period.periodStart,
                              period.periodEnd
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {Number(period.nb_transactions).toLocaleString(
                              "fr-FR"
                            )}{" "}
                            transactions
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Badge
                              variant="outline"
                              className="text-xs text-red-600"
                            >
                              C: {formatCompactOnly(period.charges)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs text-green-600"
                            >
                              P: {formatCompactOnly(period.produits)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge
                              variant={
                                period.status === "COMPLETED"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {period.status}
                            </Badge>
                            {period.produits - period.charges >= 0 ? (
                              <TrendingUp className="w-4 h-4 text-green-600" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => handleDownloadExcel(period)}
                        >
                          <Download className="w-4 h-4 mr-2" /> Télécharger
                          Excel
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleHidePeriod(period.id || "")}
                        >
                          <EyeOff className="w-4 h-4 mr-2" />
                          {hiddenPeriods.has(period.id || "")
                            ? "Afficher"
                            : "Masquer"}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => handleDeletePeriod(period)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "chiffre-affaires":
        return (
          <div className="space-y-6">
            {/* KPI CA en haut */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <DollarSign className="w-4 h-4 text-blue-600" />
                      Chiffre d&apos;Affaires {yearN}
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.chiffreAffaires}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCompactOnly(data.indicateurs.anneeN.chiffreAffaires)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <DollarSign className="w-4 h-4 text-blue-400" />
                    Chiffre d&apos;Affaires {yearN1}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-blue-400">
                    {formatCompactOnly(
                      data.indicateurs.anneeN1.chiffreAffaires
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Graphique Evolution CA */}
            <EvolutionCA />

            {/* Top 10 Clients par CA */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <div>
                    <CardTitle>Top 10 Clients</CardTitle>
                    <CardDescription>
                      Clients avec le plus fort impact sur le chiffre d&apos;affaires
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {data.topClients && data.topClients.length > 0 ? (
                  <div className="space-y-3">
                    {data.topClients.map((client, index) => (
                      <div
                        key={client.numeroClient}
                        className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        {/* Rang */}
                        <div
                          className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm",
                            index === 0 && "bg-amber-100 text-amber-700",
                            index === 1 && "bg-gray-100 text-gray-600",
                            index === 2 && "bg-orange-100 text-orange-700",
                            index > 2 && "bg-blue-50 text-blue-600"
                          )}
                        >
                          {index + 1}
                        </div>

                        {/* Icône entreprise et nom */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Building2 className="w-5 h-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {client.nomClient}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {client.numeroClient}
                            </p>
                          </div>
                        </div>

                        {/* Montant et pourcentage */}
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-blue-600">
                            {formatCompactOnly(client.montantCA)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {client.pourcentageCA.toFixed(1)}% du CA
                          </p>
                        </div>

                        {/* Barre de progression */}
                        <div className="w-24 shrink-0">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{
                                width: `${Math.min(client.pourcentageCA, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Building2 className="w-12 h-12 mb-2 opacity-20" />
                    <p>Aucune donnée client disponible</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case "resultat":
        return (
          <div className="space-y-6">
            {/* KPIs Résultat */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Activity className="w-4 h-4 text-purple-600" />
                      Rex
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.resultatExploitation}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.resultatExploitation >= 0
                        ? "text-purple-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(
                      data.indicateurs.anneeN.resultatExploitation
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Receipt className="w-4 h-4 text-amber-600" />
                    Résultat Financier
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.resultatFinancier >= 0
                        ? "text-amber-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(
                      data.indicateurs.anneeN.resultatFinancier
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <BarChart3 className="w-4 h-4 text-slate-600" />
                    Résultat HAO
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.resultatHAO >= 0
                        ? "text-slate-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(data.indicateurs.anneeN.resultatHAO)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <PiggyBank className="w-4 h-4 text-green-600" />
                      Résultat Net
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.resultatNet}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className={`text-xl font-bold ${
                      data.indicateurs.anneeN.resultatNet >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCompactOnly(data.indicateurs.anneeN.resultatNet)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tunnel de rentabilité */}
            <TunnelRentabilite />
          </div>
        );

      case "recouvrement":
        if (recouvrementLoading) {
          return (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          );
        }

        if (!recouvrementData) {
          return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Aucune donnée de recouvrement disponible
            </div>
          );
        }

        return (
          <div className="space-y-6">
            {/* Filtre de période */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Période d'analyse</CardTitle>
                    <CardDescription>
                      Sélectionnez le mois de fin pour afficher les 12 derniers mois
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <Select
                      value={recouvrementMonth}
                      onValueChange={setRecouvrementMonth}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Mois" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={recouvrementYear}
                      onValueChange={setRecouvrementYear}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="Année" />
                      </SelectTrigger>
                      <SelectContent>
                        {recouvrementYearOptions.map((y) => (
                          <SelectItem key={y} value={y}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">
                  Période affichée : <span className="font-medium text-foreground">{recouvrementData.periodRange.start.label}</span> → <span className="font-medium text-foreground">{recouvrementData.periodRange.end.label}</span>
                </p>
              </CardContent>
            </Card>

            {/* KPIs Recouvrement */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Percent className="w-4 h-4 text-violet-600" />
                    Taux de Recouvrement (12 mois)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-violet-600">
                    {recouvrementData.totals.tauxRecouvrement.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sur la période sélectionnée
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    CA TTC Total (Débit 41*)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCompactOnly(recouvrementData.totals.caTTCTotal)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Somme des débits comptes clients
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Wallet className="w-4 h-4 text-green-600" />
                    CA Encaissé TTC (Crédit 41*)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCompactOnly(recouvrementData.totals.caEncaisseTTC)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Somme des crédits comptes clients
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Graphique Evolution Taux de Recouvrement - 12 derniers mois */}
            <Card>
              <CardHeader>
                <CardTitle>Évolution du Taux de Recouvrement</CardTitle>
                <CardDescription>
                  12 derniers mois - (CA Encaissé TTC / CA TTC Total) × 100
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    tauxRecouvrement: { label: "Taux mensuel", color: "hsl(262, 83%, 58%)" },
                    tauxRecouvrementCumule: { label: "Taux cumulé", color: "hsl(262, 83%, 78%)" },
                  }}
                  className="h-[400px] w-full"
                >
                  <LineChart
                    data={recouvrementData.chartData}
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
                            name === "tauxRecouvrement"
                              ? "Taux mensuel"
                              : "Taux cumulé",
                          ]}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="tauxRecouvrement"
                      name="Taux mensuel"
                      stroke="hsl(262, 83%, 58%)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tauxRecouvrementCumule"
                      name="Taux cumulé"
                      stroke="hsl(262, 83%, 78%)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Graphique CA TTC vs CA Encaissé */}
            <Card>
              <CardHeader>
                <CardTitle>CA TTC Total vs CA Encaissé TTC</CardTitle>
                <CardDescription>
                  Comparaison mensuelle des montants
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    caTTCTotal: { label: "CA TTC Total", color: "hsl(221, 83%, 53%)" },
                    caEncaisseTTC: { label: "CA Encaissé", color: "hsl(142, 76%, 36%)" },
                  }}
                  className="h-[350px] w-full"
                >
                  <BarChart
                    data={recouvrementData.chartData}
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
                            name === "caTTCTotal" ? "CA TTC Total" : "CA Encaissé",
                          ]}
                        />
                      }
                    />
                    <Bar
                      dataKey="caTTCTotal"
                      name="CA TTC Total"
                      fill="hsl(221, 83%, 53%)"
                      barSize={24}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="caEncaisseTTC"
                      name="CA Encaissé"
                      fill="hsl(142, 76%, 36%)"
                      barSize={24}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r bg-muted/30 p-4 space-y-2 shrink-0">
        <div className="mb-6">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Navigation
          </h3>
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isExpanded = expandedNav.has(item.id);
          const isActive = activeTab === item.id;

          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  setActiveTab(item.id);
                  toggleNavExpand(item.id);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.subItems && (
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                )}
              </button>
              {item.subItems && isExpanded && (
                <div className="ml-6 mt-1 space-y-1">
                  {item.subItems.map((subItem, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      {subItem}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">{data.client.name}</h2>
            <p className="text-muted-foreground">
              Reporting comptable - {getPeriodLabel()}
            </p>
            <p>Devise : K FCFA</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={periodType === "year" ? "default" : "ghost"}
                size="sm"
                onClick={() => setPeriodType("year")}
                className="gap-1"
              >
                <Calendar className="w-4 h-4" />
                Année
              </Button>
              <Button
                variant={periodType === "month" ? "default" : "ghost"}
                size="sm"
                onClick={() => setPeriodType("month")}
                className="gap-1"
              >
                <CalendarDays className="w-4 h-4" />
                Mois
              </Button>
              <Button
                variant={periodType === "ytd" ? "default" : "ghost"}
                size="sm"
                onClick={() => setPeriodType("ytd")}
                className="gap-1"
              >
                <CalendarRange className="w-4 h-4" />
                YTD
              </Button>
            </div>

            {(periodType === "month" || periodType === "ytd") && (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Mois" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={() => handleYearChange("prev")}
              disabled={
                data.availableYears.indexOf(year) >=
                data.availableYears.length - 1
              }
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xl font-semibold min-w-[80px] text-center">
              {year}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleYearChange("next")}
              disabled={data.availableYears.indexOf(year) <= 0}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </div>
  );
}
