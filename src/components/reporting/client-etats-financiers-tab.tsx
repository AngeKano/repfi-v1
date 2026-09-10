"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { PiScalesDuotone, PiChartDonutDuotone } from "react-icons/pi";
import { cn } from "@/lib/utils";

interface Exercice {
  year: number;
  label: string;
}
interface LigneActif {
  ref: string;
  libelle: string;
  total: boolean;
  brut: number;
  amort: number;
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
  manualIncluded: boolean;
  actif: LigneActif[];
  passif: LignePassif[];
  resultat: LigneResultat[];
}

// ==================== Styles (grille type état officiel) ====================
const TH = "border border-[#9AA9BC] bg-[#EDEDED] px-3 py-2 text-center text-xs font-semibold text-[#1A1A1A] whitespace-nowrap";
const TD = "border border-[#9AA9BC] px-3 py-1.5 align-middle";

// Les états financiers s'expriment en unités monétaires entières.
const fmt = (n: number, showZero: boolean) => {
  if (!n) return showZero ? "0" : "";
  return Math.round(n).toLocaleString("fr-FR");
};

function Amount({ value, total }: { value: number; total: boolean }) {
  return (
    <td
      className={cn(
        TD,
        "text-right tabular-nums whitespace-nowrap",
        total && "font-bold",
        value < 0 && "text-red-600",
      )}
    >
      {fmt(value, total)}
    </td>
  );
}

export default function ClientEtatsFinanciersTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<EtatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}/reporting/etats-financiers`);
      if (!res.ok) throw new Error("Erreur API");
      setData((await res.json()) as EtatsData);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger les états financiers.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <AlertTriangle className="w-10 h-10 mb-2 opacity-30" />
        <p>{error || "Aucune donnée"}</p>
      </div>
    );
  }
  if (data.exercices.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Aucun exercice comptable disponible.
      </div>
    );
  }

  const ex = data.exercices;
  // Ligne de libellé : les sous-totaux du modèle sont en gras majuscules.
  const libCell = (libelle: string, total: boolean, extra?: ReactNode) => (
    <td className={cn(TD, total && "font-bold uppercase")}>
      {libelle}
      {extra}
    </td>
  );

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
          <span className="text-xs text-[#335890]">Entité :</span>
          <span className="font-semibold text-[#00122E]">{data.client.name}</span>
        </div>
        <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
          <span className="text-xs text-[#335890]">Exercices :</span>
          <span className="font-semibold text-[#00122E]">
            {ex.map((e) => e.year).join(" · ")}
          </span>
        </div>
        <Badge variant="outline" className="text-xs">
          {data.manualIncluded ? "Saisies incluses" : "Saisies masquées"}
        </Badge>
      </div>

      {/* ==================== TABLEAU 1 — BILAN ==================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <PiScalesDuotone className="w-5 h-5 text-[#0077C3]" />
            <div>
              <CardTitle>BILAN</CardTitle>
              <CardDescription>
                Système Normal SYSCOHADA — Actif (BRUT / AMORT et DEPREC. / NET) et Passif (NET).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
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
                    EXERCICE au {ex[0].label}
                  </th>
                  {ex.slice(1).map((e) => (
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
                  {ex.slice(1).map((e) => (
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
                    <Amount value={l.brut} total={l.total} />
                    <Amount value={l.amort} total={l.total} />
                    <Amount value={l.nets[0] ?? 0} total={l.total} />
                    {ex.slice(1).map((e, i) => (
                      <Amount key={e.year} value={l.nets[i + 1] ?? 0} total={l.total} />
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
                  {ex.map((e, i) => (
                    <th key={e.year} className={TH}>
                      {i === 0 ? "EXERCICE au " : "EXERCICE AU "}
                      <br />
                      {e.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {ex.map((e) => (
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
                    {ex.map((e, i) => (
                      <Amount key={e.year} value={l.nets[i] ?? 0} total={l.total} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ============== TABLEAU 2 — COMPTE DE RÉSULTAT ============== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <PiChartDonutDuotone className="w-5 h-5 text-[#0077C3]" />
            <div>
              <CardTitle>COMPTE DE RESULTAT</CardTitle>
              <CardDescription>
                Système Normal SYSCOHADA — montants nets par exercice.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
                  {ex.map((e) => (
                    <th key={e.year} className={TH}>
                      EXERCICE AU
                      <br />
                      {e.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {ex.map((e) => (
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
                    {ex.map((e, i) => (
                      <Amount key={e.year} value={l.montants[i] ?? 0} total={l.total} />
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
        </CardContent>
      </Card>
    </div>
  );
}
