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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
  Download,
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
  debit: string;
  credit: string;
}

// Écriture = ensemble de lignes saisies partageant le même n° pièce.
interface Ecriture {
  numeroPiece: string;
  dateTransaction: string;
  codeJournal: string;
  libelle: string;
  numeroFacture: string;
  lines: ManualEntry[];
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

  // Formulaire (ajout ou modification d'une écriture entière).
  const [formOpen, setFormOpen] = useState<null | "add" | "edit">(null);
  const [editPiece, setEditPiece] = useState<string>("");
  const [ecrDate, setEcrDate] = useState("");
  const [ecrJournal, setEcrJournal] = useState("");
  const [ecrLibelle, setEcrLibelle] = useState("");
  const [ecrPiece, setEcrPiece] = useState("");
  const [ecrFacture, setEcrFacture] = useState("");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Pop-up de suppression multiple (sélection d'écritures).
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPieces, setSelectedPieces] = useState<Set<string>>(new Set());
  const [modalPage, setModalPage] = useState(1);
  const [deletingSel, setDeletingSel] = useState(false);

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

  // Regroupe les lignes saisies en écritures (par n° pièce).
  const ecritures: Ecriture[] = useMemo(() => {
    const map = new Map<string, Ecriture>();
    for (const m of data?.manual ?? []) {
      const key = m.numeroPiece || m.id;
      if (!map.has(key))
        map.set(key, {
          numeroPiece: m.numeroPiece,
          dateTransaction: m.dateTransaction,
          codeJournal: m.codeJournal,
          libelle: m.libelle,
          numeroFacture: m.numeroFacture,
          lines: [],
        });
      map.get(key)!.lines.push(m);
    }
    return [...map.values()];
  }, [data]);

  const newLine = (): FormLine => ({
    compte: "",
    nTiers: "",
    typeTiers: "",
    debit: "",
    credit: "",
  });

  const openAdd = () => {
    setEcrDate(dateMax || "");
    setEcrJournal("");
    setEcrLibelle("");
    setEcrPiece("");
    setEcrFacture("");
    setEditPiece("");
    setLines([newLine(), newLine()]);
    setFormOpen("add");
  };

  const openEdit = (e: Ecriture) => {
    setEcrDate(isoToInput(e.dateTransaction));
    setEcrJournal(e.codeJournal);
    setEcrLibelle(e.libelle);
    setEcrPiece(e.numeroPiece);
    setEcrFacture(e.numeroFacture);
    setEditPiece(e.numeroPiece);
    setLines(
      e.lines.map((l) => ({
        compte: l.compte,
        nTiers: l.nTiers,
        typeTiers: l.typeTiers,
        debit: l.debit ? String(l.debit) : "",
        credit: l.credit ? String(l.credit) : "",
      })),
    );
    setFormOpen("edit");
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
    (formDelta.d !== 0 || formDelta.c !== 0) &&
    lines.every((l) => l.compte && (num(l.debit) !== 0 || num(l.credit) !== 0)) &&
    !submitting;

  const submitForm = async () => {
    if (!period) return;
    setSubmitting(true);
    try {
      const payloadLines = lines.map((l) => ({
        compte: l.compte.trim(),
        nTiers: l.nTiers.trim(),
        typeTiers: l.typeTiers.trim(),
        debit: num(l.debit),
        credit: num(l.credit),
      }));
      const isEdit = formOpen === "edit";
      const res = await fetch(`/api/clients/${clientId}/saisie`, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                periodId: period.id,
                numeroPiece: editPiece,
                dateTransaction: ecrDate,
                codeJournal: ecrJournal,
                libelle: ecrLibelle.trim(),
                numeroFacture: ecrFacture.trim(),
                lignes: payloadLines,
              }
            : {
                periodId: period.id,
                dateTransaction: ecrDate,
                codeJournal: ecrJournal,
                libelle: ecrLibelle.trim(),
                numeroPiece: ecrPiece.trim() || undefined,
                numeroFacture: ecrFacture.trim(),
                lignes: payloadLines,
              },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Enregistrement refusé");
        return;
      }
      toast.success(isEdit ? "Écriture modifiée" : "Écriture enregistrée");
      setFormOpen(null);
      fetchData(period.id, page, search, sortBy, sortDir);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  };

  // Supprime une écriture entière (toutes ses lignes).
  const deleteEcriture = async (e: Ecriture) => {
    if (!period) return;
    const n = e.lines.length;
    if (!window.confirm(`Supprimer toute l'écriture ${e.numeroPiece || ""} (${n} ligne${n > 1 ? "s" : ""}) ?`)) return;
    try {
      const qs = new URLSearchParams({ periodId: period.id, numeroPiece: e.numeroPiece });
      const res = await fetch(`/api/clients/${clientId}/saisie?${qs}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Suppression refusée");
        return;
      }
      toast.success("Écriture supprimée");
      fetchData(period.id, page, search, sortBy, sortDir);
    } catch {
      toast.error("Erreur réseau");
    }
  };

  // Télécharge le récap Excel (grand livre uploadé + saisies, colonne Flags).
  const exportExcel = async () => {
    if (!period) return;
    setExporting(true);
    try {
      const qs = new URLSearchParams({ periodId: period.id });
      const res = await fetch(`/api/clients/${clientId}/saisie/export?${qs}`);
      if (!res.ok) {
        toast.error("Échec du téléchargement");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      a.download = m?.[1] || `grand_livre_${period.year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setExporting(false);
    }
  };

  // Ouvre la pop-up de suppression avec toutes les écritures pré-cochées.
  const openDeleteModal = () => {
    setSelectedPieces(new Set(ecritures.map((e) => e.numeroPiece).filter(Boolean)));
    setModalPage(1);
    setShowDeleteModal(true);
  };
  const togglePiece = (p: string) =>
    setSelectedPieces((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const toggleAllModal = () =>
    setSelectedPieces((s) =>
      s.size === ecritures.length ? new Set() : new Set(ecritures.map((e) => e.numeroPiece).filter(Boolean)),
    );

  // Supprime les écritures sélectionnées dans la pop-up.
  const confirmDeleteSelected = async () => {
    if (!period || selectedPieces.size === 0) return;
    setDeletingSel(true);
    try {
      const qs = new URLSearchParams({ periodId: period.id });
      selectedPieces.forEach((p) => qs.append("numeroPiece", p));
      const res = await fetch(`/api/clients/${clientId}/saisie?${qs}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Suppression refusée");
        return;
      }
      toast.success(`${selectedPieces.size} écriture(s) supprimée(s)`);
      setShowDeleteModal(false);
      fetchData(period.id, page, search, sortBy, sortDir);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setDeletingSel(false);
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

  // Pagination de la pop-up de suppression.
  const MODAL_SIZE = 8;
  const modalTotalPages = Math.max(1, Math.ceil(ecritures.length / MODAL_SIZE));
  const pagedEcritures = ecritures.slice((modalPage - 1) * MODAL_SIZE, modalPage * MODAL_SIZE);
  const allSelected = ecritures.length > 0 && selectedPieces.size === ecritures.length;

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
              setFormOpen(null);
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
        <Button
          variant="outline"
          onClick={exportExcel}
          disabled={exporting}
          className="gap-2 h-10 rounded-lg"
          title="Télécharger le grand livre (uploadé + saisies) au format Excel"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Télécharger
        </Button>
      </div>

      {/* Datalist comptes : numéro seul (l'intitulé s'affiche en cellule auto). */}
      <datalist id="saisie-comptes">
        {data.refs.comptes.map((c) => (
          <option key={c.compte} value={c.compte} />
        ))}
      </datalist>

      {/* ===================== Mes écritures saisies ===================== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Mes écritures saisies</CardTitle>
            <CardDescription>
              Écritures ajoutées manuellement — modifiables (écriture entière) et
              supprimables ligne par ligne. Une écriture doit être équilibrée
              (Σ débit = Σ crédit) pour être enregistrée.
            </CardDescription>
          </div>
          {!formOpen && (
            <div className="flex items-center gap-2">
              {ecritures.length > 0 && (
                <Button
                  variant="outline"
                  onClick={openDeleteModal}
                  className="gap-2 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  title="Sélectionner des écritures saisies à supprimer"
                >
                  <Trash2 className="w-4 h-4" /> Tout supprimer
                </Button>
              )}
              <Button onClick={openAdd} className="gap-2 rounded-lg">
                <Plus className="w-4 h-4" /> Ajouter une écriture
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Formulaire (ajout / modification) */}
          {formOpen && (
            <div className="rounded-xl border border-dashed border-[#0077C3] bg-[#F5F9FF] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-[#00122E] text-sm">
                  {formOpen === "edit" ? `Modifier l'écriture ${editPiece}` : "Nouvelle écriture"}
                </h4>
              </div>
              {/* En-tête écriture */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                  <Input
                    value={ecrPiece}
                    onChange={(e) => setEcrPiece(e.target.value)}
                    placeholder="Auto"
                    disabled={formOpen === "edit"}
                    className={cn("h-9", formOpen === "edit" && "opacity-60")}
                  />
                </div>
                <div>
                  <label className="text-xs text-[#335890]">N° facture</label>
                  <Input value={ecrFacture} onChange={(e) => setEcrFacture(e.target.value)} className="h-9" />
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
                            <AutoCell value={central ? suggestTypeTiers(l.compte) : ""} className="w-24" />
                          </td>
                          <td className="p-1">
                            <AutoCell value={info?.rubrique} className="w-20" />
                          </td>
                          <td className="p-1">
                            <Input inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value })} className={cn(cellInput, "w-24 text-right")} />
                          </td>
                          <td className="p-1">
                            <Input inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value })} className={cn(cellInput, "w-24 text-right")} />
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
                      <td className="p-1" colSpan={7}>
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
                  <Button variant="ghost" size="sm" onClick={() => setFormOpen(null)}>
                    Annuler
                  </Button>
                  <Button size="sm" onClick={submitForm} disabled={!canSubmit} className="gap-1">
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

          {/* Liste des écritures saisies */}
          {ecritures.length === 0 && !formOpen ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune écriture saisie pour cette période.
            </p>
          ) : (
            <div className="space-y-4">
              {ecritures.map((e) => {
                const d = e.lines.reduce((s, l) => s + l.debit, 0);
                const c = e.lines.reduce((s, l) => s + l.credit, 0);
                const ecrBalanced = Math.abs(d - c) < 0.01;
                return (
                  <div key={e.numeroPiece} className="rounded-lg border overflow-hidden">
                    {/* En-tête de l'écriture */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-semibold text-[#00122E]">{e.numeroPiece || "—"}</span>
                        <Badge variant="outline" className="text-[10px]">{e.codeJournal}</Badge>
                        <span className="text-muted-foreground">
                          {new Date(e.dateTransaction).toLocaleDateString("fr-FR")}
                        </span>
                        {e.numeroFacture && <span className="text-muted-foreground">· Fact. {e.numeroFacture}</span>}
                        {e.libelle && <span className="text-muted-foreground">· {e.libelle}</span>}
                        {!ecrBalanced && (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <AlertTriangle className="w-3 h-3" /> Δ {(d - c).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(e)} disabled={!!formOpen} className="h-7 gap-1 text-xs">
                          <Pencil className="w-3.5 h-3.5" /> Modifier
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteEcriture(e)}
                          disabled={!!formOpen}
                          className="h-7 gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          title="Supprimer toute l'écriture"
                        >
                          <X className="w-3.5 h-3.5" /> Supprimer
                        </Button>
                      </div>
                    </div>
                    {/* Lignes de l'écriture */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[11px] text-muted-foreground text-left border-b">
                            <th className="p-2">Compte</th>
                            <th className="p-2">Tiers</th>
                            <th className="p-2">Type</th>
                            <th className="p-2">Rubrique</th>
                            <th className="p-2 text-right">Débit</th>
                            <th className="p-2 text-right">Crédit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.lines.map((m) => (
                            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="p-2">
                                <span className="font-medium">{m.compte}</span>
                                <span className="text-muted-foreground"> {m.intituleCompte}</span>
                              </td>
                              <td className="p-2 text-muted-foreground">{m.nTiers ? `${m.nTiers} ${m.intituleTiers}` : "—"}</td>
                              <td className="p-2 text-muted-foreground">{m.typeTiers || "—"}</td>
                              <td className="p-2 text-muted-foreground">{m.rubrique || "—"}</td>
                              <td className="p-2 text-right tabular-nums text-blue-700">{fmt(m.debit)}</td>
                              <td className="p-2 text-right tabular-nums text-green-700">{fmt(m.credit)}</td>
                            </tr>
                          ))}
                          <tr className="font-semibold bg-muted/20">
                            <td className="p-2" colSpan={4}>Total écriture</td>
                            <td className="p-2 text-right tabular-nums">{fmt(d)}</td>
                            <td className="p-2 text-right tabular-nums">{fmt(c)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
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

      {/* ===================== Pop-up de suppression ===================== */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Supprimer des écritures</DialogTitle>
            <DialogDescription>
              Sélectionnez les écritures saisies à supprimer pour cette période. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>

          {ecritures.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucune écriture à supprimer.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleAllModal} />
                Tout sélectionner
                <span className="text-muted-foreground">
                  ({selectedPieces.size}/{ecritures.length})
                </span>
              </label>

              <div className="border rounded-lg divide-y max-h-[45vh] overflow-y-auto">
                {pagedEcritures.map((e) => {
                  const checked = selectedPieces.has(e.numeroPiece);
                  const d = e.lines.reduce((s, l) => s + l.debit, 0);
                  return (
                    <label
                      key={e.numeroPiece}
                      className="flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/30 text-xs"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => togglePiece(e.numeroPiece)} />
                      <span className="font-semibold text-[#00122E] w-32 truncate">{e.numeroPiece || "—"}</span>
                      <Badge variant="outline" className="text-[10px]">{e.codeJournal}</Badge>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {new Date(e.dateTransaction).toLocaleDateString("fr-FR")}
                      </span>
                      <span className="text-muted-foreground truncate flex-1">{e.libelle}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{e.lines.length} l.</span>
                      <span className="tabular-nums whitespace-nowrap">{fmt(d)}</span>
                    </label>
                  );
                })}
              </div>

              {modalTotalPages > 1 && (
                <div className="flex items-center justify-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setModalPage((p) => Math.max(1, p - 1))} disabled={modalPage <= 1} className="h-8 w-8 p-0">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {pageWindow(modalPage, modalTotalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`m${i}`} className="px-2 text-muted-foreground select-none">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === modalPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setModalPage(p)}
                        className={cn("h-8 min-w-8 px-2 tabular-nums", p === modalPage && "bg-[#0077C3] hover:bg-[#005992] text-white")}
                      >
                        {p}
                      </Button>
                    ),
                  )}
                  <Button variant="outline" size="sm" onClick={() => setModalPage((p) => Math.min(modalTotalPages, p + 1))} disabled={modalPage >= modalTotalPages} className="h-8 w-8 p-0">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
              Annuler
            </Button>
            <Button
              onClick={confirmDeleteSelected}
              disabled={selectedPieces.size === 0 || deletingSel}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingSel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Tout supprimer ({selectedPieces.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
