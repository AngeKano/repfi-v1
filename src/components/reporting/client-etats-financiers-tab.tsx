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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { PiScalesDuotone, PiChartDonutDuotone } from "react-icons/pi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  exporterEtatsExcel,
  exporterEtatsPdf,
  type EtatsExportData,
} from "./etats-financiers-export";

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

interface Mois {
  ym: string;
  label: string;
}
interface Cumul {
  label: string;
  dateFin: string;
}
interface LigneActif {
  ref: string;
  libelle: string;
  total: boolean;
  /** NET périodique de chaque mois, de janvier au mois sélectionné. */
  mois: number[];
  brut: number;
  amort: number;
  net: number;
  netN1: number;
}
interface LignePassif {
  ref: string;
  libelle: string;
  total: boolean;
  mois: number[];
  cumul: number;
  cumulN1: number;
}
interface LigneResultat extends LignePassif {
  sens: string | null;
  repere: string | null;
}
interface EtatsData {
  client: { id: string; name: string };
  availableYears: number[];
  manualIncluded: boolean;
  periodeLabel: string;
  yearN: number;
  yearN1: number | null;
  mois: Mois[];
  cumulN: Cumul;
  cumulN1: Cumul | null;
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

// ==================== Styles (grille type état officiel) ====================
const TH =
  "border border-[#9AA9BC] bg-[#EDEDED] px-3 py-2 text-center text-xs font-semibold text-[#1A1A1A] whitespace-nowrap";
const TD = "border border-[#9AA9BC] px-3 py-1.5 align-middle";
// REF et libellé restent fixes pendant le défilement horizontal. Le filet de
// droite est redessiné en ombre : avec border-collapse, la bordure d'une
// cellule collante ne suit pas le défilement.
const STICKY_REF = "sticky left-0 z-10 w-16 min-w-16";
const STICKY_LIB = "sticky left-16 z-10 shadow-[1px_0_0_#9AA9BC]";
// Colonne du mois affiché, légèrement teintée pour la distinguer des cumuls.
const COL_MOIS = "bg-[#F5F9FF]";

const fmt = (n: number, showZero: boolean) => {
  if (!Math.round(n || 0)) return showZero ? "0" : "";
  return Math.round(n).toLocaleString("fr-FR");
};

function Amount({ value, total, className }: { value: number; total: boolean; className?: string }) {
  return (
    <td
      className={cn(
        TD,
        "text-right tabular-nums whitespace-nowrap",
        total && "font-bold",
        className,
      )}
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
  // Mois affiché à l'écran (index dans data.mois) ; par défaut, le mois
  // sélectionné dans le filtre, c'est-à-dire le dernier.
  const [moisIdx, setMoisIdx] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Formats cochés : un seul ou les deux à la fois.
  const [formats, setFormats] = useState<Array<"xlsx" | "pdf">>(["xlsx"]);

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
      const json = (await res.json()) as EtatsData;
      setData(json);
      setMoisIdx(Math.max(0, json.mois.length - 1));
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

  // Les colonnes mensuelles sont toujours en périodique et le cumul part de
  // janvier : seul le mois de fin du filtre compte ici.
  const moisFin = cumulGranularity === "annee" ? "12" : selectedMonth;
  const monthLabel = MONTHS.find((m) => m.value === moisFin)?.label ?? "Décembre";
  const periodLabel = `Janvier - ${monthLabel} ${year}`;

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
            const cumule = periodType === "ytd" || periodType === "ytd-day";
            setCumulGranularity(g);
            if (cumule) setPeriodType(g === "annee" ? "ytd" : "ytd-day");
            else setPeriodType(g === "annee" ? "year" : "month");
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
        <span>{periodLabel} — mois en périodique, cumul N et N-1</span>
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

  const nbMois = data.mois.length;
  const idx = Math.min(moisIdx, Math.max(0, nbMois - 1));
  const moisCourant = data.mois[idx];
  const cumulN1 = data.cumulN1;

  // Cellules REF et libellé, figées à gauche. Le fond est explicite pour que
  // les montants ne transparaissent pas dessous pendant le défilement.
  const refCell = (ref: string, total: boolean) => (
    <td
      className={cn(
        TD,
        STICKY_REF,
        "font-mono text-xs text-center",
        total ? "bg-[#F2F2F2] font-bold" : "bg-white",
      )}
    >
      {ref}
    </td>
  );
  const libCell = (libelle: string, total: boolean, extra?: ReactNode) => (
    <td
      className={cn(
        TD,
        STICKY_LIB,
        "min-w-[320px]",
        total ? "bg-[#F2F2F2] font-bold uppercase" : "bg-white",
      )}
    >
      {libelle}
      {extra}
    </td>
  );
  const thRef = (
    <th rowSpan={2} className={cn(TH, STICKY_REF, "z-20")}>
      REF
    </th>
  );
  const thLib = (titre: string) => (
    <th rowSpan={2} className={cn(TH, STICKY_LIB, "z-20 text-left min-w-[320px]")}>
      {titre}
    </th>
  );

  // En-tête du mois affiché, avec les flèches de navigation juste au-dessus
  // des montants : de janvier jusqu'au mois sélectionné.
  const thMois = (
    <th className={cn(TH, "min-w-[180px]")}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          title="Mois précédent"
          onClick={() => setMoisIdx(Math.max(0, idx - 1))}
          disabled={idx <= 0}
          className="rounded p-0.5 text-[#335890] hover:bg-white hover:text-[#0077C3] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="uppercase">{moisCourant?.label ?? "—"}</span>
        <button
          type="button"
          title="Mois suivant"
          onClick={() => setMoisIdx(Math.min(nbMois - 1, idx + 1))}
          disabled={idx >= nbMois - 1}
          className="rounded p-0.5 text-[#335890] hover:bg-white hover:text-[#0077C3] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </th>
  );
  const thCumul = (c: Cumul, colSpan = 1) => (
    <th colSpan={colSpan} className={TH}>
      CUMUL
      <br />
      {c.label.toUpperCase()}
    </th>
  );

  // L'export contient TOUS les mois de la période, suivis des deux cumuls.
  const toggleFormat = (f: "xlsx" | "pdf") =>
    setFormats((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]));

  const lancerExport = async () => {
    if (formats.length === 0) return;
    setExporting(true);
    try {
      const charge: EtatsExportData = {
        clientName: data.client.name,
        periodeLabel: data.periodeLabel,
        yearN: data.yearN,
        mois: data.mois,
        cumulN: data.cumulN,
        cumulN1: data.cumulN1,
        actif: data.actif,
        passif: data.passif,
        resultat: data.resultat,
      };
      // Les deux formats cochés produisent deux fichiers, l'un après l'autre.
      if (formats.includes("xlsx")) await exporterEtatsExcel(charge);
      if (formats.includes("pdf")) await exporterEtatsPdf(charge);
      setShowExport(false);
    } catch (e) {
      console.error(e);
      toast.error("Échec du téléchargement des états financiers");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {filtres}

      <div>
        <h1 className="text-3xl font-bold text-[#00122E]">États Financiers</h1>
        <p className="text-sm text-[#335890] italic mt-1">
          {data.client.name} — Système Normal SYSCOHADA. Période : {data.periodeLabel}.
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
        <p className="text-xs text-[#335890]">
          Mois {idx + 1} / {nbMois} — utilisez les flèches de l&apos;en-tête pour parcourir
          les mois.
          {!cumulN1 && " Aucune écriture sur l'exercice précédent : pas de cumul N-1."}
        </p>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            {data.manualIncluded ? "Saisies incluses" : "Saisies masquées"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExport(true)}
            className="gap-2 h-9 rounded-lg border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF]"
            title="Télécharger les états financiers"
          >
            <Download className="w-4 h-4" />
            Télécharger
          </Button>
        </div>
      </div>

      {/* Choix du format d'export — l'export contient tous les mois. */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Télécharger les états financiers</DialogTitle>
            <DialogDescription>
              Bilan (actif et passif) et compte de résultat : les {nbMois} mois de{" "}
              {data.periodeLabel} en périodique, le cumul N
              {cumulN1 ? ` et le cumul N-1 (${cumulN1.label})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              {
                id: "xlsx" as const,
                label: "Excel",
                detail: "3 onglets (.xlsx)",
                icon: FileSpreadsheet,
                color: "text-green-600",
              },
              {
                id: "pdf" as const,
                label: "PDF",
                // Même règle que l'export : A3 au-delà de 8 colonnes de montant.
                detail: nbMois + 3 + (cumulN1 ? 1 : 0) > 8 ? "A3 paysage" : "A4 paysage",
                icon: FileText,
                color: "text-red-600",
              },
            ].map((f) => {
              const Icon = f.icon;
              const coche = formats.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={exporting}
                  onClick={() => toggleFormat(f.id)}
                  aria-pressed={coche}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-lg border p-5 transition-colors disabled:opacity-50",
                    coche
                      ? "border-[#0077C3] bg-[#EBF5FF] ring-1 ring-[#0077C3]/20"
                      : "border-[#D0E3F5] hover:bg-[#F5F9FF]",
                  )}
                >
                  <Checkbox
                    checked={coche}
                    tabIndex={-1}
                    aria-hidden
                    className="absolute top-2 right-2 pointer-events-none"
                  />
                  <Icon className={`w-8 h-8 ${f.color}`} />
                  <span className="text-sm font-medium text-[#00122E]">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.detail}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowExport(false)}>
              Annuler
            </Button>
            <Button
              onClick={lancerExport}
              disabled={exporting || formats.length === 0}
              className="gap-2"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {formats.length === 2 ? "Télécharger les 2 fichiers" : "Télécharger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  {thRef}
                  {thLib("ACTIF")}
                  {thMois}
                  {thCumul(data.cumulN, 3)}
                  {cumulN1 && thCumul(cumulN1)}
                </tr>
                <tr>
                  <th className={TH}>NET (périodique)</th>
                  <th className={TH}>BRUT</th>
                  <th className={TH}>AMORT et DEPREC.</th>
                  <th className={TH}>NET</th>
                  {cumulN1 && <th className={TH}>NET</th>}
                </tr>
              </thead>
              <tbody>
                {data.actif.map((l) => (
                  <tr key={l.ref} className={cn(l.total ? "bg-[#F2F2F2]" : "hover:bg-muted/20")}>
                    {refCell(l.ref, l.total)}
                    {libCell(l.libelle, l.total)}
                    <Amount
                      value={l.mois[idx] ?? 0}
                      total={l.total}
                      className={!l.total ? COL_MOIS : undefined}
                    />
                    <Amount value={l.brut} total={l.total} />
                    <Amount value={l.amort} total={l.total} />
                    <Amount value={l.net} total={l.total} />
                    {cumulN1 && <Amount value={l.netN1} total={l.total} />}
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
                  {thRef}
                  {thLib("PASSIF")}
                  {thMois}
                  {thCumul(data.cumulN)}
                  {cumulN1 && thCumul(cumulN1)}
                </tr>
                <tr>
                  <th className={TH}>NET (périodique)</th>
                  <th className={TH}>NET</th>
                  {cumulN1 && <th className={TH}>NET</th>}
                </tr>
              </thead>
              <tbody>
                {data.passif.map((l) => (
                  <tr key={l.ref} className={cn(l.total ? "bg-[#F2F2F2]" : "hover:bg-muted/20")}>
                    {refCell(l.ref, l.total)}
                    {libCell(l.libelle, l.total)}
                    <Amount
                      value={l.mois[idx] ?? 0}
                      total={l.total}
                      className={!l.total ? COL_MOIS : undefined}
                    />
                    <Amount value={l.cumul} total={l.total} />
                    {cumulN1 && <Amount value={l.cumulN1} total={l.total} />}
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
                  {thRef}
                  {thLib("LIBELLES")}
                  {thMois}
                  {thCumul(data.cumulN)}
                  {cumulN1 && thCumul(cumulN1)}
                </tr>
                <tr>
                  <th className={TH}>NET (1) périodique</th>
                  <th className={TH}>NET (1)</th>
                  {cumulN1 && <th className={TH}>NET (1)</th>}
                </tr>
              </thead>
              <tbody>
                {data.resultat.map((l) => (
                  <tr key={l.ref} className={cn(l.total ? "bg-[#F2F2F2]" : "hover:bg-muted/20")}>
                    {refCell(l.ref, l.total)}
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
                    <Amount
                      value={l.mois[idx] ?? 0}
                      total={l.total}
                      className={!l.total ? COL_MOIS : undefined}
                    />
                    <Amount value={l.cumul} total={l.total} />
                    {cumulN1 && <Amount value={l.cumulN1} total={l.total} />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            (1) Les montants sont précédés du signe (+) ou (−) en fonction de leurs soldes dans la
            balance générale. (2) Les signes affichés à côté des libellés indiquent le sens
            structurel des soldes ; ils ne jouent pas le rôle de signes opérateurs. La colonne du
            mois est calculée en périodique (mouvements du seul mois) ; le cumul N est la somme
            des mois de janvier au mois sélectionné.
          </p>
        </div>
      )}
    </div>
  );
}
