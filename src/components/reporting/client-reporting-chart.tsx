"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  Legend,
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
  AlertTriangle,
} from "lucide-react";
import {
  PiCoinsDuotone,
  PiMoneyWavyDuotone,
  PiWalletDuotone,
  PiChartDonutDuotone,
  PiShoppingCartSimpleDuotone,
  PiGearDuotone,
  PiPercentDuotone,
  PiReceiptDuotone,
  PiCalculatorDuotone,
  PiChartPieDuotone,
  PiWarningDuotone,
} from "react-icons/pi";
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
  // CA par Nature
  caTA: number;
  caTB: number;
  caTC: number;
  caTD: number;
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
  caTA: number;
  caTB: number;
  caTC: number;
  caTD: number;
}

interface TopClient {
  numeroClient: string;
  nomClient: string;
  montantCA: number;
  pourcentageCA: number;
}

interface CAParNatureItem {
  compte: string;
  intituleCompte: string;
  montantN: number;
  montantN1: number;
  variation: number;
}

interface ReportingData {
  client: { id: string; name: string; assujettiTVA: boolean };
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
  caParNature: CAParNatureItem[];
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
    label: "Rés. Exploitation",
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

// ==================== KPI CONFIG ====================
interface KpiItem {
  id: string;
  label: string;
  key: keyof IndicateursFinanciers;
  variationKey: keyof Variations;
  color: string;
  colorNeg?: string;
  icon: React.ElementType;
  visible: boolean;
  order: number;
}

const DEFAULT_KPI_ITEMS: KpiItem[] = [
  {
    id: "ca",
    label: "Chiffre d'affaires",
    key: "chiffreAffaires",
    variationKey: "chiffreAffaires",
    color: "text-blue-600",
    icon: PiCoinsDuotone,
    visible: true,
    order: 0,
  },
  {
    id: "ms",
    label: "Masse salariale",
    key: "masseSalariale",
    variationKey: "masseSalariale",
    color: "text-orange-600",
    icon: PiMoneyWavyDuotone,
    visible: true,
    order: 1,
  },
  {
    id: "rex",
    label: "Résultat d'exploitation",
    key: "resultatExploitation",
    variationKey: "resultatExploitation",
    color: "text-fuchsia-500",
    colorNeg: "text-red-600",
    icon: PiChartDonutDuotone,
    visible: true,
    order: 2,
  },
  {
    id: "rn",
    label: "Résultat Net",
    key: "resultatNet",
    variationKey: "resultatNet",
    color: "text-green-600",
    colorNeg: "text-red-600",
    icon: PiChartDonutDuotone,
    visible: true,
    order: 3,
  },
  {
    id: "treso",
    label: "Trésorerie",
    key: "soldeTresorerie",
    variationKey: "soldeTresorerie",
    color: "text-cyan-600",
    colorNeg: "text-red-600",
    icon: PiWalletDuotone,
    visible: true,
    order: 4,
  },
  {
    id: "marge",
    label: "Marge commerciale",
    key: "margeCommerciale",
    variationKey: "margeCommerciale",
    color: "text-indigo-600",
    colorNeg: "text-red-600",
    icon: PiShoppingCartSimpleDuotone,
    visible: true,
    order: 5,
  },
];

function loadKpiConfig(clientId: string): KpiItem[] {
  if (typeof window === "undefined") return DEFAULT_KPI_ITEMS;
  try {
    const raw = localStorage.getItem(`kpi-config-${clientId}`);
    if (!raw) return DEFAULT_KPI_ITEMS;
    const saved = JSON.parse(raw) as Array<{
      id: string;
      visible: boolean;
      order: number;
    }>;
    return DEFAULT_KPI_ITEMS.map((d) => {
      const s = saved.find((x) => x.id === d.id);
      return s ? { ...d, visible: s.visible, order: s.order } : d;
    }).sort((a, b) => a.order - b.order);
  } catch {
    return DEFAULT_KPI_ITEMS;
  }
}

function saveKpiConfig(clientId: string, items: KpiItem[]) {
  if (typeof window === "undefined") return;
  const data = items.map((i) => ({
    id: i.id,
    visible: i.visible,
    order: i.order,
  }));
  localStorage.setItem(`kpi-config-${clientId}`, JSON.stringify(data));
}

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

const chartConfigCANature: ChartConfig = {
  montantN: { label: "Année N", color: "hsl(221, 83%, 53%)" },
  montantN1: { label: "Année N-1", color: "hsl(221, 83%, 73%)" },
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
  initialTab,
  activeTab: activeTabProp,
  initialPeriodType,
  hideNav = false,
}: {
  clientId: string;
  initialTab?: TabId;
  /**
   * Onglet contrôlé par le parent. Quand fourni, on conserve l'état des
   * filtres (année, mode, mois) entre les changements d'onglet : seul le
   * rendu du contenu change. Si absent, l'onglet est géré localement.
   */
  activeTab?: TabId;
  initialPeriodType?: PeriodType;
  hideNav?: boolean;
}) {
  const [data, setData] = useState<ReportingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const yearInitialized = useRef(false);
  const [periodType, setPeriodType] = useState<PeriodType>(
    initialPeriodType || "year",
  );
  const [selectedMonth, setSelectedMonth] = useState<string>("12");
  const [hiddenPeriods, setHiddenPeriods] = useState<Set<string>>(new Set());
  const [tunnelMetrics, setTunnelMetrics] = useState<TunnelMetric[]>(
    INITIAL_TUNNEL_METRICS,
  );
  const [tunnelEditMode, setTunnelEditMode] = useState(false);
  const [activeTabState, setActiveTabState] = useState<TabId>(
    activeTabProp || initialTab || "synthese",
  );
  // Lorsqu'on est en mode contrôlé, l'onglet vient du parent.
  const activeTab: TabId = activeTabProp ?? activeTabState;
  const setActiveTab = (t: TabId) => {
    if (activeTabProp === undefined) setActiveTabState(t);
  };
  const [expandedNav, setExpandedNav] = useState<Set<TabId>>(
    new Set([activeTabProp || initialTab || "synthese"]),
  );

  // KPI configuration state
  const [kpiItems, setKpiItems] = useState<KpiItem[]>(() =>
    loadKpiConfig(clientId),
  );
  const [kpiEditMode, setKpiEditMode] = useState(false);
  const [kpiDragId, setKpiDragId] = useState<string | null>(null);
  const [kpiContextMenu, setKpiContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const updateKpi = (newItems: KpiItem[]) => {
    const reordered = newItems.map((item, idx) => ({ ...item, order: idx }));
    setKpiItems(reordered);
    saveKpiConfig(clientId, reordered);
  };

  const toggleKpiVisible = (id: string) => {
    const next = kpiItems.map((k) =>
      k.id === id ? { ...k, visible: !k.visible } : k,
    );
    updateKpi(next);
  };

  const handleKpiDragStart = (id: string) => {
    setKpiDragId(id);
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

  const handleKpiDragEnd = () => {
    setKpiDragId(null);
  };

  const handleKpiContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setKpiContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!kpiContextMenu) return;
    const handler = () => setKpiContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [kpiContextMenu]);

  // Sync activeTab with initialTab when parent changes it
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

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
      soldeCreances: number;
    };
    periodRange: {
      start: { year: number; month: number; label: string };
      end: { year: number; month: number; label: string };
    };
    topCreances: Array<{
      numeroClient: string;
      nomClient: string;
      caTTCTotal: number;
      caEncaisseTTC: number;
      soldeCreance: number;
      pourcentageTotal: number;
    }>;
    totalCreances: number;
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

      // Au premier chargement, se caler sur l'année la plus récente du reporting
      if (!yearInitialized.current && json.availableYears?.length > 0) {
        yearInitialized.current = true;
        const mostRecentYear = json.availableYears[0];
        // Initialiser aussi le recouvrement sur l'année/mois le plus récent
        setRecouvrementYear(mostRecentYear);
        setRecouvrementMonth("12");
        if (mostRecentYear !== year) {
          setYear(mostRecentYear);
          return;
        }
      }
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
      prev.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m)),
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
    periodEnd?: string,
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
    if (periodType === "year") return `Janvier - Décembre ${year}`;
    if (periodType === "ytd") {
      const month = MONTHS.find((m) => m.value === selectedMonth);
      return `Janvier - ${month?.label || ""} ${year}`;
    }
    return `Janvier - Décembre ${year}`;
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTunnelEditMode(!tunnelEditMode)}
            className={cn(
              "gap-2 h-9 rounded-lg transition-colors",
              tunnelEditMode
                ? "bg-[#0077C3] text-white border-[#0077C3] hover:bg-[#005992]"
                : "border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF]",
            )}
          >
            <PiGearDuotone className="w-4 h-4" />
            {tunnelEditMode ? "Terminer" : "Configurer le tunnel"}
          </Button>
        </div>
        {tunnelEditMode && (
          <div className="mt-4 border border-dashed border-[#0077C3] ring-1 ring-[#0077C3]/20 rounded-lg p-3 space-y-2">
            {[...tunnelMetrics]
              .sort((a, b) => a.order - b.order)
              .map((metric, index) => (
                <div
                  key={metric.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md bg-white border border-[#D0E3F5]",
                    !metric.visible && "opacity-40",
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-[#335890]"
                      onClick={() => moveMetric(metric.id, "up")}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-[#335890]"
                      onClick={() => moveMetric(metric.id, "down")}
                      disabled={index === tunnelMetrics.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <span className="text-sm flex-1 text-[#00122E]">
                    {metric.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full border border-[#D0E3F5] text-[#94A3B8] hover:text-[#0077C3]"
                    onClick={() => toggleMetricVisibility(metric.id)}
                    title={metric.visible ? "Masquer" : "Afficher"}
                  >
                    {metric.visible ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOffIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tunnelData.map((item) => {
            const barWidth =
              maxAbsValue !== 0 ? (Math.abs(item.value) / maxAbsValue) * 85 : 0;
            const isPositive = item.value >= 0;

            return (
              <div key={item.id} className="flex items-center gap-4">
                <div className="w-44 text-sm font-medium text-right shrink-0">
                  {item.name}
                </div>
                <div className="flex-1 flex items-center h-11">
                  <div className="w-1/2 flex justify-end pr-1">
                    {!isPositive && (
                      <div
                        className="h-9 rounded-l-md transition-all duration-500 ease-out flex items-center justify-end pr-2"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: "hsl(0, 84%, 60%)",
                          minWidth: item.value !== 0 ? "60px" : "0",
                        }}
                      >
                        <span className="text-xs font-semibold text-white whitespace-nowrap">
                          {formatCompactOnly(item.value)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="w-0.5 h-11 bg-gray-300 shrink-0" />
                  <div className="w-1/2 flex justify-start pl-1">
                    {isPositive && (
                      <div
                        className="h-9 rounded-r-md transition-all duration-500 ease-out flex items-center pl-2"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: "hsl(221, 83%, 53%)",
                          minWidth: item.value !== 0 ? "60px" : "0",
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

  // Légende personnalisée N vs N-1 (coin supérieur droit de la carte)
  const LegendLine = ({
    color,
    dashed,
  }: {
    color: string;
    dashed?: boolean;
  }) => (
    <svg
      width="120"
      height="4"
      viewBox="0 0 199 3"
      fill="none"
      aria-hidden
      preserveAspectRatio="none"
    >
      <path
        d="M1.5 1.5H197.5"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={dashed ? "6 6" : undefined}
      />
    </svg>
  );

  const ChartLegend = ({
    labelN,
    labelN1,
    colorN = "#000000",
    colorN1,
    solid = false,
  }: {
    labelN: string | number;
    labelN1: string | number;
    colorN?: string;
    colorN1?: string;
    solid?: boolean;
  }) => (
    <div className="flex flex-col gap-1 shrink-0">
      <span className="text-base font-semibold text-[#335890]">Légende</span>
      <div className="flex items-center gap-3">
        <LegendLine color={colorN} />
        <span className="text-base font-medium text-[#0077C3]">{labelN}</span>
      </div>
      <div className="flex items-center gap-3">
        <LegendLine color={colorN1 ?? colorN} dashed={!solid} />
        <span className="text-base font-medium text-[#0077C3]">{labelN1}</span>
      </div>
    </div>
  );

  // Composant Evolution CA
  const EvolutionCA = () => (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Évolution du Chiffre d&apos;Affaires</CardTitle>
          <CardDescription>
            Comparaison {yearN} vs {yearN1} - par{" "}
            {getXAxisLabel().toLowerCase()}
          </CardDescription>
        </div>
        <ChartLegend
          labelN={yearN}
          labelN1={yearN1}
          colorN="#2463eb"
          colorN1="#81a5f3"
          solid
        />
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfigCA} className="h-[400px] w-full">
          <BarChart
            data={visibleChartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            barCategoryGap="20%"
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
                    name === `CA ${yearN}` ? `CA ${yearN}` : `CA ${yearN1}`,
                  ]}
                />
              }
            />
            <Bar
              dataKey="chiffreAffairesN1"
              name={`CA ${yearN1}`}
              fill="hsl(221, 83%, 73%)"
              barSize={24}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="chiffreAffaires"
              name={`CA ${yearN}`}
              fill="hsl(221, 83%, 53%)"
              barSize={24}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );

  // Composant CA par Nature — Détail des comptes TC avec comparaison N vs N-1
  const CAParNature = () => {
    const natureData = data?.caParNature ?? [];

    if (natureData.length === 0) return null;

    // Hauteur dynamique : 70px par compte + marge
    const chartHeight = Math.max(natureData.length * 70 + 40, 200);

    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>CA par Nature</CardTitle>
            <CardDescription>
              Détail des comptes (rubrique TC) — {yearN} vs {yearN1}
            </CardDescription>
          </div>
          <ChartLegend
            labelN={yearN}
            labelN1={yearN1}
            colorN="#2463eb"
            colorN1="#81a5f3"
            solid
          />
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={chartConfigCANature}
            className="w-full"
            style={{ height: `${chartHeight}px` }}
          >
            <BarChart
              data={natureData}
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
                  if (absVal >= 1000000)
                    return `${(value / 1000000).toFixed(0)}M`;
                  if (absVal >= 1000) return `${(value / 1000).toFixed(0)}K`;
                  return value.toString();
                }}
              />
              <YAxis
                type="category"
                dataKey="intituleCompte"
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
                      name === `${yearN1}` ? `CA ${yearN1}` : `CA ${yearN}`,
                    ]}
                  />
                }
              />
              <Bar
                dataKey="montantN1"
                name={`${yearN1}`}
                fill="hsl(221, 83%, 73%)"
                barSize={18}
                radius={[0, 4, 4, 0]}
              />
              <Bar
                dataKey="montantN"
                name={`${yearN}`}
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
                  <th className="text-left py-2 font-medium text-muted-foreground">
                    Compte
                  </th>
                  <th className="text-right py-2 font-medium text-muted-foreground">
                    {yearN}
                  </th>
                  <th className="text-right py-2 font-medium text-muted-foreground">
                    {yearN1}
                  </th>
                  <th className="text-right py-2 font-medium text-muted-foreground">
                    Variation
                  </th>
                </tr>
              </thead>
              <tbody>
                {natureData.map((item) => (
                  <tr
                    key={item.compte}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.compte}
                        </span>
                        <span className="font-medium">
                          {item.intituleCompte}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-2.5 font-semibold">
                      {formatCompactOnly(item.montantN)}
                    </td>
                    <td className="text-right py-2.5 text-muted-foreground">
                      {formatCompactOnly(item.montantN1)}
                    </td>
                    <td className="text-right py-2.5">
                      <VariationBadge value={item.variation} />
                    </td>
                  </tr>
                ))}
                {/* Ligne total */}
                <tr className="border-t-2 font-bold">
                  <td className="py-2.5">Total CA</td>
                  <td className="text-right py-2.5 text-blue-600">
                    {formatCompactOnly(
                      natureData.reduce((sum, item) => sum + item.montantN, 0),
                    )}
                  </td>
                  <td className="text-right py-2.5 text-muted-foreground">
                    {formatCompactOnly(
                      natureData.reduce((sum, item) => sum + item.montantN1, 0),
                    )}
                  </td>
                  <td className="text-right py-2.5">
                    <VariationBadge
                      value={data?.indicateurs.variations.chiffreAffaires ?? 0}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Composant Evolution Trésorerie
  const EvolutionTresorerie = () => (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Évolution de la Trésorerie</CardTitle>
          <CardDescription>
            Solde cumulé {yearN} vs {yearN1} - par{" "}
            {getXAxisLabel().toLowerCase()}
          </CardDescription>
        </div>
        <ChartLegend labelN={yearN} labelN1={yearN1} colorN="#5FC7B9" />
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
                    name === `Trésorerie ${yearN}`
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
            {/* KPIs — configurable grid */}
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
                    const valueN = data.indicateurs.anneeN[kpi.key] as number;
                    const valueN1 = data.indicateurs.anneeN1[kpi.key] as number;
                    const variation = data.indicateurs.variations[
                      kpi.variationKey
                    ] as number;
                    const hasNeg = kpi.colorNeg && valueN < 0;
                    const colorCls = hasNeg ? kpi.colorNeg! : kpi.color;
                    const isDragging = kpiDragId === kpi.id;

                    return (
                      <div
                        key={kpi.id}
                        draggable={kpiEditMode}
                        onDragStart={() => handleKpiDragStart(kpi.id)}
                        onDragOver={(e) => handleKpiDragOver(e, kpi.id)}
                        onDragEnd={handleKpiDragEnd}
                        onContextMenu={(e) => handleKpiContextMenu(e, kpi.id)}
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
                            <div className="flex items-center justify-between">
                              <CardDescription className="text-sm font-medium">
                                {kpi.label}
                              </CardDescription>
                              <VariationBadge value={variation} />
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex items-end justify-between gap-2">
                              <div className="min-w-0">
                                <div
                                  className={cn(
                                    "text-3xl font-bold truncate",
                                    valueN < 0
                                      ? "text-red-600"
                                      : "text-[#00122E]",
                                  )}
                                >
                                  {formatCompactOnly(valueN)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {yearN1}: {formatCompactOnly(valueN1)}
                                </p>
                              </div>
                              <Icon
                                className={`w-8 h-8 shrink-0 ${kpi.color}`}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* KPI context menu */}
            {kpiContextMenu && (
              <div
                className="fixed z-50 bg-white border border-[#D0E3F5] rounded-lg shadow-lg py-1 min-w-[160px]"
                style={{ top: kpiContextMenu.y, left: kpiContextMenu.x }}
              >
                <button
                  onClick={() => {
                    toggleKpiVisible(kpiContextMenu.id);
                    setKpiContextMenu(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#335890] hover:bg-[#F5F9FF]"
                >
                  {kpiItems.find((k) => k.id === kpiContextMenu.id)?.visible ? (
                    <>
                      <EyeOff className="w-4 h-4" /> Masquer ce KPI
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" /> Afficher ce KPI
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setKpiEditMode(true);
                    setKpiContextMenu(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#335890] hover:bg-[#F5F9FF]"
                >
                  <Settings2 className="w-4 h-4" /> Mode réorganisation
                </button>
              </div>
            )}

            {/* Evolution Trésorerie */}
            <EvolutionTresorerie />

            {/* Tunnel de rentabilité */}
            <TunnelRentabilite />
          </div>
        );

      case "chiffre-affaires":
        return (
          <div className="space-y-6">
            {/* Indicateur mode CA */}
            {!data.client.assujettiTVA && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Client non assujetti TVA — Le CA est calcule sur les comptes
                  clients (41*) au lieu des comptes de ventes (70*).
                </span>
              </div>
            )}

            {/* KPI CA en haut */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="flex items-center gap-2 text-sm font-medium">
                      Chiffre d&apos;Affaires {yearN}
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0"
                      >
                        {data.client.assujettiTVA ? "HT" : "TTC"}
                      </Badge>
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.chiffreAffaires}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-3xl font-bold truncate",
                          data.indicateurs.anneeN.chiffreAffaires < 0
                            ? "text-red-600"
                            : "text-[#00122E]",
                        )}
                      >
                        {formatCompactOnly(
                          data.indicateurs.anneeN.chiffreAffaires,
                        )}
                      </div>
                    </div>
                    <PiCoinsDuotone className="w-8 h-8 shrink-0 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2 text-sm font-medium">
                    Chiffre d&apos;Affaires {yearN1}
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {data.client.assujettiTVA ? "HT" : "TTC"}
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-3xl font-bold truncate",
                          data.indicateurs.anneeN1.chiffreAffaires < 0
                            ? "text-red-600"
                            : "text-[#00122E]",
                        )}
                      >
                        {formatCompactOnly(
                          data.indicateurs.anneeN1.chiffreAffaires,
                        )}
                      </div>
                    </div>
                    <PiCoinsDuotone className="w-8 h-8 shrink-0 text-blue-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Graphique Evolution CA */}
            <EvolutionCA />

            {/* CA par Nature — Histogramme horizontal N vs N-1 */}
            <CAParNature />

            {/* Top 10 Clients par CA */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <div>
                    <CardTitle>Top 10 Clients</CardTitle>
                    <CardDescription>
                      Clients avec le plus fort impact sur le chiffre
                      d&apos;affaires
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
                            index > 2 && "bg-blue-50 text-blue-600",
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
                    <CardDescription className="text-sm font-medium">
                      Résultat Exploitation
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.resultatExploitation}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div
                      className={cn(
                        "text-3xl font-bold truncate",
                        data.indicateurs.anneeN.resultatExploitation < 0
                          ? "text-red-600"
                          : "text-[#00122E]",
                      )}
                    >
                      {formatCompactOnly(
                        data.indicateurs.anneeN.resultatExploitation,
                      )}
                    </div>
                    <PiChartDonutDuotone className="w-8 h-8 shrink-0 text-fuchsia-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm font-medium">
                    Résultat Financier
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div
                      className={cn(
                        "text-3xl font-bold truncate",
                        data.indicateurs.anneeN.resultatFinancier < 0
                          ? "text-red-600"
                          : "text-[#00122E]",
                      )}
                    >
                      {formatCompactOnly(
                        data.indicateurs.anneeN.resultatFinancier,
                      )}
                    </div>
                    <PiReceiptDuotone className="w-8 h-8 shrink-0 text-amber-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm font-medium">
                    Résultat HAO
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div
                      className={cn(
                        "text-3xl font-bold truncate",
                        data.indicateurs.anneeN.resultatHAO < 0
                          ? "text-red-600"
                          : "text-[#00122E]",
                      )}
                    >
                      {formatCompactOnly(data.indicateurs.anneeN.resultatHAO)}
                    </div>
                    <PiCalculatorDuotone className="w-8 h-8 shrink-0 text-yellow-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-sm font-medium">
                      Résultat Net
                    </CardDescription>
                    <VariationBadge
                      value={data.indicateurs.variations.resultatNet}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div
                      className={cn(
                        "text-3xl font-bold truncate",
                        data.indicateurs.anneeN.resultatNet < 0
                          ? "text-red-600"
                          : "text-[#00122E]",
                      )}
                    >
                      {formatCompactOnly(data.indicateurs.anneeN.resultatNet)}
                    </div>
                    <PiChartDonutDuotone className="w-8 h-8   shrink-0 text-green-500" />
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
            {/* KPIs Recouvrement */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm font-medium">
                    Taux de Recouvrement (12 mois)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-3xl font-bold truncate",
                          recouvrementData.totals.tauxRecouvrement < 0
                            ? "text-red-600"
                            : "text-[#00122E]",
                        )}
                      >
                        {recouvrementData.totals.tauxRecouvrement.toFixed(1)}%
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sur la période sélectionnée
                      </p>
                    </div>
                    <PiPercentDuotone className="w-8 h-8 shrink-0 text-violet-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm font-medium">
                    CA TTC Total (Débit 41*)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-3xl font-bold truncate",
                          recouvrementData.totals.caTTCTotal < 0
                            ? "text-red-600"
                            : "text-[#00122E]",
                        )}
                      >
                        {formatCompactOnly(recouvrementData.totals.caTTCTotal)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Somme des débits comptes clients
                      </p>
                    </div>
                    <PiCoinsDuotone className="w-8 h-8 shrink-0 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm font-medium">
                    CA Encaissé TTC (Crédit 41*)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-3xl font-bold truncate",
                          recouvrementData.totals.caEncaisseTTC < 0
                            ? "text-red-600"
                            : "text-[#00122E]",
                        )}
                      >
                        {formatCompactOnly(
                          recouvrementData.totals.caEncaisseTTC,
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Somme des crédits comptes clients
                      </p>
                    </div>
                    <PiWalletDuotone className="w-8 h-8 shrink-0 text-green-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Graphique Evolution Taux de Recouvrement - 12 derniers mois */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Évolution du Taux de Recouvrement</CardTitle>
                  <CardDescription>
                    12 derniers mois - (CA Encaissé TTC / CA TTC Total) × 100
                  </CardDescription>
                </div>
                <ChartLegend
                  labelN="Taux mensuel"
                  labelN1="Taux cumulé"
                  colorN="hsl(262, 83%, 58%)"
                  colorN1="hsl(262, 83%, 78%)"
                />
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    tauxRecouvrement: {
                      label: "Taux mensuel",
                      color: "hsl(262, 83%, 58%)",
                    },
                    tauxRecouvrementCumule: {
                      label: "Taux cumulé",
                      color: "hsl(262, 83%, 78%)",
                    },
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
                            name === "Taux mensuel"
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
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>CA TTC Total vs CA Encaissé TTC</CardTitle>
                  <CardDescription>
                    Comparaison mensuelle des montants
                  </CardDescription>
                </div>
                <ChartLegend
                  labelN="CA TTC Total"
                  labelN1="CA Encaissé"
                  colorN="hsl(221, 83%, 53%)"
                  colorN1="hsl(142, 76%, 36%)"
                  solid
                />
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    caTTCTotal: {
                      label: "CA TTC Total",
                      color: "hsl(221, 83%, 53%)",
                    },
                    caEncaisseTTC: {
                      label: "CA Encaissé",
                      color: "hsl(142, 76%, 36%)",
                    },
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
                      tickFormatter={(value) =>
                        `${(value / 1000000).toFixed(0)}M`
                      }
                      fontSize={12}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => [
                            formatCompactOnly(value as number),
                            name === "CA TTC Total"
                              ? "CA TTC Total"
                              : "CA Encaissé",
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

            {/* Top 10 Créances - Analyse des créances clients */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PiWarningDuotone className="w-5 h-5 text-orange-500" />
                  <div>
                    <CardTitle>Analyse des Créances - Top 10</CardTitle>
                    <CardDescription>
                      Clients avec les créances les plus élevées (Solde = CA TTC
                      Total - CA Encaissé TTC)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {recouvrementData.topCreances &&
                recouvrementData.topCreances.length > 0 ? (
                  <div className="space-y-6">
                    {/* Histogramme horizontal */}
                    <ChartContainer
                      config={{
                        soldeCreance: {
                          label: "Solde créance",
                          color: "hsl(25, 95%, 53%)",
                        },
                      }}
                      className="h-[220px] w-full"
                    >
                      <BarChart
                        data={recouvrementData.topCreances}
                        layout="vertical"
                        margin={{ top: 10, right: 30, left: 15, bottom: 10 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={true}
                          vertical={false}
                        />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => formatCompactOnly(value)}
                          fontSize={11}
                        />
                        <YAxis
                          type="category"
                          dataKey="nomClient"
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                          width={140}
                          tick={{ fill: "hsl(var(--foreground))" }}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name, props) => {
                                const item = props.payload;
                                return [
                                  <div key="tooltip" className="space-y-1">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                                      <span>CA TTC Total:</span>
                                      <span className="font-medium">
                                        {formatCompactOnly(item.caTTCTotal)}
                                      </span>
                                      <span>CA Encaissé:</span>
                                      <span className="font-medium">
                                        {formatCompactOnly(item.caEncaisseTTC)}
                                      </span>
                                      <span className="text-orange-600">
                                        Solde créance:
                                      </span>
                                      <span className="font-medium text-orange-600">
                                        {formatCompactOnly(item.soldeCreance)}
                                      </span>
                                      <span>% du total:</span>
                                      <span className="font-medium">
                                        {item.pourcentageTotal.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>,
                                  "",
                                ];
                              }}
                            />
                          }
                        />
                        <Bar
                          dataKey="soldeCreance"
                          name="Solde créance"
                          fill="hsl(25, 95%, 53%)"
                          radius={[0, 4, 4, 0]}
                        />
                        <Legend />
                      </BarChart>
                    </ChartContainer>

                    {/* Liste détaillée */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
                        <div className="col-span-1">#</div>
                        <div className="col-span-4">Entreprise</div>
                        <div className="col-span-2 text-right">
                          CA TTC Total
                        </div>
                        <div className="col-span-2 text-right">CA Encaissé</div>
                        <div className="col-span-2 text-right">Solde</div>
                        <div className="col-span-1 text-right">%</div>
                      </div>
                      {recouvrementData.topCreances.map((client, index) => (
                        <div
                          key={client.numeroClient}
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
                          <div className="col-span-4">
                            <div className="font-medium truncate">
                              {client.nomClient}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {client.numeroClient}
                            </div>
                          </div>
                          <div className="col-span-2 text-right font-medium text-blue-600">
                            {formatCompactOnly(client.caTTCTotal)}
                          </div>
                          <div className="col-span-2 text-right font-medium text-green-600">
                            {formatCompactOnly(client.caEncaisseTTC)}
                          </div>
                          <div className="col-span-2 text-right font-bold text-orange-600">
                            {formatCompactOnly(client.soldeCreance)}
                          </div>
                          <div className="col-span-1 text-right">
                            <Badge variant="outline" className="text-xs">
                              {client.pourcentageTotal.toFixed(1)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {/* Total */}
                      <div className="grid grid-cols-12 gap-4 p-3 bg-muted font-medium text-sm border-t">
                        <div className="col-span-1"></div>
                        <div className="col-span-4">Total Top 10</div>
                        <div className="col-span-2 text-right"></div>
                        <div className="col-span-2 text-right"></div>
                        <div className="col-span-2 text-right font-bold text-orange-600">
                          {formatCompactOnly(recouvrementData.totalCreances)}
                        </div>
                        <div className="col-span-1 text-right">
                          <Badge variant="outline" className="text-xs">
                            100%
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <AlertTriangle className="w-12 h-12 mb-2 opacity-20" />
                    <p>Aucune créance client disponible</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={hideNav ? "" : "flex h-full"}>
      {/* Sidebar Navigation */}
      {!hideNav && (
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
                      : "hover:bg-muted",
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
                        isExpanded && "rotate-180",
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
      )}

      {/* Main Content */}
      <div className={hideNav ? "" : "flex-1 p-6 overflow-auto"}>
        {/* Header */}
        {hideNav ? (
          /* Barre de filtres globaux (Synthèse / Chiffres / Résultats) — l'état
             est partagé donc une modification sur n'importe lequel de ces
             onglets s'applique aux autres. Recouvrement conserve sa propre
             barre dédiée car son calcul impose le mode périodique. */
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {activeTab !== "recouvrement" ? (
              <>
                <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
                  <span className="text-xs text-[#335890]">Mode calcul :</span>
                  <Select
                    value={periodType === "ytd" ? "cumule" : "periodique"}
                    onValueChange={(v: string) =>
                      setPeriodType(v === "cumule" ? "ytd" : "year")
                    }
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
                      onClick={() => handleYearChange("prev")}
                      disabled={
                        data.availableYears.indexOf(year) >=
                        data.availableYears.length - 1
                      }
                      className="text-[#94A3B8] hover:text-[#0077C3] disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      title="Année suivante"
                      onClick={() => handleYearChange("next")}
                      disabled={data.availableYears.indexOf(year) <= 0}
                      className="text-[#94A3B8] hover:text-[#0077C3] disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {periodType !== "ytd" && (
                  <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
                    <span className="text-xs text-[#335890]">
                      Granularité :
                    </span>
                    <Select
                      value={periodType === "month" ? "month" : "year"}
                      onValueChange={(v: string) =>
                        setPeriodType(v as PeriodType)
                      }
                    >
                      <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="year">Année</SelectItem>
                        <SelectItem value="month">Mois</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(periodType === "ytd" || periodType === "month") && (
                  <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
                    <span className="text-xs text-[#335890]">Mois :</span>
                    <Select
                      value={selectedMonth}
                      onValueChange={setSelectedMonth}
                    >
                      <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E]">
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
                  </div>
                )}
                {/* Period indicator */}
                <div className="flex items-center gap-2 bg-[#F5F9FF] rounded-lg px-4 h-10 text-xs text-[#335890]">
                  <CalendarRange className="w-3.5 h-3.5 text-[#0077C3]" />
                  <span>{getPeriodLabel()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
                  <span className="text-xs text-[#335890]">Mode calcul :</span>
                  <span className="font-semibold text-[#00122E]">
                    Périodique
                  </span>
                </div>
                <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
                  <span className="text-xs text-[#335890]">Année :</span>
                  <Select
                    value={recouvrementYear}
                    onValueChange={setRecouvrementYear}
                  >
                    <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[60px] font-semibold text-[#00122E]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.availableYears.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
                  <span className="text-xs text-[#335890]">Mois :</span>
                  <Select
                    value={recouvrementMonth}
                    onValueChange={setRecouvrementMonth}
                  >
                    <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Period indicator */}
                <div className="flex items-center gap-2 bg-[#F5F9FF] rounded-lg px-4 h-10 text-xs text-[#335890]">
                  <CalendarRange className="w-3.5 h-3.5 text-[#0077C3]" />
                  <span>
                    Janvier -{" "}
                    {MONTHS.find((m) => m.value === recouvrementMonth)?.label}{" "}
                    {recouvrementYear}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">{data.client.name}</h2>
              <p className="text-muted-foreground">
                Reporting comptable - Année{" "}
                {activeTab === "recouvrement" ? recouvrementYear : year}
              </p>
              <p>Devise : K FCFA</p>
            </div>
            {activeTab !== "recouvrement" ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    variant={periodType === "year" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPeriodType("year")}
                    className="gap-1 h-9"
                  >
                    <Calendar className="w-4 h-4" />
                    Périodique
                  </Button>
                  <Button
                    variant={periodType === "ytd" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPeriodType("ytd")}
                    className="gap-1 h-9"
                  >
                    <CalendarRange className="w-4 h-4" />
                    Cumulé
                  </Button>
                </div>

                {periodType === "ytd" && (
                  <Select
                    value={selectedMonth}
                    onValueChange={setSelectedMonth}
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
            ) : (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Période d&apos;analyse :
                </span>
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
            )}
          </div>
        )}

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </div>
  );
}
