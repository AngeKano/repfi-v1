"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
} from "lucide-react";

// "ytd-day" : Cumulé + Granularité Mois (vue journalière intra-mois avec
// baseline = cumul Jan → selectedMonth-1).
type PeriodType = "year" | "month" | "ytd" | "ytd-day";

interface ClientBilanTabProps {
  // Filtres partagés avec les autres onglets reporting.
  year: string;
  setYear: (y: string) => void;
  periodType: PeriodType;
  setPeriodType: (p: PeriodType) => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  cumulGranularity: "mois" | "annee";
  setCumulGranularity: (g: "mois" | "annee") => void;
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

export default function ClientBilanTab({
  year,
  setYear,
  periodType,
  setPeriodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
  setCumulGranularity,
}: ClientBilanTabProps) {
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years: string[] = [];
    for (let y = current + 2; y >= current - 10; y--) years.push(y.toString());
    return years;
  }, []);

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

  return (
    <div className="space-y-6">
      {/* Barre de filtres globaux — strictement identique aux autres onglets
          reporting (Synthèse / Chiffres / Résultats / Dettes). */}
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
                setPeriodType(
                  cumulGranularity === "annee" ? "ytd" : "ytd-day",
                );
                if (cumulGranularity === "annee") setSelectedMonth("12");
              } else {
                setPeriodType(
                  cumulGranularity === "annee" ? "year" : "month",
                );
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

      {/* Grand titre — contenu à compléter ultérieurement. */}
      <h1 className="text-4xl font-bold text-[#00122E]">Bilan</h1>
    </div>
  );
}
