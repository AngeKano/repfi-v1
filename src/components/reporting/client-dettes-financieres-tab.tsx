"use client";

// ============================================================================
// Onglet « Dettes Financières » — DA (emprunts) et DB (crédit-bail).
// Encours : le mode de calcul est verrouillé sur « Cumulé ». Les valeurs
// proviennent du même calcul que les ratios bilantiels.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "lucide-react";
import { PiBankDuotone, PiHandCoinsDuotone, PiKeyDuotone } from "react-icons/pi";
import { toast } from "sonner";
import { KpiGrid, formatCompactOnly, type KpiDef, type KpiValue } from "./kpi-grid";
import { RATIOS_FORMULES } from "@/lib/reporting/ratios-bilantiels";

type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientDettesFinancieresTabProps {
  clientId: string;
  year: string;
  setYear: (y: string) => void;
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
interface ChartPoint {
  label: string;
  dettesFinancieres: number;
  dettesFinancieresN1: number;
  emprunts: number;
  creditBail: number;
}
interface RatiosData {
  yearN: number;
  yearN1: number;
  kpis: Record<string, KpiValeur>;
  chartData: ChartPoint[];
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

const KPI_HABILLAGE = [
  { id: "dettesFinancieres", icon: PiBankDuotone, color: "text-orange-600" },
  { id: "emprunts", icon: PiHandCoinsDuotone, color: "text-fuchsia-500" },
  { id: "creditBail", icon: PiKeyDuotone, color: "text-rose-600" },
];

const KPI_DEFS: KpiDef[] = KPI_HABILLAGE.map((h) => ({
  id: h.id,
  label: RATIOS_FORMULES[h.id]?.label ?? h.id,
  formule: RATIOS_FORMULES[h.id]?.formule,
  icon: h.icon,
  color: h.color,
}));

const chartConfig: ChartConfig = {
  emprunts: { label: "Emprunts", color: "hsl(221, 83%, 53%)" },
  creditBail: { label: "Crédit-bail", color: "hsl(221, 83%, 73%)" },
};

function LegendLine({ color }: { color: string }) {
  return (
    <svg width="120" height="4" viewBox="0 0 199 3" fill="none" aria-hidden preserveAspectRatio="none">
      <path d="M1.5 1.5H197.5" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function ClientDettesFinancieresTab({
  clientId,
  year,
  setYear,
  setPeriodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
  setCumulGranularity,
}: ClientDettesFinancieresTabProps) {
  const [data, setData] = useState<RatiosData | null>(null);
  const [loading, setLoading] = useState(true);

  // Encours : toujours cumulé depuis janvier.
  const moisFin = cumulGranularity === "annee" ? "12" : selectedMonth;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/reporting/ratios?year=${year}&month=${moisFin}`,
      );
      if (!res.ok) throw new Error("Erreur API Dettes financières");
      setData((await res.json()) as RatiosData);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement des dettes financières");
    } finally {
      setLoading(false);
    }
  }, [clientId, year, moisFin]);

  useEffect(() => {
    load();
  }, [load]);

  const monthLabel = MONTHS.find((m) => m.value === moisFin)?.label ?? "Décembre";
  const periodLabel = `Janvier - ${monthLabel} ${year}`;

  const filtres = (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10 opacity-70"
        title="Les dettes financières sont toujours calculées en cumulé"
      >
        <span className="text-xs text-[#335890]">Mode calcul :</span>
        <span className="font-semibold text-[#00122E]">Cumulé</span>
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
        <Select
          value={cumulGranularity}
          onValueChange={(v: string) => {
            const g = v as "mois" | "annee";
            setCumulGranularity(g);
            setPeriodType(g === "annee" ? "ytd" : "ytd-day");
            if (g === "annee") setSelectedMonth("12");
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

      {cumulGranularity === "mois" && (
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
          <p>Aucune donnée de dettes financières</p>
        </div>
      </div>
    );
  }

  const kpiValues: Record<string, KpiValue> = Object.fromEntries(
    KPI_HABILLAGE.map((h) => {
      const v = data.kpis[h.id] ?? { valeurN: 0, valeurN1: 0, variation: 0 };
      return [
        h.id,
        {
          valeur: v.valeurN,
          valeurN1: v.valeurN1,
          labelN1: data.yearN1,
          variation: v.variation,
        },
      ];
    }),
  );

  const montantAxe = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
    if (abs >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  return (
    <div className="space-y-6">
      {filtres}

      <div>
        <h1 className="text-3xl font-bold text-[#00122E]">Dettes financières</h1>
        <p className="text-sm text-[#335890] italic mt-1">
          Encours cumulés au {periodLabel.toLowerCase()} — comparaison {data.yearN} vs{" "}
          {data.yearN1}.
        </p>
      </div>

      <KpiGrid
        storageKey={`dettes-financieres-${clientId}`}
        defs={KPI_DEFS}
        values={kpiValues}
      />

      {/* Histogramme empilé : la hauteur de la pile est l'encours total. */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Évolution des dettes financières</CardTitle>
            <CardDescription>
              Emprunts (DA) et crédit-bail (DB), cumulés — exercice {data.yearN}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <span className="text-base font-semibold text-[#335890]">Légende</span>
            <div className="flex items-center gap-3">
              <LegendLine color="#2463eb" />
              <span className="text-base font-medium" style={{ color: "#2463eb" }}>
                Emprunts
              </span>
            </div>
            <div className="flex items-center gap-3">
              <LegendLine color="#81a5f3" />
              <span className="text-base font-medium" style={{ color: "#81a5f3" }}>
                Crédit-bail
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[380px] w-full">
            <BarChart
              data={data.chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={montantAxe} fontSize={12} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [formatCompactOnly(value as number), name as string]}
                  />
                }
              />
              <Bar
                dataKey="emprunts"
                name="Emprunts"
                stackId="df"
                fill="hsl(221, 83%, 53%)"
                barSize={28}
              />
              <Bar
                dataKey="creditBail"
                name="Crédit-bail"
                stackId="df"
                fill="hsl(221, 83%, 73%)"
                barSize={28}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
