"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { fr } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  XCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

interface ClientOption {
  id: string;
  name?: string;
  email?: string;
}

interface UploadFileDialogProps {
  open: boolean;
  onClose: () => void;
  client?: ClientOption;
  clients?: ClientOption[];
  defaultClientId?: string;
}

const REQUIRED_FILE_TYPES = [
  { type: "GRAND_LIVRE", label: "Grand Livre Comptable" },
  { type: "PLAN_COMPTES", label: "Plan Comptable" },
  { type: "PLAN_TIERS", label: "Plan des Tiers" },
  { type: "CODE_JOURNAL", label: "Code Journal" },
];

const MAX_FILES = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface PickedFile {
  id: string;
  file: File;
  fileType?: string;
  error?: string;
}

const isValidExcel = (file: File) => {
  const validTypes = [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  return (
    validTypes.includes(file.type) ||
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.name.toLowerCase().endsWith(".xls")
  );
};

const detectFileType = (fileName: string): string | undefined => {
  const normalized = fileName
    .toLowerCase()
    .replace(/[0-9_\-.]/g, " ")
    .trim();
  const keywords: Record<string, string[]> = {
    GRAND_LIVRE: ["grand", "livre", "grandlivre", "gl"],
    PLAN_COMPTES: [
      "plan",
      "compte",
      "plancompte",
      "plancomptable",
      "comptable",
    ],
    PLAN_TIERS: ["plan", "tiers", "plantiers"],
    CODE_JOURNAL: ["code", "journal", "codejournal", "journaux"],
  };
  const scores = Object.entries(keywords).map(([type, words]) => ({
    type,
    score: words.reduce(
      (acc, w) => (normalized.includes(w) ? acc + w.length : acc),
      0,
    ),
  }));
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  return best.score > 0 ? best.type : undefined;
};

/** Parse dd/mm/yyyy to Date or null */
function parseDateFR(str: string): Date | null {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

/** Format Date to dd/mm/yyyy */
function formatDateFR(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function UploadFileDialog({
  open,
  onClose,
  client,
  clients,
  defaultClientId,
}: UploadFileDialogProps) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const clientList: ClientOption[] = useMemo(() => {
    if (clients && clients.length > 0) return clients;
    if (client) return [client];
    return [];
  }, [clients, client]);

  const initialClientId =
    defaultClientId ?? client?.id ?? clientList[0]?.id ?? "";

  const [step, setStep] = useState<1 | 2>(1);
  const [clientId, setClientId] = useState(initialClientId);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    new Date(currentYear, 0),
  );
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const yearOptions = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  }, [currentYear]);

  const selectedClient =
    clientList.find((c) => c.id === clientId) || clientList[0];

  // Sync text inputs with dateRange
  useEffect(() => {
    setStartText(dateRange?.from ? formatDateFR(dateRange.from) : "");
    setEndText(dateRange?.to ? formatDateFR(dateRange.to) : "");
  }, [dateRange]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setClientId(initialClientId);
      setDateRange(undefined);
      setStartText("");
      setEndText("");
      setSelectedYear(currentYear);
      setCalendarMonth(new Date(currentYear, 0));
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialClientId, currentYear]);

  const handleSelectFullYear = (year: number) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    setSelectedYear(year);
    setCalendarMonth(new Date(year, 0));
    setDateRange({ from: start, to: end });
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    setCalendarMonth(new Date(year, 0));
  };

  const handleStartBlur = () => {
    const d = parseDateFR(startText);
    if (d) {
      setDateRange((prev) => ({ from: d, to: prev?.to }));
    }
  };

  const handleEndBlur = () => {
    const d = parseDateFR(endText);
    if (d) {
      setDateRange((prev) => ({ from: prev?.from, to: d }));
    }
  };

  const periodStart = dateRange?.from
    ? dateRange.from.toISOString().slice(0, 10)
    : "";
  const periodEnd = dateRange?.to
    ? dateRange.to.toISOString().slice(0, 10)
    : "";

  const canGoNext = !!clientId && !!periodStart && !!periodEnd;

  const allValid = () => {
    if (files.length !== MAX_FILES) return false;
    const types = files.map((f) => f.fileType);
    const required = REQUIRED_FILE_TYPES.map((t) => t.type);
    return (
      required.every((t) => types.includes(t)) &&
      files.every((f) => f.fileType && !f.error)
    );
  };

  const canValidate = useMemo(() => {
    return files.length > 0 && allValid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    const slots = MAX_FILES - files.length;
    if (slots <= 0) {
      toast.error(`Maximum ${MAX_FILES} fichiers.`);
      return;
    }
    const next: PickedFile[] = [];
    for (let i = 0; i < arr.length && i < slots; i++) {
      const f = arr[i];
      if (!isValidExcel(f)) {
        toast.error(`${f.name} n'est pas un fichier Excel valide`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        next.push({
          id: Math.random().toString(36),
          file: f,
          error: "Fichier trop volumineux (max 10MB)",
        });
        continue;
      }
      next.push({
        id: Math.random().toString(36),
        file: f,
        fileType: detectFileType(f.name),
      });
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== id));

  const updateFileType = (id: string, fileType: string) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, fileType } : f)));

  const formatSize = (size: number) => {
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    return `${(size / 1024).toFixed(2)} KB`;
  };

  const usedTypes = (excludeId?: string) =>
    files
      .filter((f) => f.fileType && (!excludeId || f.id !== excludeId))
      .map((f) => f.fileType!);

  const handleValidate = async () => {
    if (!canValidate) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("clientId", clientId);
      formData.append("periodStart", periodStart);
      formData.append("periodEnd", periodEnd);
      files.forEach((f) => {
        if (f.fileType) formData.append(f.fileType, f.file);
      });

      const uploadRes = await fetch("/api/files/comptable/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Erreur lors de l'upload");
      }

      const triggerRes = await fetch("/api/files/comptable/trigger-etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: uploadData.batchId }),
      });
      const triggerData = await triggerRes.json();
      if (!triggerRes.ok) {
        throw new Error(
          triggerData.error || "Erreur lors du lancement du traitement",
        );
      }

      toast.success("Traitement ETL lancé");
      onClose();
      router.push(
        `/clients/${clientId}/declaration/status/${uploadData.batchId}`,
      );
    } catch (error: any) {
      toast.error(error.message || "Erreur lors du traitement");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[820px] max-h-[calc(100vh-2rem)] border border-[#D0E3F5]"
      >
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-5">
            <div>
              <DialogTitle className="text-lg font-bold text-[#00122E]">
                Créer un reporting
              </DialogTitle>
              <DialogDescription className="text-sm text-[#335890]">
                {step === 1
                  ? "Sélectionnez le client et la période"
                  : "Ajoutez les 4 fichiers comptables requis"}
              </DialogDescription>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#94A3B8] transition-colors"
              aria-label="Fermer"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Slider */}
          <div className="relative overflow-hidden">
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(${step === 1 ? "0%" : "-100%"})`,
              }}
            >
              {/* ===== STEP 1 ===== */}
              <div className="w-full flex flex-row shrink-0 gap-5">
                {/* Part I */}
                <div className="flex-1 min-w-0 space-y-4">
                  {/* Client */}
                  <div>
                    <Label className="block text-sm font-medium text-[#335890] mb-2">
                      Client <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={clientId}
                      onValueChange={(v) => setClientId(v)}
                    >
                      <SelectTrigger className="w-full h-10 border-[#D0E3F5]">
                        <SelectValue placeholder="Sélectionner un client" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Client</SelectLabel>
                          {clientList.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Period */}
                  <div>
                    <Label className="block text-sm font-medium text-[#335890] mb-2">
                      Période <span className="text-red-500">*</span>
                    </Label>

                    {/* Editable date inputs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-[#94A3B8] uppercase">
                          Début
                        </span>
                        <Input
                          placeholder="jj/mm/aaaa"
                          value={startText}
                          onChange={(e) => setStartText(e.target.value)}
                          onBlur={handleStartBlur}
                          className="h-10 bg-[#F8FAFC] border-[#D0E3F5] font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-[#94A3B8] uppercase">
                          Fin
                        </span>
                        <Input
                          placeholder="jj/mm/aaaa"
                          value={endText}
                          onChange={(e) => setEndText(e.target.value)}
                          onBlur={handleEndBlur}
                          className="h-10 bg-[#F8FAFC] border-[#D0E3F5] font-medium"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Part II */}
                <div className="shrink-0">
                  {/* Year shortcut */}
                  <div className="flex items-center gap-2 mb-2">
                    <Select
                      value={selectedYear.toString()}
                      onValueChange={(v) => handleYearChange(Number(v))}
                    >
                      <SelectTrigger
                        className="h-8 w-[90px] text-xs border-[#D0E3F5]"
                        aria-label="Année"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={y.toString()}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectFullYear(selectedYear)}
                      className="h-8 text-xs border-[#0077C3] text-[#0077C3] hover:bg-[#EBF5FF] w-fit"
                    >
                      Toute l&apos;année {selectedYear}
                    </Button>
                  </div>
                  {/* Calendar */}
                  <Calendar
                    mode="range"
                    numberOfMonths={1}
                    locale={fr}
                    selected={dateRange}
                    onSelect={setDateRange}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    className="rounded-lg border border-[#D0E3F5] shadow-sm [--cell-size:--spacing(8)]"
                  />
                </div>
              </div>

              {/* ===== STEP 2 ===== */}
              <div className="w-full shrink-0 space-y-3">
                {/* Client + period recap */}
                <div className="flex items-center gap-3 p-3 bg-[#F5F9FF] rounded-lg border border-[#D0E3F5]">
                  <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-bold text-[#0077C3] shrink-0">
                    {selectedClient?.name
                      ? selectedClient.name.charAt(0).toUpperCase()
                      : "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#00122E] truncate">
                      {selectedClient?.name || "—"}
                    </p>
                    {selectedClient?.email && (
                      <p className="text-xs text-[#335890] truncate">
                        {selectedClient.email}
                      </p>
                    )}
                  </div>
                  {periodStart && periodEnd && (
                    <div className="text-right text-xs">
                      <div className="text-[#94A3B8]">Période</div>
                      <div className="font-semibold text-[#00122E]">
                        {new Date(periodStart).toLocaleDateString("fr-FR")} →{" "}
                        {new Date(periodEnd).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                  )}
                </div>

                {/* Files list */}
                {files.length > 0 && (
                  <div className="border border-[#D0E3F5] rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-1.5 bg-[#F5F9FF] text-[10px] font-semibold text-[#335890] uppercase">
                      <span>Nom du fichier</span>
                      <span>Taille</span>
                      <span className="w-6" />
                    </div>
                    {files.map((f) => (
                      <div
                        key={f.id}
                        className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center border-t border-[#D0E3F5] text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-[#00122E] truncate">
                            {f.file.name}
                          </p>
                          <div className="mt-1">
                            {f.fileType ? (
                              <Badge variant="default" className="text-xs">
                                <FileCheck className="w-3 h-3 mr-1" />
                                {
                                  REQUIRED_FILE_TYPES.find(
                                    (t) => t.type === f.fileType,
                                  )?.label
                                }
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Type non détecté
                                </Badge>
                                <Select
                                  value={f.fileType || ""}
                                  onValueChange={(v) => updateFileType(f.id, v)}
                                >
                                  <SelectTrigger className="h-7 text-xs w-[170px]">
                                    <SelectValue placeholder="Choisir le type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {REQUIRED_FILE_TYPES.filter(
                                      (t) => !usedTypes(f.id).includes(t.type),
                                    ).map((t) => (
                                      <SelectItem key={t.type} value={t.type}>
                                        {t.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          {f.error && (
                            <p className="text-xs text-red-500 mt-1">
                              {f.error}
                            </p>
                          )}
                        </div>
                        <span className="text-[#335890] text-xs whitespace-nowrap">
                          {formatSize(f.file.size)}
                        </span>
                        <button
                          onClick={() => removeFile(f.id)}
                          className="w-6 h-6 rounded-full hover:bg-[#F1F5F9] flex items-center justify-center text-[#94A3B8]"
                          aria-label="Retirer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                    dragActive
                      ? "border-[#0077C3] bg-[#EBF5FF]"
                      : "border-[#D0E3F5] bg-[#F8FAFC]"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="flex items-center justify-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white border border-[#D0E3F5] flex items-center justify-center shrink-0">
                      <Upload className="w-5 h-5 text-[#0077C3]" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#00122E]">
                        Glissez-déposez vos fichiers ici
                      </p>
                      <p className="text-xs text-[#335890]">
                        ou cliquez pour sélectionner (max {MAX_FILES} fichiers,
                        10MB chacun)
                      </p>
                    </div>
                    <Input
                      type="file"
                      multiple
                      accept=".xlsx,.xls"
                      onChange={(e) => handleFiles(e.target.files)}
                      className="hidden"
                      id="upload-dialog-input"
                    />
                    <Label htmlFor="upload-dialog-input">
                      <Button
                        type="button"
                        asChild
                        size="sm"
                        className="bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] whitespace-nowrap"
                      >
                        <span>Sélectionner</span>
                      </Button>
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={uploading}
            className="gap-2 text-[#335890] border-[#E2E8F0]"
          >
            <XCircle className="w-4 h-4" />
            Annuler
          </Button>
          {step === 1 ? (
            <Button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canGoNext}
              className="gap-2 flex-1 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] disabled:opacity-50"
            >
              Continuer
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={uploading}
                className="gap-2 text-[#335890] border-[#E2E8F0]"
              >
                <ChevronLeft className="w-4 h-4" />
                Retour
              </Button>
              <Button
                type="button"
                onClick={handleValidate}
                disabled={!canValidate || uploading}
                className="gap-2 flex-1 bg-[#EBF5FF] text-[#0077C3] hover:bg-[#D0E3F5] border border-[#0077C3] disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {uploading ? "Traitement..." : "Valider"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
