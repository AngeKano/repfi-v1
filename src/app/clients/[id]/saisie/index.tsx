"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ==================== Types ====================
interface PeriodOpt {
  id: string;
  year: number;
  periodStart: string;
  periodEnd: string;
}
interface UploadedRow {
  date_transaction: string;
  compte: string;
  intitule_compte: string;
  n_tiers: string;
  intitule_tiers: string;
  numero_piece: string;
  rubrique: string;
  bilan_rubrique: string;
  debit: number;
  credit: number;
}
interface ManualEntry {
  id: string;
  dateTransaction: string;
  compte: string;
  intituleCompte: string;
  nTiers: string;
  intituleTiers: string;
  numeroPiece: string;
  libelle: string;
  debit: number;
  credit: number;
}
interface CompteRef {
  compte: string;
  intitule: string;
  rubrique: string;
  bilan: string;
}
interface TiersRef {
  nTiers: string;
  intitule: string;
}
interface SaisieData {
  periods: PeriodOpt[];
  period: PeriodOpt | null;
  uploaded: {
    rows: UploadedRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  manual: ManualEntry[];
  refs: { comptes: CompteRef[]; tiers: TiersRef[] };
  balance: { debit: number; credit: number; delta: number };
}

interface FormLine {
  dateTransaction: string; // YYYY-MM-DD
  compte: string;
  nTiers: string;
  libelle: string;
  debit: string;
  credit: string;
}

// ==================== Helpers ====================
const fmt = (n: number) =>
  n ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
const isoToInput = (iso: string) => (iso ? iso.slice(0, 10) : "");
const num = (s: string) => {
  const v = parseFloat((s || "").replace(",", "."));
  return isNaN(v) ? 0 : v;
};

export default function SaisieTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<SaisieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodId, setPeriodId] = useState<string>("");
  const [page, setPage] = useState(1);

  // Formulaire d'ajout d'écriture.
  const [adding, setAdding] = useState(false);
  const [numeroPiece, setNumeroPiece] = useState("");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Édition ligne à ligne.
  const [editId, setEditId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<FormLine | null>(null);

  const fetchData = useCallback(
    async (pid: string, pg: number) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (pid) qs.set("periodId", pid);
        qs.set("page", String(pg));
        const res = await fetch(`/api/clients/${clientId}/saisie?${qs}`);
        if (!res.ok) throw new Error("Erreur API saisie");
        const json = (await res.json()) as SaisieData;
        setData(json);
        if (json.period && json.period.id !== pid) setPeriodId(json.period.id);
        else if (!pid && json.period) setPeriodId(json.period.id);
      } catch (e) {
        console.error(e);
        toast.error("Erreur lors du chargement de la saisie");
      } finally {
        setLoading(false);
      }
    },
    [clientId],
  );

  useEffect(() => {
    fetchData(periodId, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, periodId, page]);

  const period = data?.period ?? null;
  const dateMin = period ? isoToInput(period.periodStart) : "";
  const dateMax = period ? isoToInput(period.periodEnd) : "";

  const newLine = (): FormLine => ({
    dateTransaction: dateMax || "",
    compte: "",
    nTiers: "",
    libelle: "",
    debit: "",
    credit: "",
  });

  const openAdd = () => {
    setLines([newLine(), newLine()]);
    setNumeroPiece("");
    setAdding(true);
  };

  const formDelta = useMemo(() => {
    const d = lines.reduce((s, l) => s + num(l.debit), 0);
    const c = lines.reduce((s, l) => s + num(l.credit), 0);
    return { d, c, delta: d - c };
  }, [lines]);

  const canSubmit =
    lines.length > 0 &&
    Math.abs(formDelta.delta) < 0.01 &&
    formDelta.d > 0 &&
    lines.every((l) => l.compte && l.dateTransaction && (num(l.debit) > 0 || num(l.credit) > 0)) &&
    !submitting;

  const submitEcriture = async () => {
    if (!period) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/saisie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId: period.id,
          numeroPiece: numeroPiece.trim() || undefined,
          lignes: lines.map((l) => ({
            dateTransaction: l.dateTransaction,
            compte: l.compte.trim(),
            nTiers: l.nTiers.trim(),
            libelle: l.libelle.trim(),
            debit: num(l.debit),
            credit: num(l.credit),
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Enregistrement refusé");
        return;
      }
      toast.success("Écriture enregistrée");
      setAdding(false);
      fetchData(period.id, page);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (m: ManualEntry) => {
    setEditId(m.id);
    setEditRow({
      dateTransaction: isoToInput(m.dateTransaction),
      compte: m.compte,
      nTiers: m.nTiers,
      libelle: m.libelle,
      debit: m.debit ? String(m.debit) : "",
      credit: m.credit ? String(m.credit) : "",
    });
  };

  const saveEdit = async () => {
    if (!editId || !editRow || !period) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/saisie/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateTransaction: editRow.dateTransaction,
          compte: editRow.compte.trim(),
          nTiers: editRow.nTiers.trim(),
          libelle: editRow.libelle.trim(),
          debit: num(editRow.debit),
          credit: num(editRow.credit),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Modification refusée");
        return;
      }
      if (json?.warning) toast.warning(json.warning);
      else toast.success("Ligne modifiée");
      setEditId(null);
      setEditRow(null);
      fetchData(period.id, page);
    } catch {
      toast.error("Erreur réseau");
    }
  };

  const deleteEntry = async (m: ManualEntry) => {
    if (!period) return;
    if (
      !window.confirm(
        `Supprimer l'écriture ${m.numeroPiece || ""} (toutes ses lignes) ?`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/clients/${clientId}/saisie/${m.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Suppression refusée");
        return;
      }
      toast.success("Écriture supprimée");
      fetchData(period.id, page);
    } catch {
      toast.error("Erreur réseau");
    }
  };

  // ==================== Rendu ====================
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || data.periods.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Aucune période comptable disponible.
      </div>
    );
  }

  const balanced = Math.abs(data.balance.delta) < 0.01;

  return (
    <div className="space-y-6">
      {/* En-tête : sélecteur de période */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
          <span className="text-xs text-[#335890]">Période :</span>
          <Select
            value={periodId}
            onValueChange={(v) => {
              setPage(1);
              setAdding(false);
              setPeriodId(v);
            }}
          >
            <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[180px] font-semibold text-[#00122E]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {new Date(p.periodStart).toLocaleDateString("fr-FR")} —{" "}
                  {new Date(p.periodEnd).toLocaleDateString("fr-FR")} ({p.year})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 h-10 text-sm font-medium",
            balanced ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700",
          )}
        >
          {balanced ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          Saisies — Débit {fmt(data.balance.debit) || "0"} / Crédit{" "}
          {fmt(data.balance.credit) || "0"}
          {!balanced && (
            <span className="font-bold">
              · Δ {data.balance.delta.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Datalists partagés (comptes / tiers existants) */}
      <datalist id="saisie-comptes">
        {data.refs.comptes.map((c) => (
          <option key={c.compte} value={c.compte}>
            {c.compte} — {c.intitule}
          </option>
        ))}
      </datalist>
      <datalist id="saisie-tiers">
        {data.refs.tiers.map((t) => (
          <option key={t.nTiers} value={t.nTiers}>
            {t.nTiers} — {t.intitule}
          </option>
        ))}
      </datalist>

      {/* ===================== Mes saisies ===================== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Mes lignes saisies</CardTitle>
            <CardDescription>
              Lignes ajoutées manuellement — modifiables et supprimables. Une
              écriture doit être équilibrée (Σ débit = Σ crédit).
            </CardDescription>
          </div>
          {!adding && (
            <Button onClick={openAdd} className="gap-2 rounded-lg">
              <Plus className="w-4 h-4" /> Ajouter une écriture
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Formulaire d'ajout */}
          {adding && (
            <div className="rounded-xl border border-dashed border-[#0077C3] bg-[#F5F9FF] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#00122E]">
                  Nouvelle écriture
                </span>
                <Input
                  placeholder="N° pièce (optionnel)"
                  value={numeroPiece}
                  onChange={(e) => setNumeroPiece(e.target.value)}
                  className="h-8 w-48"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground text-left">
                      <th className="p-1 font-medium">Date</th>
                      <th className="p-1 font-medium">Compte</th>
                      <th className="p-1 font-medium">Tiers</th>
                      <th className="p-1 font-medium">Libellé</th>
                      <th className="p-1 font-medium text-right">Débit</th>
                      <th className="p-1 font-medium text-right">Crédit</th>
                      <th className="p-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td className="p-1">
                          <Input
                            type="date"
                            min={dateMin}
                            max={dateMax}
                            value={l.dateTransaction}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((x, j) =>
                                  j === i ? { ...x, dateTransaction: e.target.value } : x,
                                ),
                              )
                            }
                            className="h-8 w-36"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            list="saisie-comptes"
                            placeholder="Compte"
                            value={l.compte}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((x, j) => (j === i ? { ...x, compte: e.target.value } : x)),
                              )
                            }
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            list="saisie-tiers"
                            placeholder="Tiers"
                            value={l.nTiers}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((x, j) => (j === i ? { ...x, nTiers: e.target.value } : x)),
                              )
                            }
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder="Libellé"
                            value={l.libelle}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)),
                              )
                            }
                            className="h-8 w-40"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            inputMode="decimal"
                            value={l.debit}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((x, j) =>
                                  j === i ? { ...x, debit: e.target.value, credit: "" } : x,
                                ),
                              )
                            }
                            className="h-8 w-24 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            inputMode="decimal"
                            value={l.credit}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((x, j) =>
                                  j === i ? { ...x, credit: e.target.value, debit: "" } : x,
                                ),
                              )
                            }
                            className="h-8 w-24 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <button
                            onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                            disabled={lines.length <= 1}
                            className="text-muted-foreground hover:text-red-600 disabled:opacity-30"
                            title="Retirer la ligne"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((ls) => [...ls, newLine()])}
                  className="gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ligne
                </Button>
                <div
                  className={cn(
                    "text-sm font-semibold",
                    Math.abs(formDelta.delta) < 0.01 ? "text-green-700" : "text-amber-700",
                  )}
                >
                  Débit {fmt(formDelta.d) || "0"} / Crédit {fmt(formDelta.c) || "0"} · Δ{" "}
                  {formDelta.delta.toFixed(2)}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                    Annuler
                  </Button>
                  <Button size="sm" onClick={submitEcriture} disabled={!canSubmit} className="gap-1">
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Enregistrer
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Table des lignes saisies */}
          {data.manual.length === 0 && !adding ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune ligne saisie pour cette période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground text-left border-b">
                    <th className="p-2 font-medium">Date</th>
                    <th className="p-2 font-medium">Compte</th>
                    <th className="p-2 font-medium">Tiers</th>
                    <th className="p-2 font-medium">N° pièce</th>
                    <th className="p-2 font-medium">Libellé</th>
                    <th className="p-2 font-medium text-right">Débit</th>
                    <th className="p-2 font-medium text-right">Crédit</th>
                    <th className="p-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.manual.map((m) =>
                    editId === m.id && editRow ? (
                      <tr key={m.id} className="bg-[#F5F9FF]">
                        <td className="p-1">
                          <Input
                            type="date"
                            min={dateMin}
                            max={dateMax}
                            value={editRow.dateTransaction}
                            onChange={(e) => setEditRow({ ...editRow, dateTransaction: e.target.value })}
                            className="h-8 w-36"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            list="saisie-comptes"
                            value={editRow.compte}
                            onChange={(e) => setEditRow({ ...editRow, compte: e.target.value })}
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            list="saisie-tiers"
                            value={editRow.nTiers}
                            onChange={(e) => setEditRow({ ...editRow, nTiers: e.target.value })}
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="p-2 text-muted-foreground">{m.numeroPiece}</td>
                        <td className="p-1">
                          <Input
                            value={editRow.libelle}
                            onChange={(e) => setEditRow({ ...editRow, libelle: e.target.value })}
                            className="h-8 w-40"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            inputMode="decimal"
                            value={editRow.debit}
                            onChange={(e) => setEditRow({ ...editRow, debit: e.target.value, credit: "" })}
                            className="h-8 w-24 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            inputMode="decimal"
                            value={editRow.credit}
                            onChange={(e) => setEditRow({ ...editRow, credit: e.target.value, debit: "" })}
                            className="h-8 w-24 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={saveEdit} className="text-green-600 hover:text-green-700" title="Enregistrer">
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditId(null);
                                setEditRow(null);
                              }}
                              className="text-muted-foreground hover:text-[#00122E]"
                              title="Annuler"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={m.id} className="border-b hover:bg-muted/30">
                        <td className="p-2">
                          {new Date(m.dateTransaction).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="p-2">
                          <span className="font-medium">{m.compte}</span>
                          <span className="text-muted-foreground"> {m.intituleCompte}</span>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {m.nTiers ? `${m.nTiers} ${m.intituleTiers}` : "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">{m.numeroPiece}</td>
                        <td className="p-2 text-muted-foreground">{m.libelle}</td>
                        <td className="p-2 text-right tabular-nums text-blue-700">{fmt(m.debit)}</td>
                        <td className="p-2 text-right tabular-nums text-green-700">{fmt(m.credit)}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => startEdit(m)} className="text-[#0077C3] hover:text-[#005992]" title="Modifier">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteEntry(m)} className="text-muted-foreground hover:text-red-600" title="Supprimer l'écriture">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== Grand livre importé ===================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <div>
              <CardTitle>Grand livre importé</CardTitle>
              <CardDescription>
                Lignes issues de l&apos;import — lecture seule ({data.uploaded.total}{" "}
                ligne{data.uploaded.total > 1 ? "s" : ""}).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left border-b">
                  <th className="p-2 font-medium">Date</th>
                  <th className="p-2 font-medium">Compte</th>
                  <th className="p-2 font-medium">Tiers</th>
                  <th className="p-2 font-medium">N° pièce</th>
                  <th className="p-2 font-medium text-right">Débit</th>
                  <th className="p-2 font-medium text-right">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {data.uploaded.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Aucune ligne pour cette période.
                    </td>
                  </tr>
                ) : (
                  data.uploaded.rows.map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{r.date_transaction}</td>
                      <td className="p-2">
                        <span className="font-medium">{r.compte}</span>
                        <span className="text-muted-foreground"> {r.intitule_compte}</span>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.n_tiers ? `${r.n_tiers} ${r.intitule_tiers}` : "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.numero_piece}</td>
                      <td className="p-2 text-right tabular-nums text-blue-700">{fmt(r.debit)}</td>
                      <td className="p-2 text-right tabular-nums text-green-700">{fmt(r.credit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.uploaded.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">
                Page {data.uploaded.page} / {data.uploaded.totalPages} ·{" "}
                {data.uploaded.pageSize} lignes par page
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.uploaded.page <= 1 || loading}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Préc.
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.uploaded.page >= data.uploaded.totalPages || loading}
                  className="gap-1"
                >
                  Suiv. <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Badge variant="outline" className="text-xs">
          Info
        </Badge>
        Les lignes saisies sont intégrées aux calculs du reporting. Les comptes
        et tiers doivent exister dans le grand livre importé.
      </p>
    </div>
  );
}
