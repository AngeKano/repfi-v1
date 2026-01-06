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
  AreaChart,
  Area,
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
  CreditCard,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

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
}

type PeriodType = "year" | "month" | "ytd";

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

  useEffect(() => {
    fetchData();
  }, [clientId, year, periodType, selectedMonth]);

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

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{data.client.name}</h2>
          <p className="text-muted-foreground">
            Reporting comptable - {getPeriodLabel()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Sélecteur de type de période */}
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

          {/* Sélecteur de mois */}
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

          {/* Navigation année */}
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

      {/* KPIs + Totaux - Grille 5x2 */}
      <div className="grid grid-cols-5 gap-4">
        {/* Ligne 1 */}
        {/* Chiffre d'affaires */}
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
              {formatCurrency(data.indicateurs.anneeN.chiffreAffaires)}
            </div>
            <p className="text-xs text-muted-foreground">
              {yearN1}:{" "}
              {formatCurrency(data.indicateurs.anneeN1.chiffreAffaires)}
            </p>
          </CardContent>
        </Card>

        {/* Marge Commerciale */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-1 text-xs">
                <ShoppingCart className="w-4 h-4 text-indigo-600" />
                Marge Comm.
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
              {formatCurrency(data.indicateurs.anneeN.margeCommerciale)}
            </div>
            <p className="text-xs text-muted-foreground">
              {yearN1}:{" "}
              {formatCurrency(data.indicateurs.anneeN1.margeCommerciale)}
            </p>
          </CardContent>
        </Card>

        {/* Masse salariale */}
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
              {formatCurrency(data.indicateurs.anneeN.masseSalariale)}
            </div>
            <p className="text-xs text-muted-foreground">
              {yearN1}:{" "}
              {formatCurrency(data.indicateurs.anneeN1.masseSalariale)}
            </p>
          </CardContent>
        </Card>

        {/* Résultat d'exploitation */}
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
              {formatCurrency(data.indicateurs.anneeN.resultatExploitation)}
            </div>
            <p className="text-xs text-muted-foreground">
              {yearN1}:{" "}
              {formatCurrency(data.indicateurs.anneeN1.resultatExploitation)}
            </p>
          </CardContent>
        </Card>

        {/* Résultat Net */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="flex items-center gap-1 text-xs">
                <PiggyBank className="w-4 h-4 text-green-600" />
                Résultat Net
              </CardDescription>
              <VariationBadge value={data.indicateurs.variations.resultatNet} />
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
              {formatCurrency(data.indicateurs.anneeN.resultatNet)}
            </div>
            <p className="text-xs text-muted-foreground">
              {yearN1}: {formatCurrency(data.indicateurs.anneeN1.resultatNet)}
            </p>
          </CardContent>
        </Card>

        {/* Ligne 2 */}
        {/* Trésorerie */}
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
              {formatCurrency(data.indicateurs.anneeN.soldeTresorerie)}
            </div>
            <p className="text-xs text-muted-foreground">
              {yearN1}:{" "}
              {formatCurrency(data.indicateurs.anneeN1.soldeTresorerie)}
            </p>
          </CardContent>
        </Card>

        {/* Produits */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Produits
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-green-600">
              {formatCurrency(data.totals.totalProduits)}
            </div>
          </CardContent>
        </Card>

        {/* Charges */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <CreditCard className="w-4 h-4 text-red-600" />
              Charges
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-red-600">
              {formatCurrency(data.totals.totalCharges)}
            </div>
          </CardContent>
        </Card>

        {/* Résultat période */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Receipt className="w-4 h-4" />
              Résultat Période
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div
              className={`text-xl font-bold flex items-center gap-1 ${
                data.totals.resultat >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {data.totals.resultat >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {formatCurrency(data.totals.resultat)}
            </div>
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <BarChart3 className="w-4 h-4" />
              Transactions
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold">
              {data.totals.totalTransactions.toLocaleString("fr-FR")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graphique Évolution du Chiffre d'Affaires N vs N-1 */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution du Chiffre d&apos;Affaires</CardTitle>
          <CardDescription>
            Comparaison {yearN} vs {yearN1} - par{" "}
            {getXAxisLabel().toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfigCA} className="h-[300px] w-full">
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
                      formatCurrency(value as number),
                      name === "chiffreAffaires"
                        ? `CA ${yearN}`
                        : `CA ${yearN1}`,
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

      {/* Graphique Évolution de la Trésorerie N vs N-1 - LineChart */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution de la Trésorerie</CardTitle>
          <CardDescription>
            Solde cumulé {yearN} vs {yearN1} - par{" "}
            {getXAxisLabel().toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={chartConfigTresorerie}
            className="h-[300px] w-full"
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
                      formatCurrency(value as number),
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

      {/* Graphique Flux financiers */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution des flux financiers</CardTitle>
          <CardDescription>
            Produits vs Charges - par {getXAxisLabel().toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfigFlux} className="h-[300px] w-full">
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
                      formatCurrency(value as number),
                      name,
                    ]}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="produits"
                name="Produits"
                stroke="hsl(142, 76%, 36%)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="charges"
                name="Charges"
                stroke="hsl(0, 84%, 60%)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Comparaison et Périodes */}
      <div className="flex flex-row w-full justify-between gap-4">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>
              Comparaison {periodType === "month" ? "journalière" : "mensuelle"}
            </CardTitle>
            <CardDescription>Charges et Produits</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfigFlux}
              className="h-[300px] w-full"
            >
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
                        formatCurrency(value as number),
                        name,
                      ]}
                    />
                  }
                />
                <Bar
                  dataKey="charges"
                  name="Charges"
                  fill="hsl(0, 84%, 60%)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="produits"
                  name="Produits"
                  fill="hsl(142, 76%, 36%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="flex-1">
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
                        {Number(period.nb_transactions).toLocaleString("fr-FR")}{" "}
                        transactions
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Badge
                          variant="outline"
                          className="text-xs text-red-600"
                        >
                          C: {formatCurrency(period.charges)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs text-green-600"
                        >
                          P: {formatCurrency(period.produits)}
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
                      <Download className="w-4 h-4 mr-2" /> Télécharger Excel
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
    </div>
  );
}
