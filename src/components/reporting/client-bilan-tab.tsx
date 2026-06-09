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
  Cell,
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
// Les filtres (Périodique/Cumulé, Année, Mois) sont partagés via le parent.
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
  masseSalariale: number;
  resultatExploitation: number;
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
  chiffreAffairesPeriodique: number;
  chiffreAffairesPeriodiqueN1: number;
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

  const mode: "cumule" | "periodique" =
    periodType === "ytd" || periodType === "ytd-day" ? "cumule" : "periodique";

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years: string[] = [];
    for (let y = current + 2; y >= current - 10; y--) years.push(y.toString());
    return years;
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        // Fenêtre (startPeriod → endPeriod) pour le recouvrement, calquée sur
        // client-dettes-tab.tsx.
        let startMonth: string;
        let endMonth: string;
        if (periodType === "month" || periodType === "ytd-day") {
          startMonth = "01";
          endMonth = selectedMonth;
        } else if (periodType === "year") {
          startMonth = "01";
          endMonth = "12";
        } else {
          // ytd
          startMonth = "01";
          endMonth = cumulGranularity === "annee" ? "12" : selectedMonth;
        }
        const startPeriod = `${year}-${startMonth}`;
        const endPeriod = `${year}-${endMonth}`;

        const reportingUrl = `/api/clients/${clientId}/reporting?year=${year}&periodType=${periodType}&month=${selectedMonth}`;
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
  }, [clientId, year, selectedMonth, periodType, cumulGranularity]);

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
    if (periodType === "ytd") {
      const m = MONTHS.find((x) => x.value === selectedMonth);
      return `Janvier - ${m?.label || ""} ${year}`;
    }
    if (periodType === "ytd-day") {
      const m = MONTHS.find((x) => x.value === selectedMonth);
      return `Janvier - ${m?.label || ""} ${year} (jour par jour)`;
    }
    const m = MONTHS.find((x) => x.value === selectedMonth);
    return `${m?.label || ""} ${year}`;
  };

  // Données dérivées pour les graphiques (sélection N / N-1 selon le mode).
  const caChart = useMemo(() => {
    if (!reporting) return [];
    return reporting.chartData.map((d) => ({
      label: d.label,
      caN:
        mode === "cumule" ? d.chiffreAffaires : d.chiffreAffairesPeriodique,
      caN1:
        mode === "cumule"
          ? d.chiffreAffairesN1
          : d.chiffreAffairesPeriodiqueN1,
    }));
  }, [reporting, mode]);

  const tresoChart = useMemo(() => {
    if (!reporting) return [];
    return reporting.chartData.map((d) => ({
      label: d.label,
      tresoN: d.soldeTresorerie,
      tresoN1: d.soldeTresorerieN1,
    }));
  }, [reporting]);

  // Tunnel de formation du résultat (niveaux SIG clés).
  const tunnelChart = useMemo(() => {
    if (!reporting) return [];
    const ind = reporting.indicateurs.anneeN;
    return [
      { label: "Chiffre d'affaires", value: ind.chiffreAffaires, fill: "#0077C3" },
      { label: "Valeur ajoutée", value: ind.valeurAjoutee, fill: "#0095F4" },
      { label: "EBE", value: ind.ebe, fill: "#38BDF8" },
      {
        label: "Résultat d'exploitation",
        value: ind.resultatExploitation,
        fill: "#22C55E",
      },
      { label: "Résultat net", value: ind.resultatNet, fill: "#16A34A" },
    ];
  }, [reporting]);

  const yearN1 = reporting?.yearN1 ?? (parseInt(year) - 1).toString();

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
        Période : {getPeriodLabel()} — comparaison avec {yearN1}.
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
              Voici la tendance d&apos;évolution de votre chiffre d&apos;affaires :
            </p>
            <Card>
              <CardContent className="pt-6">
                <ChartContainer
                  config={{
                    caN: { label: `CA ${year}`, color: "#0077C3" },
                    caN1: { label: `CA ${yearN1}`, color: "#94A3B8" },
                  }}
                  className="h-[300px] w-full"
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
                      dataKey="caN"
                      name="caN"
                      stroke="#0077C3"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="caN1"
                      name="caN1"
                      stroke="#94A3B8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      strokeDasharray="5 5"
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
              <CardContent className="pt-6">
                <ChartContainer
                  config={{
                    tauxRecouvrementCumule: {
                      label: "Taux cumulé",
                      color: "#0077C3",
                    },
                    tauxRecouvrement: {
                      label: "Taux périodique",
                      color: "#7DD3FC",
                    },
                  }}
                  className="h-[300px] w-full"
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
                            name === "tauxRecouvrementCumule"
                              ? "Taux cumulé"
                              : "Taux périodique",
                          ]}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="tauxRecouvrementCumule"
                      name="tauxRecouvrementCumule"
                      stroke="#0077C3"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tauxRecouvrement"
                      name="tauxRecouvrement"
                      stroke="#7DD3FC"
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
              <CardContent className="pt-6">
                <ChartContainer
                  config={{
                    caTTCTotal: { label: "Créances TTC", color: "#0077C3" },
                    caEncaisseTTC: { label: "Encaissé TTC", color: "#22C55E" },
                  }}
                  className="h-[300px] w-full"
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
                            `${fmtK(value as number)} K`,
                            name === "caTTCTotal"
                              ? "Créances TTC"
                              : "Encaissé TTC",
                          ]}
                        />
                      }
                    />
                    <Bar
                      dataKey="caTTCTotal"
                      name="caTTCTotal"
                      fill="#0077C3"
                      barSize={20}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="caEncaisseTTC"
                      name="caEncaisseTTC"
                      fill="#22C55E"
                      barSize={20}
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
              caisse :
            </p>
            <Card>
              <CardContent className="pt-6">
                <ChartContainer
                  config={{
                    tresoN: { label: `Trésorerie ${year}`, color: "#0077C3" },
                    tresoN1: {
                      label: `Trésorerie ${yearN1}`,
                      color: "#94A3B8",
                    },
                  }}
                  className="h-[300px] w-full"
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
                      dataKey="tresoN"
                      name="tresoN"
                      stroke="#0077C3"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tresoN1"
                      name="tresoN1"
                      stroke="#94A3B8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      strokeDasharray="5 5"
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
            <Card>
              <CardContent className="pt-6">
                <ChartContainer
                  config={{ value: { label: "Montant", color: "#0077C3" } }}
                  className="h-[320px] w-full"
                >
                  <BarChart
                    data={tunnelChart}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      angle={-20}
                      textAnchor="end"
                      height={70}
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
                          formatter={(value) => [`${fmtK(value as number)} K`, ""]}
                        />
                      }
                    />
                    <Bar dataKey="value" name="value" radius={[4, 4, 0, 0]}>
                      {tunnelChart.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
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
