"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  PiCoinsDuotone,
  PiMoneyWavyDuotone,
  PiWalletDuotone,
  PiReceiptDuotone,
  PiChartDonutDuotone,
  PiScalesDuotone,
} from "react-icons/pi";
import { toast } from "sonner";
import { DetteTable, type TopDette } from "./dette-table";
import { useVisibilite } from "./visibilite";
import { KpiGrid, type KpiDef, type KpiValue } from "./kpi-grid";

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
  /** Fin réellement calculée (année importée, mois couvert). */
  endYear?: number;
  endMonth?: number;
  /** Années d'un reporting importé, décroissantes. */
  availableYears?: string[];
  /** Mois « 01 »…« 12 » couverts par le reporting de l'année. */
  moisDisponibles?: string[];
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

// Le total chapeaute les cinq composantes : ce que l'utilisateur additionne
// à l'écran correspond toujours au total annoncé.
const KPI_DEFS: KpiDef[] = [
  {
    id: "total",
    label: "Total Dettes Court Terme",
    formule: "Somme des cinq composantes du passif circulant",
    icon: PiScalesDuotone,
    color: "text-[#0077C3]",
  },
  ...COMPOSANTES.map((c) => ({
    id: c.key,
    label: c.label,
    icon: c.icon,
    color: c.color,
  })),
];

export default function ClientDettesCourtTermeTab({
  clientId,
  year,
  setYear,
  periodType,
  selectedMonth,
  setSelectedMonth,
  cumulGranularity,
}: ClientDettesCourtTermeTabProps) {
  const [data, setData] = useState<DetteData | null>(null);
  const [loading, setLoading] = useState(true);
  const { estVisible } = useVisibilite();

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
      const json = (await res.json()) as DetteData;
      setData(json);
      // Le filtre suit la période réellement calculée : une année ou un mois
      // sans reporting n'est jamais affiché.
      if (json.endYear && String(json.endYear) !== year) {
        setYear(String(json.endYear));
        return;
      }
      const finCalculee = json.endMonth ? String(json.endMonth).padStart(2, "0") : null;
      if (finCalculee && finCalculee !== selectedMonth) setSelectedMonth(finCalculee);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement des dettes court terme");
    } finally {
      setLoading(false);
    }
  }, [clientId, year, selectedMonth, cumulGranularity, periodType, setYear, setSelectedMonth]);

  useEffect(() => {
    load();
  }, [load]);

  // Fenêtre réellement calculée : du premier mois couvert par le reporting au
  // mois de fin (en granularité Année, le dernier mois importé).
  const nomMois = (v?: string) => MONTHS.find((m) => m.value === v)?.label ?? "";
  const dispo = data?.moisDisponibles ?? [];
  const moisFin = data?.endMonth ? String(data.endMonth).padStart(2, "0") : selectedMonth;


  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mb-2 opacity-30" />
          <p>Aucune donnée de dettes</p>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const total = COMPOSANTES.reduce((s, c) => s + (k[c.key] ?? 0), 0);
  const kpiValues: Record<string, KpiValue> = {
    total: { valeur: total },
    ...Object.fromEntries(COMPOSANTES.map((c) => [c.key, { valeur: k[c.key] ?? 0 }])),
  };

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold text-[#00122E]">Dettes court terme</h1>
        <p className="text-sm text-[#335890] italic mt-1">
          Passif circulant — encours à fin {nomMois(moisFin).toLowerCase()} {year} (mouvements cumulés depuis {nomMois(dispo[0] ?? "01").toLowerCase()}, à-nouveaux compris).
        </p>
      </div>

      {/* KPI — grille partagée : 3 cartes par ligne, configurables. */}
      <KpiGrid
        storageKey={`dettes-ct-${clientId}`}
        onglet="dettes-ct"
        defs={KPI_DEFS}
        values={kpiValues}
      />

      {/* Top 10 par type (déplacé depuis l'onglet Dettes) */}
      {estVisible("dettes-ct", "tableau", "topTypes") && (
        <DetteTable
          title="Analyse des Dettes par Type — Top 10"
          description="Dettes regroupées par type (Solde = Dette − Remboursé)"
          firstColLabel="Type de dette"
          icon={<PiScalesDuotone className="w-5 h-5 text-orange-500" />}
          rows={data.topByType}
        />
      )}
    </div>
  );
}
