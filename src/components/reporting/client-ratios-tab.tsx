"use client";

// ============================================================================
// Onglet « Ratios bilantiels » — FRNG et BFR.
// Ces ratios portent sur des encours : le mode de calcul est verrouillé sur
// « Cumulé », comme l'onglet Dettes court terme.
// Les dettes financières ont leur propre onglet, le DSO est rattaché au
// Recouvrement Clients.
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
} from "lucide-react";
import {
  PiScalesDuotone,
  PiArrowsClockwiseDuotone,
  PiFactoryDuotone,
  PiPackageDuotone,
} from "react-icons/pi";
import { toast } from "sonner";
import { KpiGrid, formatCompactOnly, type KpiDef, type KpiValue } from "./kpi-grid";
import { RATIOS_FORMULES } from "@/lib/reporting/ratios-bilantiels";

type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientRatiosTabProps {
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
  frng: number;
  frngN1: number;
  bfrGlobal: number;
  bfrGlobalN1: number;
  bfrExploitation: number;
  bfrExploitationN1: number;
  bfrHao: number;
  bfrHaoN1: number;
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
  { id: "frng", icon: PiScalesDuotone, color: "text-[#0077C3]" },
  { id: "bfrGlobal", icon: PiArrowsClockwiseDuotone, color: "text-indigo-600" },
  { id: "bfrExploitation", icon: PiFactoryDuotone, color: "text-blue-600" },
  { id: "bfrHao", icon: PiPackageDuotone, color: "text-cyan-600" },
];

const KPI_DEFS: KpiDef[] = KPI_HABILLAGE.map((h) => ({
  id: h.id,
  label: RATIOS_FORMULES[h.id]?.label ?? h.id,
  formule: RATIOS_FORMULES[h.id]?.formule,
  icon: h.icon,
  color: h.color,
}));

// Le graphique du BFR n'affiche qu'une composante à la fois, en N et N-1 :
// superposer les trois rendrait la lecture illisible.
const SERIES_BFR = [
  { id: "bfrGlobal", label: "BFR global", cleN: "bfrGlobal", cleN1: "bfrGlobalN1", couleur: "#2463eb", couleurN1: "#81a5f3" },
  { id: "bfrExploitation", label: "BFR d'exploitation", cleN: "bfrExploitation", cleN1: "bfrExploitationN1", couleur: "#0d9488", couleurN1: "#5eead4" },
  { id: "bfrHao", label: "BFR HAO", cleN: "bfrHao", cleN1: "bfrHaoN1", couleur: "#d97706", couleurN1: "#fcd34d" },
] as const;

const chartConfigRatios: ChartConfig = {
  frng: { label: "FRNG N", color: "hsl(221, 83%, 53%)" },
  frngN1: { label: "FRNG N-1", color: "hsl(221, 83%, 73%)" },
  bfrGlobal: { label: "BFR global", color: "hsl(221, 83%, 53%)" },
  bfrExploitation: { label: "BFR exploitation", color: "hsl(174, 62%, 47%)" },
  bfrHao: { label: "BFR HAO", color: "hsl(32, 95%, 54%)" },
};

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

function Legende({ items }: { items: { label: string | number; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-col gap-1 shrink-0">
      <span className="text-base font-semibold text-[#335890]">Légende</span>
      {items.map((it) => (
        <div key={String(it.label)} className="flex items-center gap-3">
          <LegendLine color={it.color} dashed={it.dashed} />
          <span className="text-base font-medium" style={{ color: it.color }}>
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ClientRatiosTab({
  clientId,
  year,
  setYear,
  setPeriodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
  setCumulGranularity,
}: ClientRatiosTabProps) {
  const [data, setData] = useState<RatiosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [serieBfr, setSerieBfr] = useState<string>("bfrGlobal");

  // Les ratios bilantiels sont des encours : toujours cumulés depuis janvier.
  const moisFin = cumulGranularity === "annee" ? "12" : selectedMonth;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/reporting/ratios?year=${year}&month=${moisFin}`,
      );
      if (!res.ok) throw new Error("Erreur API Ratios");
      setData((await res.json()) as RatiosData);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement des ratios bilantiels");
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
      {/* Un ratio bilantiel se lit sur un encours : mode verrouillé. */}
      <div
        className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10 opacity-70"
        title="Les ratios bilantiels sont toujours calculés en cumulé"
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
          <p>Aucune donnée de ratios</p>
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

  const serie = SERIES_BFR.find((s) => s.id === serieBfr) ?? SERIES_BFR[0];

  return (
    <div className="space-y-6">
      {filtres}

      <div>
        <h1 className="text-3xl font-bold text-[#00122E]">Ratios bilantiels</h1>
        <p className="text-sm text-[#335890] italic mt-1">
          Encours cumulés au {periodLabel.toLowerCase()} — comparaison {data.yearN} vs{" "}
          {data.yearN1}.
        </p>
      </div>

      <KpiGrid
        storageKey={`ratios-${clientId}`}
        defs={KPI_DEFS}
        values={kpiValues}
        columns={2}
      />

      {/* FRNG — courbes N vs N-1 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Évolution du Fonds de Roulement Net Global</CardTitle>
            <CardDescription>
              FRNG = DF − AZ (net d&apos;amortissements), cumulé — {data.yearN} vs{" "}
              {data.yearN1}
            </CardDescription>
          </div>
          <Legende
            items={[
              { label: data.yearN, color: "#2463eb" },
              { label: data.yearN1, color: "#81a5f3", dashed: true },
            ]}
          />
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfigRatios} className="h-[380px] w-full">
            <LineChart data={data.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
              <Line
                type="monotone"
                dataKey="frng"
                name={`FRNG ${data.yearN}`}
                stroke="#2463eb"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="frngN1"
                name={`FRNG ${data.yearN1}`}
                stroke="#81a5f3"
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* BFR — une composante à la fois, en N et N-1 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Évolution du Besoin en Fonds de Roulement</CardTitle>
            <CardDescription>
              BFR global = BFR d&apos;exploitation + BFR HAO, cumulé — {data.yearN} vs{" "}
              {data.yearN1}
            </CardDescription>
            <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10 mt-3 w-fit">
              <span className="text-xs text-[#335890]">Donnée :</span>
              <Select value={serieBfr} onValueChange={setSerieBfr}>
                <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[160px] font-semibold text-[#00122E]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERIES_BFR.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Legende
            items={[
              { label: `${serie.label} ${data.yearN}`, color: serie.couleur },
              { label: `${serie.label} ${data.yearN1}`, color: serie.couleurN1, dashed: true },
            ]}
          />
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfigRatios} className="h-[380px] w-full">
            <LineChart data={data.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
              <Line
                type="monotone"
                dataKey={serie.cleN}
                name={`${serie.label} ${data.yearN}`}
                stroke={serie.couleur}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey={serie.cleN1}
                name={`${serie.label} ${data.yearN1}`}
                stroke={serie.couleurN1}
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
