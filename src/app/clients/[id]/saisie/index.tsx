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
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CODES_JOURNAUX,
  isCentralizingAccount,
  suggestTypeTiers,
} from "@/lib/comptable/saisie-refs";

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
  codeJournal: string;
  compte: string;
  intituleCompte: string;
  nTiers: string;
  intituleTiers: string;
  typeTiers: string;
  rubrique: string;
  numeroPiece: string;
  numeroFacture: string;
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
  comptes: string[]; // comptes auxquels ce tiers est rattaché (pour filtrer)
}
interface SaisieData {
  client: { id: string; name: string };
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
  compte: string;
  nTiers: string;
  typeTiers: string;
  numeroFacture: string;
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

// Cellule "auto" : valeur dérivée du numéro de compte / tiers (référentiel
// existant, même logique qu'Airflow). Grisée, verrouillée, non modifiable.
function AutoCell({ value, className }: { value?: string; className?: string }) {
  return (
    <div
      title={value || ""}
      className={cn(
        "h-8 flex items-center px-2 rounded-md bg-muted/60 text-muted-foreground text-xs truncate cursor-not-allowed border border-transparent",
        className,
      )}
    >
      {value || "—"}
    </div>
  );
}

function pageWindow(current: number, total: number, size = 5): (number | "…")[] {
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(size / 2));
  const end = Math.min(total, start + size - 1);
  start = Math.max(1, end - size + 1);
  const out: (number | "…")[] = [];
  if (start > 1) {
    out.push(1);
    if (start > 2) out.push("…");
  }
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total) {
    if (end < total - 1) out.push("…");
    out.push(total);
  }
  return out;
}

export default function SaisieTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<SaisieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodId, setPeriodId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Formulaire d'ajout d'écriture (en-tête + lignes).
  const [adding, setAdding] = useState(false);
  const [ecrDate, setEcrDate] = useState("");
  const [ecrJournal, setEcrJournal] = useState("");
  const [ecrLibelle, setEcrLibelle] = useState("");
  const [ecrPiece, setEcrPiece] = useState("");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Édition ligne à ligne.
  const [editId, setEditId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<FormLine | null>(null);

  const fetchData = useCallback(
    async (pid: string, pg: number, srch: string, sBy: string, sDir: string) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (pid) qs.set("periodId", pid);
        qs.set("page", String(pg));
        if (srch) qs.set("search", srch);
        qs.set("sortBy", sBy);
        qs.set("sortDir", sDir);
        const res = await fetch(`/api/clients/${clientId}/saisie?${qs}`);
        if (!res.ok) throw new Error("Erreur API saisie");
        const json = (await res.json()) as SaisieData;
        setData(json);
        if (json.period && json.period.id !== pid) setPeriodId(json.period.id);
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
    const t = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(1);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    fetchData(periodId, page, search, sortBy, sortDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, periodId, page, search, sortBy, sortDir]);

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };
  const sortTh = (col: string, label: string, right = false) => (
    <th
      onClick={() => toggleSort(col)}
      className={cn(
        "p-2 font-medium cursor-pointer select-none hover:text-[#0077C3] transition-colors",
        right ? "text-right" : "text-left",
      )}
    >
      <span className={cn("inline-flex items-center gap-1", right && "flex-row-reverse")}>
        {label}
        {sortBy === col ? (
          sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </span>
    </th>
  );

  const period = data?.period ?? null;
  const dateMin = period ? isoToInput(period.periodStart) : "";
  const dateMax = period ? isoToInput(period.periodEnd) : "";

  const compteInfo = useCallback(
    (c: string) => data?.refs.comptes.find((x) => x.compte === c),
    [data],
  );
  const tiersInfo = useCallback(
    (t: string) => data?.refs.tiers.find((x) => x.nTiers === t),
    [data],
  );
  // Tiers pertinents pour un compte donné (rattachés à ce compte dans le GL).
  const tiersForCompte = useCallback(
    (c: string) => (data?.refs.tiers ?? []).filter((t) => t.comptes?.includes(c)),
    [data],
  );

  const newLine = (): FormLine => ({
    compte: "",
    nTiers: "",
    typeTiers: "",
    numeroFacture: "",
    debit: "",
    credit: "",
  });

  const openAdd = () => {
    setEcrDate(dateMax || "");
    setEcrJournal("");
    setEcrLibelle("");
    setEcrPiece("");
    setLines([newLine(), newLine()]);
    setAdding(true);
  };

  const setLine = (i: number, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const formDelta = useMemo(() => {
    const d = lines.reduce((s, l) => s + num(l.debit), 0);
    const c = lines.reduce((s, l) => s + num(l.credit), 0);
    return { d, c, delta: d - c };
  }, [lines]);

  const canSubmit =
    !!ecrJournal &&
    !!ecrDate &&
    lines.length > 0 &&
    Math.abs(formDelta.delta) < 0.01 &&
    formDelta.d > 0 &&
    lines.every((l) => l.compte && (num(l.debit) > 0 || num(l.credit) > 0)) &&
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
          dateTransaction: ecrDate,
          codeJournal: ecrJournal,
          libelle: ecrLibelle.trim(),
          numeroPiece: ecrPiece.trim() || undefined,
          lignes: lines.map((l) => ({
            compte: l.compte.trim(),
            nTiers: l.nTiers.trim(),
            typeTiers: l.typeTiers.trim(),
            numeroFacture: l.numeroFacture.trim(),
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
      fetchData(period.id, page, search, sortBy, sortDir);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (m: ManualEntry) => {
    setEditId(m.id);
    setEditRow({
      compte: m.compte,
      nTiers: m.nTiers,
      typeTiers: m.typeTiers,
      numeroFacture: m.numeroFacture,
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
          compte: editRow.compte.trim(),
          nTiers: editRow.nTiers.trim(),
          typeTiers: editRow.typeTiers.trim(),
          numeroFacture: editRow.numeroFacture.trim(),
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
      fetchData(period.id, page, search, sortBy, sortDir);
    } catch {
      toast.error("Erreur réseau");
    }
  };

  const deleteEntry = async (m: ManualEntry) => {
    if (!period) return;
    if (!window.confirm(`Supprimer cette ligne (${m.compte}${m.numeroPiece ? ` · ${m.numeroPiece}` : ""}) ?`)) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/saisie/${m.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Suppression refusée");
        return;
      }
      if (json?.warning) toast.warning(json.warning);
      else toast.success("Ligne supprimée");
      fetchData(period.id, page, search, sortBy, sortDir);
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
  const cellInput = "h-8 text-xs";

  return (
    <div className="space-y-6">
      {/* En-tête : entité + période + équilibre */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-4 h-10">
          <span className="text-xs text-[#335890]">Entité :</span>
          <span className="font-semibold text-[#00122E]">{data.client.name}</span>
        </div>
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
          {balanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          Saisies — D {fmt(data.balance.debit) || "0"} / C {fmt(data.balance.credit) || "0"}
          {!balanced && <span className="font-bold">· Δ {data.balance.delta.toFixed(2)}</span>}
        </div>
      </div>

      {/* Datalist comptes : numéro seul (l'intitulé s'affiche en cellule auto). */}
      <datalist id="saisie-comptes">
        {data.refs.comptes.map((c) => (
          <option key={c.compte} value={c.compte} />
        ))}
      </datalist>

      {/* ===================== Mes saisies ===================== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Mes écritures saisies</CardTitle>
            <CardDescription>
              Écritures ajoutées manuellement — modifiables / supprimables. Une écriture
              doit être équilibrée (Σ débit = Σ crédit).
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
              {/* En-tête écriture */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-[#335890]">Date transaction *</label>
                  <Input type="date" min={dateMin} max={dateMax} value={ecrDate} onChange={(e) => setEcrDate(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="text-xs text-[#335890]">Code journal *</label>
                  <Select value={ecrJournal} onValueChange={setEcrJournal}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Journal" />
                    </SelectTrigger>
                    <SelectContent>
                      {CODES_JOURNAUX.map((j) => (
                        <SelectItem key={j.code} value={j.code}>
                          {j.code} — {j.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-[#335890]">N° pièce</label>
                  <Input value={ecrPiece} onChange={(e) => setEcrPiece(e.target.value)} placeholder="Auto" className="h-9" />
                </div>
                <div>
                  <label className="text-xs text-[#335890]">Libellé opération</label>
                  <Input value={ecrLibelle} onChange={(e) => setEcrLibelle(e.target.value)} className="h-9" />
                </div>
              </div>

              {/* Lignes */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground text-left">
                      <th className="p-1 w-8">#</th>
                      <th className="p-1">Compte</th>
                      <th className="p-1">Intitulé compte</th>
                      <th className="p-1">N° Tiers</th>
                      <th className="p-1">Intitulé tiers</th>
                      <th className="p-1">Type Tiers</th>
                      <th className="p-1">Rubrique</th>
                      <th className="p-1">N° Facture</th>
                      <th className="p-1 text-right">Débit</th>
                      <th className="p-1 text-right">Crédit</th>
                      <th className="p-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const info = compteInfo(l.compte);
                      const central = isCentralizingAccount(l.compte);
                      return (
                        <tr key={i}>
                          <td className="p-1 text-muted-foreground">{i + 1}</td>
                          <td className="p-1">
                            <Input
                              list="saisie-comptes"
                              value={l.compte}
                              onChange={(e) => {
                                const compte = e.target.value;
                                const c = isCentralizingAccount(compte);
                                setLine(i, {
                                  compte,
                                  typeTiers: c ? suggestTypeTiers(compte) : "",
                                  nTiers: c ? l.nTiers : "",
                                });
                              }}
                              className={cn(cellInput, "w-28")}
                            />
                          </td>
                          <td className="p-1">
                            <AutoCell value={info?.intitule} className="w-40 max-w-[170px]" />
                          </td>
                          <td className="p-1">
                            <Input
                              list={`saisie-tiers-${i}`}
                              value={l.nTiers}
                              disabled={!central}
                              onChange={(e) => setLine(i, { nTiers: e.target.value })}
                              className={cn(cellInput, "w-24", !central && "opacity-40")}
                              placeholder={central ? "" : "—"}
                            />
                            {central && (
                              <datalist id={`saisie-tiers-${i}`}>
                                {tiersForCompte(l.compte).map((t) => (
                                  <option key={t.nTiers} value={t.nTiers} />
                                ))}
                              </datalist>
                            )}
                          </td>
                          <td className="p-1">
                            <AutoCell
                              value={central ? tiersInfo(l.nTiers)?.intitule : ""}
                              className="w-36 max-w-[150px]"
                            />
                          </td>
                          <td className="p-1">
                            <AutoCell
                              value={central ? suggestTypeTiers(l.compte) : ""}
                              className="w-24"
                            />
                          </td>
                          <td className="p-1">
                            <AutoCell value={info?.rubrique} className="w-20" />
                          </td>
                          <td className="p-1">
                            <Input value={l.numeroFacture} onChange={(e) => setLine(i, { numeroFacture: e.target.value })} className={cn(cellInput, "w-24")} />
                          </td>
                          <td className="p-1">
                            <Input inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })} className={cn(cellInput, "w-24 text-right")} />
                          </td>
                          <td className="p-1">
                            <Input inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })} className={cn(cellInput, "w-24 text-right")} />
                          </td>
                          <td className="p-1">
                            <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 1} className="text-muted-foreground hover:text-red-600 disabled:opacity-30" title="Retirer la ligne">
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t font-semibold">
                      <td className="p-1" colSpan={8}>
                        Total
                      </td>
                      <td className="p-1 text-right tabular-nums">{fmt(formDelta.d)}</td>
                      <td className="p-1 text-right tabular-nums">{fmt(formDelta.c)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> Ligne
                </Button>
                <div className={cn("text-sm font-semibold", Math.abs(formDelta.delta) < 0.01 ? "text-green-700" : "text-amber-700")}>
                  Δ {formDelta.delta.toFixed(2)}
                  {Math.abs(formDelta.delta) >= 0.01 && " — non équilibré"}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                    Annuler
                  </Button>
                  <Button size="sm" onClick={submitEcriture} disabled={!canSubmit} className="gap-1">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Les champs Tiers / Type Tiers ne sont actifs que pour les comptes centralisateurs (401X, 411X).
                L&apos;enregistrement n&apos;est possible que si total débit = total crédit.
              </p>
            </div>
          )}

          {/* Table des écritures saisies */}
          {data.manual.length === 0 && !adding ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune écriture saisie pour cette période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-muted-foreground text-left border-b">
                    <th className="p-2">Date</th>
                    <th className="p-2">Journal</th>
                    <th className="p-2">Compte</th>
                    <th className="p-2">Tiers</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Rubrique</th>
                    <th className="p-2">N° Pièce</th>
                    <th className="p-2">N° Facture</th>
                    <th className="p-2">Libellé</th>
                    <th className="p-2 text-right">Débit</th>
                    <th className="p-2 text-right">Crédit</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.manual.map((m) => {
                    const central = editRow ? isCentralizingAccount(editRow.compte) : false;
                    return editId === m.id && editRow ? (
                      <tr key={m.id} className="bg-[#F5F9FF]">
                        <td className="p-2">{new Date(m.dateTransaction).toLocaleDateString("fr-FR")}</td>
                        <td className="p-2">{m.codeJournal}</td>
                        <td className="p-1">
                          <Input
                            list="saisie-comptes"
                            value={editRow.compte}
                            onChange={(e) => {
                              const compte = e.target.value;
                              const c = isCentralizingAccount(compte);
                              setEditRow({
                                ...editRow,
                                compte,
                                typeTiers: c ? suggestTypeTiers(compte) : "",
                                nTiers: c ? editRow.nTiers : "",
                              });
                            }}
                            className={cn(cellInput, "w-24")}
                          />
                        </td>
                        <td className="p-1">
                          <Input list="saisie-tiers-edit" value={editRow.nTiers} disabled={!central} onChange={(e) => setEditRow({ ...editRow, nTiers: e.target.value })} className={cn(cellInput, "w-24", !central && "opacity-40")} />
                          {central && (
                            <datalist id="saisie-tiers-edit">
                              {tiersForCompte(editRow.compte).map((t) => (
                                <option key={t.nTiers} value={t.nTiers} />
                              ))}
                            </datalist>
                          )}
                        </td>
                        <td className="p-1">
                          <AutoCell value={central ? suggestTypeTiers(editRow.compte) : ""} className="w-24" />
                        </td>
                        <td className="p-1">
                          <AutoCell value={compteInfo(editRow.compte)?.rubrique || m.rubrique} className="w-20" />
                        </td>
                        <td className="p-2 text-muted-foreground">{m.numeroPiece}</td>
                        <td className="p-1">
                          <Input value={editRow.numeroFacture} onChange={(e) => setEditRow({ ...editRow, numeroFacture: e.target.value })} className={cn(cellInput, "w-24")} />
                        </td>
                        <td className="p-2 text-muted-foreground">{m.libelle}</td>
                        <td className="p-1">
                          <Input inputMode="decimal" value={editRow.debit} onChange={(e) => setEditRow({ ...editRow, debit: e.target.value, credit: "" })} className={cn(cellInput, "w-20 text-right")} />
                        </td>
                        <td className="p-1">
                          <Input inputMode="decimal" value={editRow.credit} onChange={(e) => setEditRow({ ...editRow, credit: e.target.value, debit: "" })} className={cn(cellInput, "w-20 text-right")} />
                        </td>
                        <td className="p-1">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={saveEdit} className="text-green-600 hover:text-green-700" title="Enregistrer">
                              <Save className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setEditId(null); setEditRow(null); }} className="text-muted-foreground hover:text-[#00122E]" title="Annuler">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={m.id} className="border-b hover:bg-muted/30">
                        <td className="p-2 whitespace-nowrap">{new Date(m.dateTransaction).toLocaleDateString("fr-FR")}</td>
                        <td className="p-2">{m.codeJournal}</td>
                        <td className="p-2">
                          <span className="font-medium">{m.compte}</span>
                          <span className="text-muted-foreground"> {m.intituleCompte}</span>
                        </td>
                        <td className="p-2 text-muted-foreground">{m.nTiers ? `${m.nTiers} ${m.intituleTiers}` : "—"}</td>
                        <td className="p-2 text-muted-foreground">{m.typeTiers || "—"}</td>
                        <td className="p-2 text-muted-foreground">{m.rubrique || "—"}</td>
                        <td className="p-2 text-muted-foreground">{m.numeroPiece}</td>
                        <td className="p-2 text-muted-foreground">{m.numeroFacture || "—"}</td>
                        <td className="p-2 text-muted-foreground max-w-[160px] truncate">{m.libelle}</td>
                        <td className="p-2 text-right tabular-nums text-blue-700">{fmt(m.debit)}</td>
                        <td className="p-2 text-right tabular-nums text-green-700">{fmt(m.credit)}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => startEdit(m)} className="text-[#0077C3] hover:text-[#005992]" title="Modifier">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteEntry(m)} className="text-muted-foreground hover:text-red-600" title="Supprimer la ligne">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== Grand livre importé ===================== */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Rechercher (compte, tiers, pièce, date…)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 w-72 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  {sortTh("date", "Date")}
                  {sortTh("compte", "Compte")}
                  {sortTh("tiers", "Tiers")}
                  {sortTh("piece", "N° pièce")}
                  {sortTh("debit", "Débit", true)}
                  {sortTh("credit", "Crédit", true)}
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

          {/* Pagination numérotée */}
          {data.uploaded.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {data.uploaded.total} ligne{data.uploaded.total > 1 ? "s" : ""} · {data.uploaded.pageSize}/page
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.uploaded.page <= 1 || loading} className="h-8 w-8 p-0" title="Page précédente">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {pageWindow(data.uploaded.page, data.uploaded.totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-2 text-muted-foreground select-none">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === data.uploaded.page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(p)}
                      disabled={loading}
                      className={cn("h-8 min-w-8 px-2 tabular-nums", p === data.uploaded.page && "bg-[#0077C3] hover:bg-[#005992] text-white")}
                    >
                      {p}
                    </Button>
                  ),
                )}
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={data.uploaded.page >= data.uploaded.totalPages || loading} className="h-8 w-8 p-0" title="Page suivante">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Badge variant="outline" className="text-xs">Info</Badge>
        Les écritures saisies sont intégrées aux calculs du reporting. Seul le Loader Plus peut saisir.
      </p>
    </div>
  );
}
