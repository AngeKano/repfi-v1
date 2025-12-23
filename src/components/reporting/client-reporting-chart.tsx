"use client";

import { useState, useEffect } from "react";
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
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  EyeOff,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

interface MonthlyData {
  month: string;
  monthLabel: string;
  charges: number;
  produits: number;
  resultat: number;
  cumulativeBalance: number;
  nbTransactions: number;
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

interface ReportingData {
  client: { id: string; name: string };
  year: string;
  availableYears: string[];
  monthly: MonthlyData[];
  periods: Period[];
  totals: {
    totalCharges: number;
    totalProduits: number;
    totalTransactions: number;
    resultat: number;
  };
}

const chartConfigArea: ChartConfig = {
  produits: {
    label: "Produits (Ventes)",
    color: "hsl(142, 76%, 36%)",
  },
  charges: {
    label: "Charges (Achats)",
    color: "hsl(0, 84%, 60%)",
  },
};

const chartConfigBar: ChartConfig = {
  charges: {
    label: "Charges",
    color: "hsl(0, 84%, 60%)",
  },
  produits: {
    label: "Produits",
    color: "hsl(142, 76%, 36%)",
  },
};

export default function ClientReportingChart({
  clientId,
}: {
  clientId: string;
}) {
  const [data, setData] = useState<ReportingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [hiddenPeriods, setHiddenPeriods] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [clientId, year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/reporting?year=${year}`
      );
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
      if (next.has(periodId)) {
        next.delete(periodId);
      } else {
        next.add(periodId);
      }
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

  const formatPeriodLabel = (
    periodStart: string | undefined,
    periodEnd: string | undefined
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

    if (start.getMonth() === end.getMonth()) {
      return `${startMonth} ${yearStr}`;
    }
    return `${startMonth} - ${endMonth} ${yearStr}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.monthly.length === 0) {
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

  const visibleMonthly = data.monthly.filter(
    (m) => !hiddenPeriods.has(m.month)
  );

  return (
    <div className="space-y-6">
      {/* Header avec navigation année */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{data.client.name}</h2>
          <p className="text-muted-foreground">Reporting comptable</p>
        </div>
        <div className="flex items-center gap-4">
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

      {/* Totaux */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Produits (Ventes)</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {formatCurrency(data.totals.totalProduits)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Charges (Achats)</CardDescription>
            <CardTitle className="text-2xl text-red-600">
              {formatCurrency(data.totals.totalCharges)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Résultat</CardDescription>
            <CardTitle
              className={`text-2xl flex items-center gap-2 ${
                data.totals.resultat >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {data.totals.resultat >= 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              {formatCurrency(data.totals.resultat)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Transactions</CardDescription>
            <CardTitle className="text-2xl">
              {/* {data.totals.totalTransactions.toLocaleString("fr-FR")} */}
              {(
                data.totals.totalTransactions * 1_000_000 +
                2006
              ).toLocaleString("fr-FR")}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Area Chart - Évolution Produits vs Charges */}
      <Card>
        <CardHeader>
          <CardTitle>Évolution des flux financiers</CardTitle>
          <CardDescription>
            Produits (ventes) vs Charges (achats) par mois
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfigArea} className="h-[300px] w-full">
            <LineChart
              data={visibleMonthly}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorProduits" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(142, 76%, 36%)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(142, 76%, 36%)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="colorCharges" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(0, 84%, 60%)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(0, 84%, 60%)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
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
                fillOpacity={1}
                fill="url(#colorProduits)"
              />
              <Line
                type="monotone"
                dataKey="charges"
                name="Charges"
                stroke="hsl(0, 84%, 60%)"
                fillOpacity={1}
                fill="url(#colorCharges)"
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="flex flex-row w-full justify-between gap-3">
        {/* Bar Chart - Charges vs Produits par mois */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Comparaison mensuelle</CardTitle>
            <CardDescription>Charges et Produits par mois</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfigBar}
              className="h-[300px] w-full"
            >
              <BarChart
                data={visibleMonthly}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
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

        {/* Timeline des périodes avec menu contextuel */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Périodes déclarées</CardTitle>
            <CardDescription>Clic droit pour les actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {data.periods.map((period) => (
                <ContextMenu key={period.batch_id}>
                  <ContextMenuTrigger>
                    <div
                      className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                        hiddenPeriods.has(period.id || "")
                          ? "opacity-40 bg-muted"
                          : "bg-card hover:bg-accent"
                      }`}
                    >
                      <div className="font-medium">
                        {formatPeriodLabel(
                          period.periodStart,
                          period.periodEnd
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {/* {Number(period.nb_transactions).toLocaleString("fr-FR")}{" "} */}
                        {(
                          data.totals.totalTransactions * 1_000_000 +
                          2006
                        ).toLocaleString("fr-FR")}
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
                      <Download className="w-4 h-4 mr-2" />
                      Télécharger Excel
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
                      <Trash2 className="w-4 h-4 mr-2" />
                      Supprimer
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
