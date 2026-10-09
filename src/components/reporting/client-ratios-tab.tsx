"use client";

// ============================================================================
// Onglet « Ratios bilantiels » — FRNG, BFR, dettes financières et DSO.
// Ces ratios portent sur des encours : le mode de calcul est verrouillé sur
// « Cumulé », comme l'onglet Dettes court terme.
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
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
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
  PiBankDuotone,
  PiHandCoinsDuotone,
  PiKeyDuotone,
  PiClockCountdownDuotone,
} from "react-icons/pi";
import { toast } from "sonner";
import {
  KpiGrid,
  formatCompactOnly,
  formatJours,
  type KpiDef,
  type KpiValue,
} from "./kpi-grid";
import { RATIOS_FORMULES } from "@/lib/reporting/ratios-bilantiels";

type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientRatiosTabProps {
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
interface ChartPoint {
  label: string;
  frng: number;
  frngN1: number;
  bfrGlobal: number;
  bfrGlobalN1: number;
  bfrExploitation: number;
  bfrHao: number;
  dettesFinancieres: number;
  dettesFinancieresN1: number;
  emprunts: number;
  creditBail: number;
  dso: number;
  dsoN1: number;
}
interface RatiosData {
  yearN: number;
  yearN1: number;
  jours: number;
  kpis: Record<string, KpiValeur>;
  dsoDetail: { creancesTTC: number; caTTC: number };
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

// Indicateurs affichés, dans l'ordre des quatre blocs de la spécification.
// Le DSO s'exprime en jours, les autres en montants.
const KPI_HABILLAGE: { id: string; icon: React.ElementType; color: string; jours?: boolean }[] = [
  { id: "frng", icon: PiScalesDuotone, color: "text-[#0077C3]" },
  { id: "bfrGlobal", icon: PiArrowsClockwiseDuotone, color: "text-indigo-600" },
  { id: "bfrExploitation", icon: PiFactoryDuotone, color: "text-blue-600" },
  { id: "bfrHao", icon: PiPackageDuotone, color: "text-cyan-600" },
  { id: "dettesFinancieres", icon: PiBankDuotone, color: "text-orange-600" },
  { id: "emprunts", icon: PiHandCoinsDuotone, color: "text-fuchsia-500" },
  { id: "creditBail", icon: PiKeyDuotone, color: "text-rose-600" },
  { id: "dso", icon: PiClockCountdownDuotone, color: "text-emerald-600", jours: true },
];

const KPI_DEFS: KpiDef[] = KPI_HABILLAGE.map((h) => ({
  id: h.id,
  label: RATIOS_FORMULES[h.id]?.label ?? h.id,
  formule: RATIOS_FORMULES[h.id]?.formule,
  icon: h.icon,
  color: h.color,
}));

const chartConfigRatios: ChartConfig = {
  frng: { label: "FRNG N", color: "hsl(221, 83%, 53%)" },
  frngN1: { label: "FRNG N-1", color: "hsl(221, 83%, 73%)" },
  bfrGlobal: { label: "BFR global", color: "hsl(221, 83%, 53%)" },
  bfrExploitation: { label: "BFR exploitation", color: "hsl(174, 62%, 47%)" },
  bfrHao: { label: "BFR HAO", color: "hsl(32, 95%, 54%)" },
  emprunts: { label: "Emprunts", color: "hsl(221, 83%, 53%)" },
  creditBail: { label: "Crédit-bail", color: "hsl(221, 83%, 73%)" },
  dso: { label: "DSO", color: "hsl(160, 84%, 39%)" },
  dsoN1: { label: "DSO N-1", color: "hsl(160, 60%, 70%)" },
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

  const montantAxe = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
    if (abs >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  // Le DSO sort en jours, les autres indicateurs en montants.
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
          format: h.jours ? formatJours : formatCompactOnly,
        },
      ];
    }),
  );

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

      {/* BFR — courbes : global, exploitation, HAO (+ global N-1) */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Évolution du Besoin en Fonds de Roulement</CardTitle>
            <CardDescription>
              BFR global = BFR d&apos;exploitation + BFR HAO, cumulé — {data.yearN} vs{" "}
              {data.yearN1}
            </CardDescription>
          </div>
          <Legende
            items={[
              { label: `BFR global ${data.yearN}`, color: "#2463eb" },
              { label: "BFR exploitation", color: "#2dd4bf" },
              { label: "BFR HAO", color: "#f59e0b" },
              { label: `BFR global ${data.yearN1}`, color: "#81a5f3", dashed: true },
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
                dataKey="bfrGlobal"
                name={`BFR global ${data.yearN}`}
                stroke="#2463eb"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="bfrExploitation"
                name="BFR exploitation"
                stroke="#2dd4bf"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="bfrHao"
                name="BFR HAO"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="bfrGlobalN1"
                name={`BFR global ${data.yearN1}`}
                stroke="#81a5f3"
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Dettes financières — histogramme empilé DA + DB */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Dettes financières</CardTitle>
            <CardDescription>
              Emprunts (DA) et crédit-bail (DB), cumulés — exercice {data.yearN}
            </CardDescription>
          </div>
          <Legende
            items={[
              { label: "Emprunts", color: "#2463eb" },
              { label: "Crédit-bail", color: "#81a5f3" },
            ]}
          />
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfigRatios} className="h-[380px] w-full">
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
              <Bar dataKey="emprunts" name="Emprunts" stackId="df" fill="hsl(221, 83%, 53%)" barSize={28} />
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

      {/* DSO — courbes N vs N-1, en jours */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Délai Moyen de paiement Clients (DSO)</CardTitle>
            <CardDescription>
              (Créances clients moyennes TTC / CA TTC) × nombre de jours écoulés depuis le
              1er janvier ({data.jours} j au {periodLabel.toLowerCase()}) — {data.yearN} vs{" "}
              {data.yearN1}
            </CardDescription>
          </div>
          <Legende
            items={[
              { label: data.yearN, color: "#059669" },
              { label: data.yearN1, color: "#6ee7b7", dashed: true },
            ]}
          />
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfigRatios} className="h-[380px] w-full">
            <LineChart data={data.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v as number)} j`}
                fontSize={12}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [formatJours(value as number), name as string]}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="dso"
                name={`DSO ${data.yearN}`}
                stroke="#059669"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="dsoN1"
                name={`DSO ${data.yearN1}`}
                stroke="#6ee7b7"
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>

          {/* Détail du calcul à la date de fin de période. */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-2.5 text-muted-foreground">
                    Créances clients TTC (BI − comptes 414)
                  </td>
                  <td className="text-right py-2.5 font-semibold">
                    {formatCompactOnly(data.dsoDetail.creancesTTC)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2.5 text-muted-foreground">
                    Chiffre d&apos;affaires TTC (TA + TB + TC + TD + TVA collectée 4431 à 4435)
                  </td>
                  <td className="text-right py-2.5 font-semibold">
                    {formatCompactOnly(data.dsoDetail.caTTC)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2.5 text-muted-foreground">Nombre de jours</td>
                  <td className="text-right py-2.5 font-semibold">{data.jours} j</td>
                </tr>
                <tr className="border-t-2 font-bold">
                  <td className="py-2.5">DSO</td>
                  <td className="text-right py-2.5 text-blue-600">
                    {formatJours(data.kpis.dso?.valeurN ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
