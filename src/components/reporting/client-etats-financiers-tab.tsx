"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
} from "lucide-react";
import { PiScalesDuotone, PiChartDonutDuotone } from "react-icons/pi";
import { cn } from "@/lib/utils";

type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientEtatsFinanciersTabProps {
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

interface Exercice {
  year: number;
  label: string;
}
interface LigneActif {
  ref: string;
  libelle: string;
  total: boolean;
  bruts: number[];
  amorts: number[];
  nets: number[];
}
interface LignePassif {
  ref: string;
  libelle: string;
  total: boolean;
  nets: number[];
}
interface LigneResultat {
  ref: string;
  libelle: string;
  total: boolean;
  sens: string | null;
  repere: string | null;
  montants: number[];
}
interface EtatsData {
  client: { id: string; name: string };
  exercices: Exercice[];
  availableYears: number[];
  manualIncluded: boolean;
  periodeLabel: string;
  actif: LigneActif[];
  passif: LignePassif[];
  resultat: LigneResultat[];
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

// Deux exercices au maximum affichés simultanément (modèle officiel).
const MAX_EXERCICES = 2;

// ==================== Styles (grille type état officiel) ====================
const TH =
  "border border-[#9AA9BC] bg-[#EDEDED] px-3 py-2 text-center text-xs font-semibold text-[#1A1A1A] whitespace-nowrap";
const TD = "border border-[#9AA9BC] px-3 py-1.5 align-middle";

const fmt = (n: number, showZero: boolean) => {
  if (!n) return showZero ? "0" : "";
  return Math.round(n).toLocaleString("fr-FR");
};

function Amount({ value, total }: { value: number; total: boolean }) {
  return (
    <td
      className={cn(TD, "text-right tabular-nums whitespace-nowrap", total && "font-bold")}
    >
      {fmt(value, total)}
    </td>
  );
}

const SUB_TABS = [
  { id: "bilan" as const, label: "Bilan", icon: PiScalesDuotone },
  { id: "resultat" as const, label: "Compte de Résultat", icon: PiChartDonutDuotone },
];

export default function ClientEtatsFinanciersTab({
  clientId,
  year,
  setYear,
  periodType,
  setPeriodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
  setCumulGranularity,
}: ClientEtatsFinanciersTabProps) {
  const [data, setData] = useState<EtatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subTab, setSubTab] = useState<"bilan" | "resultat">("bilan");
  // Index de départ de la fenêtre de comparaison (2 exercices maximum).
  const [exOffset, setExOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        year,
        periodType,
        month: selectedMonth,
      });
      const res = await fetch(`/api/clients/${clientId}/reporting/etats-financiers?${qs}`);
      if (!res.ok) throw new Error("Erreur API");
      setData((await res.json()) as EtatsData);
      setExOffset(0);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger les états financiers.");
    } finally {
      setLoading(false);
    }
  }, [clientId, year, periodType, selectedMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const cumule = periodType === "ytd" || periodType === "ytd-day";
  const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label ?? "Décembre";
  const periodLabel = cumule
    ? `Janvier - ${monthLabel} ${year}${periodType === "ytd-day" ? " (jour par jour)" : ""}`
    : cumulGranularity === "annee"
      ? `Janvier - Décembre ${year}`
      : `${monthLabel} ${year}`;

  const yearOptions = (data?.availableYears ?? []).map(String);
  const handleYearChange = (dir: "prev" | "next") => {
    const idx = yearOptions.indexOf(year);
    if (idx < 0) return;
    const next = dir === "prev" ? idx + 1 : idx - 1;
    if (next >= 0 && next < yearOptions.length) setYear(yearOptions[next]);
  };

  // ==================== Barre de filtres (commune au reporting) ====================
  const filtres = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
        <span className="text-xs text-[#335890]">Mode calcul :</span>
        <Select
          value={cumule ? "cumule" : "periodique"}
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

      <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
        <span className="text-xs text-[#335890]">Granularité :</span>
        <Select
          value={cumulGranularity}
          onValueChange={(v: string) => {
            const g = v as "mois" | "annee";
            setCumulGranularity(g);
            if (cumule) {
              setPeriodType(g === "annee" ? "ytd" : "ytd-day");
              if (g === "annee") setSelectedMonth("12");
            } else {
              setPeriodType(g === "annee" ? "year" : "month");
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
  if (error || !data) {
    return (
      <div className="space-y-6">
        {filtres}
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mb-2 opacity-30" />
          <p>{error || "Aucune donnée"}</p>
        </div>
      </div>
    );
  }

  const allEx = data.exercices;
  const visibles = allEx.slice(exOffset, exOffset + MAX_EXERCICES);
  const canPrev = exOffset > 0;
  const canNext = exOffset + MAX_EXERCICES < allEx.length;

  const libCell = (libelle: string, total: boolean, extra?: ReactNode) => (
    <td className={cn(TD, total && "font-bold uppercase")}>
      {libelle}
      {extra}
    </td>
  );

  const navExercices = allEx.length > MAX_EXERCICES && (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#335890]">Exercices comparés :</span>
      <button
        title="Exercices plus récents"
        onClick={() => setExOffset((o) => Math.max(0, o - 1))}
        disabled={!canPrev}
        className="text-[#94A3B8] hover:text-[#0077C3] disabled:opacity-30"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="font-semibold text-[#00122E] text-sm">
        {visibles.map((e) => e.year).join(" / ")}
      </span>
      <button
        title="Exercices plus anciens"
        onClick={() => setExOffset((o) => Math.min(allEx.length - MAX_EXERCICES, o + 1))}
        disabled={!canNext}
        className="text-[#94A3B8] hover:text-[#0077C3] disabled:opacity-30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {filtres}

      <div>
        <h1 className="text-3xl font-bold text-[#00122E]">États Financiers</h1>
        <p className="text-sm text-[#335890] italic mt-1">
          {data.client.name} — Système Normal SYSCOHADA. Période : {periodLabel}.
        </p>
      </div>

      {/* Sous-onglets (même présentation que la section Paramètres) */}
      <div className="flex items-center gap-6 border-b border-[#D0E3F5]">
        {SUB_TABS.map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium transition-colors relative ${
                active ? "text-[#0077C3]" : "text-[#335890] hover:text-[#0077C3]"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {active && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {navExercices || <span />}
        <Badge variant="outline" className="text-xs">
          {data.manualIncluded ? "Saisies incluses" : "Saisies masquées"}
        </Badge>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Actualisation…
        </div>
      )}

      {/* ==================== BILAN ==================== */}
      {subTab === "bilan" && (
        <div className="space-y-8">
          {/* ---- ACTIF ---- */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th rowSpan={2} className={cn(TH, "w-16")}>
                    REF
                  </th>
                  <th rowSpan={2} className={cn(TH, "text-left min-w-[320px]")}>
                    ACTIF
                  </th>
                  <th colSpan={3} className={TH}>
                    EXERCICE au {visibles[0]?.label ?? "—"}
                  </th>
                  {visibles.slice(1).map((e) => (
                    <th key={e.year} className={TH}>
                      EXERCICE AU
                      <br />
                      {e.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className={TH}>BRUT</th>
                  <th className={TH}>AMORT et DEPREC.</th>
                  <th className={TH}>NET</th>
                  {visibles.slice(1).map((e) => (
                    <th key={e.year} className={TH}>
                      NET
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.actif.map((l) => (
                  <tr key={l.ref} className={cn(l.total ? "bg-[#F2F2F2]" : "hover:bg-muted/20")}>
                    <td className={cn(TD, "font-mono text-xs text-center", l.total && "font-bold")}>
                      {l.ref}
                    </td>
                    {libCell(l.libelle, l.total)}
                    <Amount value={l.bruts[exOffset] ?? 0} total={l.total} />
                    <Amount value={l.amorts[exOffset] ?? 0} total={l.total} />
                    <Amount value={l.nets[exOffset] ?? 0} total={l.total} />
                    {visibles.slice(1).map((e, i) => (
                      <Amount key={e.year} value={l.nets[exOffset + 1 + i] ?? 0} total={l.total} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- PASSIF ---- */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th rowSpan={2} className={cn(TH, "w-16")}>
                    REF
                  </th>
                  <th rowSpan={2} className={cn(TH, "text-left min-w-[320px]")}>
                    PASSIF
                  </th>
                  {visibles.map((e) => (
                    <th key={e.year} className={TH}>
                      EXERCICE AU
                      <br />
                      {e.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {visibles.map((e) => (
                    <th key={e.year} className={TH}>
                      NET
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.passif.map((l) => (
                  <tr key={l.ref} className={cn(l.total ? "bg-[#F2F2F2]" : "hover:bg-muted/20")}>
                    <td className={cn(TD, "font-mono text-xs text-center", l.total && "font-bold")}>
                      {l.ref}
                    </td>
                    {libCell(l.libelle, l.total)}
                    {visibles.map((e, i) => (
                      <Amount key={e.year} value={l.nets[exOffset + i] ?? 0} total={l.total} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============== COMPTE DE RÉSULTAT ============== */}
      {subTab === "resultat" && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th rowSpan={2} className={cn(TH, "w-16")}>
                    REF
                  </th>
                  <th rowSpan={2} className={cn(TH, "text-left min-w-[360px]")}>
                    LIBELLES
                  </th>
                  {visibles.map((e) => (
                    <th key={e.year} className={TH}>
                      EXERCICE AU
                      <br />
                      {e.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {visibles.map((e) => (
                    <th key={e.year} className={TH}>
                      NET (1)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.resultat.map((l) => (
                  <tr key={l.ref} className={cn(l.total ? "bg-[#F2F2F2]" : "hover:bg-muted/20")}>
                    <td className={cn(TD, "font-mono text-xs text-center", l.total && "font-bold")}>
                      {l.ref}
                    </td>
                    {libCell(
                      l.libelle,
                      l.total,
                      <>
                        {l.repere && (
                          <span className="ml-2 text-xs text-muted-foreground">({l.repere})</span>
                        )}
                        {l.sens && !l.total && (
                          <span className="ml-2 text-xs text-muted-foreground">{l.sens}</span>
                        )}
                      </>,
                    )}
                    {visibles.map((e, i) => (
                      <Amount key={e.year} value={l.montants[exOffset + i] ?? 0} total={l.total} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            (1) Les montants sont précédés du signe (+) ou (−) en fonction de leurs soldes dans la
            balance générale. (2) Les signes affichés à côté des libellés indiquent le sens
            structurel des soldes ; ils ne jouent pas le rôle de signes opérateurs.
          </p>
        </div>
      )}
    </div>
  );
}
