"use client";

import { useCallback, useEffect, useState } from "react";
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

// Les états financiers s'expriment en unités monétaires entières.
const fmt = (n: number, showZero: boolean) => {
  if (!n) return showZero ? "0" : "";
  return Math.round(n).toLocaleString("fr-FR");
};

function Amount({ value, total }: { value: number; total: boolean }) {
  return (
    <td
      className={cn(
        "p-2 text-right tabular-nums whitespace-nowrap",
        total && "font-bold",
        value < 0 && "text-red-600",
      )}
    >
      {fmt(value, total)}
    </td>
  );
}

function RefCell({ ref_, total }: { ref_: string; total: boolean }) {
  return (
    <td className={cn("p-2 font-mono text-xs whitespace-nowrap", total && "font-bold")}>{ref_}</td>
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
  const exLabel = (i: number) => `EXERCICE au ${ex[i].label}`;

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
                Système Normal SYSCOHADA — Actif (BRUT / AMORT. et DÉPRÉC. / NET) et Passif (NET).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* ---- ACTIF ---- */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className="p-2 text-left w-16">REF</th>
                  <th className="p-2 text-left min-w-[320px]">ACTIF</th>
                  <th className="p-2 text-right whitespace-nowrap">BRUT</th>
                  <th className="p-2 text-right whitespace-nowrap">AMORT. et DÉPRÉC.</th>
                  <th className="p-2 text-right whitespace-nowrap">NET</th>
                  {ex.slice(1).map((e, i) => (
                    <th key={e.year} className="p-2 text-right whitespace-nowrap">
                      NET {exLabel(i + 1).replace("EXERCICE au ", "")}
                    </th>
                  ))}
                </tr>
                <tr className="bg-muted/20 text-[11px] text-muted-foreground">
                  <th colSpan={2}></th>
                  <th colSpan={3} className="p-1 text-center border-x">
                    {exLabel(0)}
                  </th>
                  {ex.slice(1).map((e) => (
                    <th key={e.year} className="p-1 text-center">
                      EXERCICE au {e.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.actif.map((l) => (
                  <tr
                    key={l.ref}
                    className={cn("border-b", l.total ? "bg-muted/40" : "hover:bg-muted/20")}
                  >
                    <RefCell ref_={l.ref} total={l.total} />
                    <td className={cn("p-2", l.total && "font-bold uppercase")}>{l.libelle}</td>
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
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className="p-2 text-left w-16">REF</th>
                  <th className="p-2 text-left min-w-[320px]">PASSIF</th>
                  {ex.map((e) => (
                    <th key={e.year} className="p-2 text-right whitespace-nowrap">
                      NET — EXERCICE au {e.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.passif.map((l) => (
                  <tr
                    key={l.ref}
                    className={cn("border-b", l.total ? "bg-muted/40" : "hover:bg-muted/20")}
                  >
                    <RefCell ref_={l.ref} total={l.total} />
                    <td className={cn("p-2", l.total && "font-bold uppercase")}>{l.libelle}</td>
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
              <CardTitle>COMPTE DE RÉSULTAT</CardTitle>
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
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className="p-2 text-left w-16">REF</th>
                  <th className="p-2 text-left min-w-[360px]">LIBELLÉS</th>
                  {ex.map((e) => (
                    <th key={e.year} className="p-2 text-right whitespace-nowrap">
                      EXERCICE au {e.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.resultat.map((l) => (
                  <tr
                    key={l.ref}
                    className={cn("border-b", l.total ? "bg-muted/40" : "hover:bg-muted/20")}
                  >
                    <RefCell ref_={l.ref} total={l.total} />
                    <td className={cn("p-2", l.total && "font-bold uppercase")}>
                      {l.libelle}
                      {l.repere && (
                        <span className="ml-2 text-xs text-muted-foreground">({l.repere})</span>
                      )}
                      {l.sens && !l.total && (
                        <span className="ml-2 text-xs text-muted-foreground">{l.sens}</span>
                      )}
                    </td>
                    {ex.map((e, i) => (
                      <Amount key={e.year} value={l.montants[i] ?? 0} total={l.total} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Les montants sont précédés du signe (+) ou (−) selon leur solde dans la balance
            générale. Les signes de la colonne libellés indiquent le sens structurel des soldes ;
            ils ne jouent pas le rôle de signes opérateurs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
