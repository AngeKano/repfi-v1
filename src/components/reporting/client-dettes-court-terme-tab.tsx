"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import {
  PiCoinsDuotone,
  PiMoneyWavyDuotone,
  PiWalletDuotone,
  PiReceiptDuotone,
  PiChartDonutDuotone,
  PiScalesDuotone,
} from "react-icons/pi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DetteTable, formatCompactOnly, type TopDette } from "./dette-table";

type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientDettesCourtTermeTabProps {
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

interface DetteKpis {
  dettesFournisseurs: number;
  dettesPersonnel: number;
  dettesSociales: number;
  dettesFiscales: number;
  dettesHAO: number;
  tauxRemboursement: number;
}

interface DetteData {
  kpis: DetteKpis;
  topByType: TopDette[];
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

// Les cinq composantes du passif circulant suivies ici (rubriques SYSCOHADA
// DJ, DK2, DK1, DK3, DH). Leur somme forme le total des dettes à court terme.
const COMPOSANTES = [
  { key: "dettesFournisseurs", label: "Dettes fournisseurs", color: "text-blue-600", icon: PiCoinsDuotone },
  { key: "dettesSociales", label: "Dettes sociales", color: "text-orange-600", icon: PiMoneyWavyDuotone },
  { key: "dettesPersonnel", label: "Dettes personnel", color: "text-fuchsia-500", icon: PiWalletDuotone },
  { key: "dettesFiscales", label: "Dettes fiscales", color: "text-indigo-600", icon: PiReceiptDuotone },
  { key: "dettesHAO", label: "Dettes HAO", color: "text-cyan-600", icon: PiChartDonutDuotone },
] as const;

export default function ClientDettesCourtTermeTab({
  clientId,
  year,
  setYear,
  periodType,
  setPeriodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
  setCumulGranularity,
}: ClientDettesCourtTermeTabProps) {
  const [data, setData] = useState<DetteData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Les dettes sont toujours lues en cumulé (encours à la date de fin).
      const endMonth = cumulGranularity === "annee" ? "12" : selectedMonth;
      const startPeriod = `${year}-01`;
      const endPeriod = `${year}-${endMonth}`;
      const granularity =
        periodType === "ytd-day" && cumulGranularity === "mois" ? "day" : "month";
      const url =
        `/api/clients/${clientId}/reporting/dettes` +
        `?endPeriod=${endPeriod}&startPeriod=${startPeriod}` +
        `&mode=cumule&granularity=${granularity}&dailyBaseline=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur API Dettes");
      setData((await res.json()) as DetteData);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement des dettes court terme");
    } finally {
      setLoading(false);
    }
  }, [clientId, year, selectedMonth, cumulGranularity, periodType]);

  useEffect(() => {
    load();
  }, [load]);

  const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label ?? "Décembre";
  const periodLabel =
    cumulGranularity === "annee"
      ? `Janvier - Décembre ${year}`
      : `Janvier - ${monthLabel} ${year}`;

  const filtres = (
    <div className="flex flex-wrap items-center gap-3">
      {/* L'encours de dettes se lit toujours en cumulé : mode verrouillé. */}
      <div
        className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10 opacity-70"
        title="Les dettes à court terme sont toujours calculées en cumulé"
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
          <p>Aucune donnée de dettes</p>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  // Le total est la somme des composantes affichées : ce que l'utilisateur
  // additionne à l'écran correspond toujours au total annoncé.
  const total = COMPOSANTES.reduce((s, c) => s + (k[c.key] ?? 0), 0);

  return (
    <div className="space-y-6">
      {filtres}

      <div>
        <h1 className="text-3xl font-bold text-[#00122E]">Dettes court terme</h1>
        <p className="text-sm text-[#335890] italic mt-1">
          Passif circulant — encours au {periodLabel.toLowerCase()}.
        </p>
      </div>

      {/* Total */}
      <Card className="border-[#D0E3F5]">
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#EBF5FF] flex items-center justify-center">
              <PiScalesDuotone className="w-6 h-6 text-[#0077C3]" />
            </div>
            <div>
              <p className="text-sm text-[#335890]">Total Dettes Court Terme</p>
              <p className="text-xs text-muted-foreground">
                Fournisseurs + sociales + personnel + fiscales + HAO
              </p>
            </div>
          </div>
          <p className="text-3xl font-bold text-[#00122E] tabular-nums">
            {formatCompactOnly(total)}
          </p>
        </CardContent>
      </Card>

      {/* Détail par composante */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {COMPOSANTES.map((c) => {
          const valeur = k[c.key] ?? 0;
          const part = total !== 0 ? (valeur / total) * 100 : 0;
          return (
            <Card key={c.key} className="border-[#D0E3F5]">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <c.icon className={cn("w-5 h-5", c.color)} />
                  <span className="text-xs text-[#335890]">{c.label}</span>
                </div>
                <p className={cn("text-xl font-bold tabular-nums", c.color)}>
                  {formatCompactOnly(valeur)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {part.toFixed(1)}% du total
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Top 10 par type (déplacé depuis l'onglet Dettes) */}
      <DetteTable
        title="Analyse des Dettes par Type — Top 10"
        description="Dettes regroupées par type (Solde = Dette − Remboursé)"
        firstColLabel="Type de dette"
        icon={<PiScalesDuotone className="w-5 h-5 text-orange-500" />}
        rows={data.topByType}
      />
    </div>
  );
}
