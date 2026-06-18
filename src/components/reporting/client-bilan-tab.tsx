"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================================
// Onglet "Bilan" — Bilan d'activité périodique (rapport narratif)
// Compose les endpoints existants :
//   - /api/clients/[id]/reporting              (CA, trésorerie, VA, résultat…)
//   - /api/clients/[id]/reporting/recouvrement (taux, créances, Top 10)
// IMPORTANT : ce rapport travaille TOUJOURS en cumulé (YTD Jan → mois
// sélectionné), quel que soit le "Mode calcul" choisi dans la barre de filtres.
// ============================================================================

type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientBilanTabProps {
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

// ---- Types des réponses API (sous-ensemble utilisé ici) --------------------
interface ReportingIndicateurs {
  chiffreAffaires: number;
  margeCommerciale: number;
  masseSalariale: number;
  resultatExploitation: number;
  resultatFinancier: number;
  resultatHAO: number;
  resultatNet: number;
  soldeTresorerie: number;
  valeurAjoutee: number;
  ebe: number;
  produitsAdditionnels: number;
  totalAchats: number;
  impotResultat: number;
}

interface ReportingVariations {
  chiffreAffaires: number;
  resultatNet: number;
  soldeTresorerie: number;
}

interface ReportingChartPoint {
  label: string;
  chiffreAffaires: number;
  chiffreAffairesN1: number;
  soldeTresorerie: number;
  soldeTresorerieN1: number;
}

interface ReportingData {
  yearN1: string;
  chartData: ReportingChartPoint[];
  indicateurs: {
    anneeN: ReportingIndicateurs;
    anneeN1: ReportingIndicateurs;
    variations: ReportingVariations;
  };
}

interface RecouvrementChartPoint {
  label: string;
  caTTCTotal: number;
  caEncaisseTTC: number;
  tauxRecouvrement: number;
  tauxRecouvrementCumule: number;
}

interface TopCreance {
  numeroClient: string;
  nomClient: string;
  caTTCTotal: number;
  caEncaisseTTC: number;
  soldeCreance: number;
  pourcentageTotal: number;
}

interface RecouvrementData {
  chartData: RecouvrementChartPoint[];
  totals: {
    caTTCTotal: number;
    caEncaisseTTC: number;
    tauxRecouvrement: number;
    soldeCreances: number;
  };
  topCreances: TopCreance[];
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

// ---- Helpers de formatage --------------------------------------------------
// Les montants API sont en FCFA ; le rapport s'exprime en "K FCFA" (milliers).
function fmtK(value: number): string {
  return Math.round(value / 1000).toLocaleString("fr-FR");
}

function fmtMillions(value: number): string {
  const v = value / 1_000_000;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}M`;
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Bloc "valeur en gras" pour la narration.
function B({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-[#00122E]">{children}</span>;
}

// Badge de variation (signe, %, flèche, couleur).
function Variation({ value }: { value: number }) {
  const positive = value > 0.05;
  const negative = value < -0.05;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  const color = positive
    ? "text-green-600"
    : negative
      ? "text-red-600"
      : "text-[#94A3B8]";
  const sign = positive ? "+" : "";
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold", color)}>
      <Icon className="w-4 h-4" />
      {sign}
      {value.toFixed(1)}%
    </span>
  );
}

// ---- Légende N vs N-1 (réplique de client-reporting-chart.tsx) -------------
function LegendLine({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
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
}

function ChartLegend({
  labelN,
  labelN1,
  colorN = "#000000",
  colorN1,
  solid = false,
}: {
  labelN: string | number;
  labelN1?: string | number;
  colorN?: string;
  colorN1?: string;
  solid?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 shrink-0">
      <span className="text-base font-semibold text-[#335890]">Légende</span>
      <div className="flex items-center gap-3">
        <LegendLine color={colorN} />
        <span
          className="text-base font-medium"
          style={{ color: colorN }}
        >
          {labelN}
        </span>
      </div>
      {labelN1 !== undefined && (
        <div className="flex items-center gap-3">
          <LegendLine color={colorN1 ?? colorN} dashed={!solid} />
          <span
            className="text-base font-medium"
            style={{ color: colorN1 ?? colorN }}
          >
            {labelN1}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ClientBilanTab({
  clientId,
  year,
  setYear,
  periodType,
  setPeriodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
  setCumulGranularity,
}: ClientBilanTabProps) {
  const [reporting, setReporting] = useState<ReportingData | null>(null);
  const [recouvrement, setRecouvrement] = useState<RecouvrementData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years: string[] = [];
    for (let y = current + 2; y >= current - 10; y--) years.push(y.toString());
    return years;
  }, []);

  // Mois de fin du cumul : année entière (mode Année / granularité Année) →
  // Décembre ; sinon le mois sélectionné. Le rapport est TOUJOURS cumulé.
  const endMonth =
    periodType === "year" || cumulGranularity === "annee"
      ? "12"
      : selectedMonth;

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const startPeriod = `${year}-01`;
        const endPeriod = `${year}-${endMonth}`;

        // On force periodType=ytd (cumulé) pour obtenir des indicateurs et une
        // courbe cumulés — indépendamment du mode de calcul de la barre.
        const reportingUrl = `/api/clients/${clientId}/reporting?year=${year}&periodType=ytd&month=${endMonth}`;
        const recouvrementUrl = `/api/clients/${clientId}/reporting/recouvrement?endPeriod=${endPeriod}&startPeriod=${startPeriod}`;

        const [r1, r2] = await Promise.all([
          fetch(reportingUrl),
          fetch(recouvrementUrl),
        ]);
        if (!r1.ok) throw new Error("Erreur API reporting");
        if (!r2.ok) throw new Error("Erreur API recouvrement");
        const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
        setReporting(j1 as ReportingData);
        setRecouvrement(j2 as RecouvrementData);
      } catch (error) {
        console.error("Fetch bilan error:", error);
        toast.error("Erreur lors du chargement du bilan d'activité");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [clientId, year, endMonth]);

  const handleYearChange = (direction: "prev" | "next") => {
    const idx = yearOptions.indexOf(year);
    if (direction === "prev" && idx < yearOptions.length - 1) {
      setYear(yearOptions[idx + 1]);
    } else if (direction === "next" && idx > 0) {
      setYear(yearOptions[idx - 1]);
    }
  };

  const getPeriodLabel = (): string => {
    if (periodType === "year") return `Janvier - Décembre ${year}`;
    if (cumulGranularity === "annee") return `Janvier - Décembre ${year}`;
    const m = MONTHS.find((x) => x.value === selectedMonth);
    return `Janvier - ${m?.label || ""} ${year}`;
  };

  const yearN1 = reporting?.yearN1 ?? (parseInt(year) - 1).toString();

  // CA et trésorerie : séries toujours cumulées (N vs N-1).
  const caChart = useMemo(() => {
    if (!reporting) return [];
    return reporting.chartData.map((d) => ({
      label: d.label,
      caN: d.chiffreAffaires,
      caN1: d.chiffreAffairesN1,
    }));
  }, [reporting]);

  const tresoChart = useMemo(() => {
    if (!reporting) return [];
    return reporting.chartData.map((d) => ({
      label: d.label,
      tresoN: d.soldeTresorerie,
      tresoN1: d.soldeTresorerieN1,
    }));
  }, [reporting]);

  // Tunnel de rentabilité (réplique de client-reporting-chart.tsx) :
  // métriques SIG, % du CA, barres horizontales (négatif rouge / positif bleu).
  const tunnelData = useMemo(() => {
    if (!reporting) return [];
    const ind = reporting.indicateurs.anneeN;
    const ca = ind.chiffreAffaires;
    const metrics: { name: string; value: number }[] = [
      { name: "Chiffre d'affaires", value: ind.chiffreAffaires },
      { name: "Marge Commerciale", value: ind.margeCommerciale },
      { name: "Valeur Ajoutée", value: ind.valeurAjoutee },
      { name: "Rés. Exploitation", value: ind.resultatExploitation },
      { name: "Résultat Financier", value: ind.resultatFinancier },
      { name: "Résultat HAO", value: ind.resultatHAO },
      { name: "Résultat Net", value: ind.resultatNet },
    ];
    return metrics.map((m) => ({
      ...m,
      percentage: ca !== 0 ? (m.value / ca) * 100 : 0,
    }));
  }, [reporting]);

  const maxAbsValue = useMemo(() => {
    if (tunnelData.length === 0) return 0;
    return Math.max(...tunnelData.map((d) => Math.abs(d.value)));
  }, [tunnelData]);

  return (
    <div className="space-y-6">
      {/* Barre de filtres globaux — identique aux autres onglets reporting. */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
          <span className="text-xs text-[#335890]">Mode calcul :</span>
          <Select
            value={
              periodType === "ytd" || periodType === "ytd-day"
                ? "cumule"
                : "periodique"
            }
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
              onClick={() => handleYearChange("prev")}
              disabled={yearOptions.indexOf(year) >= yearOptions.length - 1}
              className="text-[#94A3B8] hover:text-[#0077C3] disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              title="Année suivante"
              onClick={() => handleYearChange("next")}
              disabled={yearOptions.indexOf(year) <= 0}
              className="text-[#94A3B8] hover:text-[#0077C3] disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {periodType !== "ytd" && periodType !== "ytd-day" ? (
          <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
            <span className="text-xs text-[#335890]">Granularité :</span>
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
          </div>
        ) : (
          <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
            <span className="text-xs text-[#335890]">Granularité :</span>
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
          </div>
        )}
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
          <span>{getPeriodLabel()}</span>
        </div>
      </div>

      <h1 className="text-3xl font-bold text-[#00122E]">
        Bilan d&apos;activité périodique
      </h1>
      <p className="text-sm text-[#335890] italic -mt-3">
        Période : {getPeriodLabel()} — comparaison avec {yearN1} (valeurs
        cumulées).
      </p>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !reporting || !recouvrement ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Aucune donnée disponible pour cette période
        </div>
      ) : (
        <>
          {/* ============================ 1. CHIFFRE D'AFFAIRES ============= */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-[#0077C3] border-b border-[#D0E3F5] pb-2">
              1. Chiffre d&apos;affaires
            </h2>
            <p className="text-[#00122E] leading-relaxed">
              Sur la période <B>{getPeriodLabel()}</B>, vous avez réalisé un
              chiffre d&apos;affaires de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.chiffreAffaires)} K FCFA</B>{" "}
              qui traduit une évolution de{" "}
              <Variation
                value={reporting.indicateurs.variations.chiffreAffaires}
              />{" "}
              par rapport à l&apos;année précédente.
            </p>
            <p className="text-[#335890]">
              Voici la tendance d&apos;évolution de votre chiffre d&apos;affaires
              (cumulé) :
            </p>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Évolution du Chiffre d&apos;Affaires</CardTitle>
                  <CardDescription>
                    Cumulé — {year} vs {yearN1}
                  </CardDescription>
                </div>
                <ChartLegend
                  labelN={`CA ${year}`}
                  labelN1={`CA ${yearN1}`}
                  colorN="hsl(221, 83%, 53%)"
                  colorN1="hsl(221, 83%, 73%)"
                />
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    caN: { label: `CA ${year}`, color: "hsl(221, 83%, 53%)" },
                    caN1: { label: `CA ${yearN1}`, color: "hsl(221, 83%, 73%)" },
                  }}
                  className="h-[350px] w-full"
                >
                  <LineChart
                    data={caChart}
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
                      tickFormatter={(v) => fmtMillions(v as number)}
                      fontSize={12}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => [
                            `${fmtK(value as number)} K`,
                            name === "caN" ? `CA ${year}` : `CA ${yearN1}`,
                          ]}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="caN1"
                      name="caN1"
                      stroke="hsl(221, 83%, 73%)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      strokeDasharray="5 5"
                    />
                    <Line
                      type="monotone"
                      dataKey="caN"
                      name="caN"
                      stroke="hsl(221, 83%, 53%)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          {/* ============================ 2. RECOUVREMENT ================== */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-[#0077C3] border-b border-[#D0E3F5] pb-2">
              2. Recouvrement
            </h2>
            <p className="text-[#00122E] leading-relaxed">
              Vous avez pu encaisser{" "}
              <B>{fmtPct(recouvrement.totals.tauxRecouvrement)}</B> des montants
              facturés à vos clients sur cette période. Ce taux inclut les
              factures clients non soldées des années précédentes.
            </p>
            <p className="text-[#335890]">
              Voici la courbe d&apos;évolution de votre taux de recouvrement :
            </p>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Évolution du Taux de Recouvrement</CardTitle>
                  <CardDescription>
                    (Encaissements Clients TTC / Créances Clients TTC) × 100
                  </CardDescription>
                </div>
                <ChartLegend
                  labelN="Taux cumulé"
                  labelN1="Taux périodique"
                  colorN="hsl(262, 83%, 58%)"
                  colorN1="hsl(262, 83%, 78%)"
                />
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    tauxRecouvrementCumule: {
                      label: "Taux cumulé",
                      color: "hsl(262, 83%, 58%)",
                    },
                    tauxRecouvrement: {
                      label: "Taux périodique",
                      color: "hsl(262, 83%, 78%)",
                    },
                  }}
                  className="h-[350px] w-full"
                >
                  <LineChart
                    data={recouvrement.chartData}
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
                      tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
                      fontSize={12}
                      domain={[0, "auto"]}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => [
                            `${(value as number).toFixed(1)}%`,
                            name === "Taux cumulé"
                              ? "Taux cumulé"
                              : "Taux périodique",
                          ]}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="tauxRecouvrementCumule"
                      name="Taux cumulé"
                      stroke="hsl(262, 83%, 58%)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tauxRecouvrement"
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
            <p className="text-sm text-[#335890]">
              Le taux périodique prend en compte uniquement les factures et les
              encaissements du mois. Le taux cumulé prend en compte toutes les
              factures non soldées (y compris celles des années précédentes) et
              tous les encaissements depuis le début de l&apos;année.
            </p>
            <p className="text-[#335890]">
              Ci-dessous, une comparaison de ce que vos clients vous doivent et
              de ce que vous avez encaissé mois par mois sur cette période :
            </p>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>
                    Créances Clients TTC vs Encaissements Clients TTC
                  </CardTitle>
                  <CardDescription>
                    Comparaison mensuelle des montants
                  </CardDescription>
                </div>
                <ChartLegend
                  labelN="Créances Clients TTC"
                  labelN1="Encaissements Clients TTC"
                  colorN="hsl(221, 83%, 53%)"
                  colorN1="hsl(221, 83%, 73%)"
                  solid
                />
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    caTTCTotal: {
                      label: "Créances Clients TTC",
                      color: "hsl(221, 83%, 53%)",
                    },
                    caEncaisseTTC: {
                      label: "Encaissements Clients TTC",
                      color: "hsl(221, 83%, 73%)",
                    },
                  }}
                  className="h-[350px] w-full"
                >
                  <BarChart
                    data={recouvrement.chartData}
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
                      tickFormatter={(v) => fmtMillions(v as number)}
                      fontSize={12}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => [
                            formatCompactOnly(value as number),
                            name === "Créances Clients TTC"
                              ? "Créances Clients TTC"
                              : "Encaissements Clients TTC",
                          ]}
                        />
                      }
                    />
                    <Bar
                      dataKey="caTTCTotal"
                      name="Créances Clients TTC"
                      fill="hsl(221, 83%, 53%)"
                      barSize={24}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="caEncaisseTTC"
                      name="Encaissements Clients TTC"
                      fill="hsl(221, 83%, 73%)"
                      barSize={24}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <p className="text-[#335890]">
              Pour mieux comprendre ces chiffres, voici le détail de vos créances
              par client, limité aux dix (10) plus gros clients :
            </p>
            <TopCreancesTable rows={recouvrement.topCreances} />
          </section>

          {/* ============================ 3. TRÉSORERIE =================== */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-[#0077C3] border-b border-[#D0E3F5] pb-2">
              3. Trésorerie
            </h2>
            <p className="text-[#00122E] leading-relaxed">
              Au terme de cette période, vous avez un montant de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.soldeTresorerie)} K FCFA</B>{" "}
              disponible à la banque et en caisse. Ce montant est en évolution de{" "}
              <Variation
                value={reporting.indicateurs.variations.soldeTresorerie}
              />{" "}
              par rapport à l&apos;année dernière.
            </p>
            <p className="text-[#335890]">
              Voici la courbe d&apos;évolution de vos avoirs en banque et en
              caisse (solde toujours cumulé) :
            </p>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Évolution de la Trésorerie</CardTitle>
                  <CardDescription>
                    Solde toujours cumulé — {year} vs {yearN1}
                  </CardDescription>
                </div>
                <ChartLegend
                  labelN={`Trésorerie ${year}`}
                  labelN1={`Trésorerie ${yearN1}`}
                  colorN="#5FC7B9"
                />
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    tresoN: {
                      label: `Trésorerie ${year}`,
                      color: "hsl(174, 72%, 46%)",
                    },
                    tresoN1: {
                      label: `Trésorerie ${yearN1}`,
                      color: "hsl(174, 72%, 66%)",
                    },
                  }}
                  className="h-[350px] w-full"
                >
                  <LineChart
                    data={tresoChart}
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
                      tickFormatter={(v) => fmtMillions(v as number)}
                      fontSize={12}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => [
                            `${fmtK(value as number)} K`,
                            name === "tresoN"
                              ? `Trésorerie ${year}`
                              : `Trésorerie ${yearN1}`,
                          ]}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="tresoN1"
                      name="tresoN1"
                      stroke="hsl(174, 72%, 66%)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      strokeDasharray="5 5"
                    />
                    <Line
                      type="monotone"
                      dataKey="tresoN"
                      name="tresoN"
                      stroke="hsl(174, 72%, 46%)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          {/* ============================ 4. RÉSULTAT ===================== */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-[#0077C3] border-b border-[#D0E3F5] pb-2">
              4. Résultat
            </h2>
            <p className="text-[#00122E] leading-relaxed">
              Votre activité de cette période se solde par un résultat{" "}
              {reporting.indicateurs.anneeN.resultatNet >= 0
                ? "positif"
                : "négatif"}{" "}
              de <B>{fmtK(reporting.indicateurs.anneeN.resultatNet)} K FCFA</B> ;
              ce qui traduit une évolution de{" "}
              <Variation value={reporting.indicateurs.variations.resultatNet} />{" "}
              par rapport à l&apos;année précédente.
            </p>
            <p className="text-[#335890]">
              Analysons ce tunnel pour comprendre comment s&apos;est formé votre
              résultat :
            </p>
            <TunnelRentabilite data={tunnelData} maxAbsValue={maxAbsValue} />
            <p className="text-[#00122E] leading-relaxed">
              De votre chiffre d&apos;affaires de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.chiffreAffaires)} K FCFA</B>{" "}
              et des produits additionnels constatés pour un montant total de{" "}
              <B>
                {fmtK(reporting.indicateurs.anneeN.produitsAdditionnels)} K FCFA
              </B>
              , vous avez financé divers achats et services pour un montant total
              de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.totalAchats)} K FCFA</B> ; ce
              qui vous a conduit à une Valeur Ajoutée de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.valeurAjoutee)} K FCFA</B>.
            </p>
            <p className="text-[#335890]">
              Une valeur ajoutée positive signifie que votre entreprise crée une
              richesse qui sera utilisée pour financer les salaires, les
              partenaires financiers, l&apos;État et bien sûr les associés ou
              actionnaires.
            </p>
            <p className="text-[#00122E] leading-relaxed">
              À partir de cette valeur ajoutée, vous avez financé les charges de
              personnel pour un montant de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.masseSalariale)} K FCFA</B>.
              Après constatation de charges et produits non décaissables
              (amortissements, provisions et dépréciations), vous obtenez un
              résultat d&apos;exploitation de{" "}
              <B>
                {fmtK(reporting.indicateurs.anneeN.resultatExploitation)} K FCFA
              </B>
              .
            </p>
            <p className="text-[#335890]">
              Le résultat d&apos;exploitation représente la richesse créée par
              votre activité principale. Un résultat d&apos;exploitation positif
              est déjà un premier signe que votre entreprise se porte bien. Ce
              résultat est impacté par vos revenus de placement, charges
              d&apos;intérêts ainsi que les produits nets issus de la cession de
              vos biens.
            </p>
            <p className="text-[#00122E] leading-relaxed">
              Enfin, vous avez supporté l&apos;impôt sur le résultat pour un
              montant de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.impotResultat)} K FCFA</B> ;
              ce qui a conduit à un résultat net de{" "}
              <B>{fmtK(reporting.indicateurs.anneeN.resultatNet)} K FCFA</B>.
            </p>
            <p className="text-[#335890]">
              Le résultat net, s&apos;il est positif et supérieur aux pertes des
              années antérieures, sert à rémunérer les propriétaires de
              l&apos;entreprise après déduction des réserves légales.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// ==================== FORMAT COMPACT (réplique reporting-chart) ====================
function formatCompactOnly(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return `${Math.round(value / 1000).toLocaleString("fr-FR")}K`;
  }
  return value.toLocaleString("fr-FR");
}

// ==================== TUNNEL DE RENTABILITÉ (réplique) ====================
function TunnelRentabilite({
  data,
  maxAbsValue,
}: {
  data: { name: string; value: number; percentage: number }[];
  maxAbsValue: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tunnel de rentabilité</CardTitle>
        <CardDescription>
          Décomposition du résultat - Base 100% = Chiffre d&apos;affaires
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item) => {
            const barWidth =
              maxAbsValue !== 0 ? (Math.abs(item.value) / maxAbsValue) * 85 : 0;
            const isPositive = item.value >= 0;
            return (
              <div key={item.name} className="flex items-center gap-4">
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
}

// ==================== TABLEAU TOP 10 CRÉANCES ====================
function TopCreancesTable({ rows }: { rows: TopCreance[] }) {
  const total = rows.reduce((s, r) => s + r.soldeCreance, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 des créances clients</CardTitle>
        <CardDescription>
          Solde = Créances TTC − Encaissé TTC (hors comptes 418 et 419)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Client</div>
              <div className="col-span-2 text-right">Créances TTC</div>
              <div className="col-span-2 text-right">Encaissé TTC</div>
              <div className="col-span-2 text-right">Solde créance</div>
              <div className="col-span-2 text-right">%</div>
            </div>
            {rows.map((row, index) => (
              <div
                key={`${row.numeroClient}-${index}`}
                className={cn(
                  "grid grid-cols-12 gap-4 p-3 text-sm items-center",
                  index % 2 === 0 ? "bg-background" : "bg-muted/20",
                )}
              >
                <div className="col-span-1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                      index === 0 && "bg-blue-100 text-blue-700",
                      index === 1 && "bg-blue-50 text-blue-600",
                      index === 2 && "bg-sky-50 text-sky-600",
                      index > 2 && "bg-gray-100 text-gray-600",
                    )}
                  >
                    {index + 1}
                  </span>
                </div>
                <div className="col-span-3">
                  <div className="font-medium truncate">{row.nomClient}</div>
                  {row.numeroClient && (
                    <div className="text-xs text-muted-foreground">
                      {row.numeroClient}
                    </div>
                  )}
                </div>
                <div className="col-span-2 text-right font-medium text-blue-600">
                  {fmtK(row.caTTCTotal)} K
                </div>
                <div className="col-span-2 text-right font-medium text-green-600">
                  {fmtK(row.caEncaisseTTC)} K
                </div>
                <div className="col-span-2 text-right font-bold text-orange-600">
                  {fmtK(row.soldeCreance)} K
                </div>
                <div className="col-span-2 text-right">
                  <Badge variant="outline" className="text-xs">
                    {row.pourcentageTotal.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted font-medium text-sm border-t">
              <div className="col-span-1"></div>
              <div className="col-span-3">Total Top 10</div>
              <div className="col-span-2 text-right"></div>
              <div className="col-span-2 text-right"></div>
              <div className="col-span-2 text-right font-bold text-orange-600">
                {fmtK(total)} K
              </div>
              <div className="col-span-2 text-right"></div>
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
  );
}
