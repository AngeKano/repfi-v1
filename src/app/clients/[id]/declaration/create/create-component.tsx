"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Upload,
  FileCheck,
  AlertCircle,
  Play,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================
// FORMAT 4 FICHIERS (v3.0)
// - GRAND_LIVRE: Fichier unifié (comptes + tiers + factures)
// - PLAN_COMPTES: Plan comptable
// - PLAN_TIERS: Plan des tiers
// - CODE_JOURNAL: Codes journaux
// ============================================================
const REQUIRED_FILE_TYPES = [
  { type: "GRAND_LIVRE", label: "Grand Livre Comptable" },
  { type: "PLAN_COMPTES", label: "Plan Comptable" },
  { type: "PLAN_TIERS", label: "Plan des Tiers" },
  { type: "CODE_JOURNAL", label: "Code Journal" },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 4; // Changé de 5 à 4

function FileTypeSelect({
  value,
  onChange,
  excludeTypes = [],
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  excludeTypes?: string[];
}) {
  const filteredTypes = REQUIRED_FILE_TYPES.filter(
    (t) => !excludeTypes.includes(t.type)
  );

  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Choisir le type" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Types de fichiers</SelectLabel>
          {filteredTypes.map((option) => (
            <SelectItem key={option.type} value={option.type}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

interface UploadFile {
  file: File;
  id: string;
  fileType?: string;
  error?: string;
}

interface Period {
  periodStart: string;
  periodEnd: string;
}

export default function DeclarationComptable({
  session,
  client,
}: {
  session: any;
  client: any;
}) {
  const router = useRouter();

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [filesCount, setFilesCount] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Périodes existantes (récupérées depuis l'API)
  const [existingPeriods, setExistingPeriods] = useState<Period[]>([]);

  // Période sélectionnée
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Année sélectionnée
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    new Date(selectedYear, 0)
  );

  // Fetch des périodes existantes
  useEffect(() => {
    if (!client?.id) return;

    const fetchPeriods = async () => {
      try {
        const res = await fetch(
          `/api/files/comptable/periods?clientId=${client.id}`
        );
        const data = await res.json();

        if (Array.isArray(data.periods) && data.periods.length > 0) {
          const formattedPeriods: Period[] = data.periods.map((p: any) => ({
            periodStart: p.periodStart?.slice(0, 10) || "",
            periodEnd: p.periodEnd?.slice(0, 10) || "",
          }));
          setExistingPeriods(formattedPeriods);
        }
      } catch (e) {
        console.error("Erreur fetch periods:", e);
      }
    };

    fetchPeriods();
  }, [client?.id]);

  useEffect(() => {
    setFilesCount(files.length);
  }, [files]);

  // Générer les dates désactivées (périodes existantes)
  const getDisabledDates = (): Date[] => {
    const disabledDates: Date[] = [];

    existingPeriods.forEach((period) => {
      if (period.periodStart && period.periodEnd) {
        const start = new Date(period.periodStart);
        const end = new Date(period.periodEnd);

        const current = new Date(start);
        while (current <= end) {
          disabledDates.push(new Date(current));
          current.setDate(current.getDate() + 1);
        }
      }
    });

    return disabledDates;
  };

  // Vérifier si une date est dans l'année sélectionnée
  const isDateInSelectedYear = (date: Date): boolean => {
    return date.getFullYear() === selectedYear;
  };

  // Handler pour la sélection de période
  const handleDateSelect = (range: DateRange | undefined): void => {
    if (!range) {
      setDateRange(undefined);
      return;
    }

    if (range.from && range.to) {
      if (range.from.getFullYear() !== range.to.getFullYear()) {
        toast.error("La période doit être dans la même année");
        setDateRange(undefined);
        return;
      }
    }

    setDateRange(range);
  };

  // Handler pour sélectionner toute l'année
  const handleFullYearClick = () => {
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31);

    const hasOverlap = existingPeriods.some((period) => {
      const pStart = new Date(period.periodStart);
      const pEnd = new Date(period.periodEnd);
      return pStart <= yearEnd && pEnd >= yearStart;
    });

    if (hasOverlap) {
      toast.error("Cette année contient des périodes déjà déclarées");
      return;
    }

    setDateRange({ from: yearStart, to: yearEnd });
  };

  // Reset la sélection
  const handleResetSelection = () => {
    setDateRange(undefined);
  };

  // Périodes formatées pour l'affichage
  const periodStart = dateRange?.from
    ? dateRange.from.toISOString().slice(0, 10)
    : "";
  const periodEnd = dateRange?.to
    ? dateRange.to.toISOString().slice(0, 10)
    : "";

  const isValidExcel = (file: File) => {
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    return (
      validTypes.includes(file.type) ||
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls")
    );
  };

  // Détection du type de fichier basée sur le nom
  const detectFileType = (fileName: string): string | undefined => {
    const normalizedName = fileName
      .toLowerCase()
      .replace(/[0-9_\-\.]/g, " ")
      .trim();

    // Mots-clés pour la détection (format v3.0)
    const keywords: Record<string, string[]> = {
      GRAND_LIVRE: [
        "grand", "livre", "comptable", "grandlivre", 
        "gl", "glcompte", "gltiers"  // Inclut les anciens noms pour compatibilité
      ],
      PLAN_COMPTES: ["plan", "compte", "plancompte", "plancomptable"],
      PLAN_TIERS: ["plan", "tiers", "plantiers"],
      CODE_JOURNAL: ["code", "journal", "codejournal", "journaux"],
    };

    const matchesType = (words: string[]): number => {
      let score = 0;
      words.forEach((word) => {
        if (normalizedName.includes(word)) score += word.length;
      });
      return score;
    };

    const scores = Object.entries(keywords).map(([type, words]) => ({
      type,
      score: matchesType(words),
    }));

    const bestMatch = scores.reduce((prev, current) =>
      current.score > prev.score ? current : prev
    );

    return bestMatch.score > 0 ? bestMatch.type : undefined;
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles);
    const currentCount = files.length;
    const availableSlots = MAX_FILES - currentCount;

    if (availableSlots <= 0) {
      toast.error(`Vous ne pouvez pas ajouter plus de ${MAX_FILES} fichiers.`);
      return;
    }

    const validFiles: UploadFile[] = [];
    let added = 0;

    for (let i = 0; i < fileArray.length && added < availableSlots; i++) {
      const file = fileArray[i];

      if (!isValidExcel(file)) {
        toast.error(`${file.name} n'est pas un fichier Excel valide`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        validFiles.push({
          file,
          id: Math.random().toString(36),
          error: "Fichier trop volumineux (max 10MB)",
        });
        added++;
        continue;
      }

      const detectedType = detectFileType(file.name);
      validFiles.push({
        file,
        id: Math.random().toString(36),
        fileType: detectedType,
      });
      added++;
    }

    setFiles((prev) => [...prev, ...validFiles].slice(0, MAX_FILES));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (filesCount >= MAX_FILES) {
      toast.error(`Vous ne pouvez pas ajouter plus de ${MAX_FILES} fichiers.`);
      return;
    }
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFileType = (id: string, fileType: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, fileType } : f)));
  };

  const allFilesValid = () => {
    if (filesCount !== MAX_FILES) return false;

    const types = files.map((f) => f.fileType);
    const requiredTypes = REQUIRED_FILE_TYPES.map((t) => t.type);

    return (
      requiredTypes.every((type) => types.includes(type)) &&
      files.every((f) => f.fileType && !f.error)
    );
  };

  const handleUpload = async () => {
    if (!periodStart || !periodEnd) {
      toast.error("Veuillez sélectionner les dates de période");
      return;
    }

    if (!allFilesValid()) {
      toast.error(
        `Veuillez sélectionner les ${MAX_FILES} fichiers obligatoires avec des types valides`
      );
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("clientId", client.id);
      formData.append("periodStart", periodStart);
      formData.append("periodEnd", periodEnd);

      files.forEach((uploadFile) => {
        if (uploadFile.fileType) {
          formData.append(uploadFile.fileType, uploadFile.file);
        }
      });

      const response = await fetch("/api/files/comptable/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'upload");
      }
      setUploadResult(data);
      toast.success(
        `Fichiers uploadés - Période: ${new Date(
          data.period.start
        ).toLocaleDateString("fr-FR")} au ${new Date(
          data.period.end
        ).toLocaleDateString("fr-FR")}`
      );
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTriggerETL = async () => {
    if (!uploadResult?.batchId) return;

    setProcessing(true);

    try {
      const response = await fetch("/api/files/comptable/trigger-etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: uploadResult.batchId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors du déclenchement");
      }

      toast.success("Traitement ETL lancé avec succès");
      router.push(
        `/clients/${client.id}/declaration/status/${uploadResult.batchId}`
      );
    } catch (error: any) {
      toast.error(error.message);
      setProcessing(false);
    }
  };

  const getAlreadySelectedTypes = (excludeId?: string) =>
    files
      .filter((f) => f.fileType && (!excludeId || f.id !== excludeId))
      .map((f) => f.fileType!);

  const hasMaxFiles = filesCount >= MAX_FILES;
  const disabledDates = getDisabledDates();

  return (
    <main className="max-w-7xl flex items-start flex-row gap-x-3 mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <Label className="block text-sm font-medium mb-2">
          Période de la déclaration
        </Label>

        <div className="flex items-center gap-2 mb-4">
          <Select
            value={selectedYear.toString()}
            onValueChange={(value) => {
              const year = Number(value);
              setSelectedYear(year);
              setDateRange(undefined);
              setCalendarMonth(new Date(year, 0));
            }}
          >
            <SelectTrigger className="w-[120px]" aria-label="Année">
              <SelectValue placeholder="Année" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Année</SelectLabel>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button type="button" variant="outline" onClick={handleFullYearClick}>
            Toute l&apos;année {selectedYear}
          </Button>

          {dateRange && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleResetSelection}
              className="text-xs"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={dateRange}
          onSelect={handleDateSelect}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          className="rounded-lg border shadow-sm"
          disabled={(date) => {
            if (!isDateInSelectedYear(date)) return true;
            return disabledDates.some(
              (d) => d.toDateString() === date.toDateString()
            );
          }}
          modifiers={{
            existing: disabledDates,
          }}
          modifiersStyles={{
            existing: {
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              color: "#991b1b",
              textDecoration: "line-through",
            },
          }}
        />

        {/* Affichage des périodes existantes */}
        {existingPeriods.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-800 mb-2">
              Périodes déjà déclarées :
            </p>
            <ul className="text-sm text-red-700 space-y-1">
              {existingPeriods.map((p, idx) => (
                <li key={idx}>
                  {new Date(p.periodStart).toLocaleDateString("fr-FR")} →{" "}
                  {new Date(p.periodEnd).toLocaleDateString("fr-FR")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Période sélectionnée */}
        {dateRange?.from && dateRange?.to && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800">
              Période sélectionnée :
            </p>
            <p className="text-sm text-green-700">
              {dateRange.from.toLocaleDateString("fr-FR")} →{" "}
              {dateRange.to.toLocaleDateString("fr-FR")}
            </p>
          </div>
        )}
      </div>

      <Card className="p-6 w-full">
        {/* Info Format v3.0 */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-800">
            📋 Format v3.0 - 4 fichiers requis
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Le Grand Livre Comptable unifié remplace les anciens fichiers GL Comptes et GL Tiers
          </p>
        </div>

        {/* Drag & Drop Zone */}
        <div
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : hasMaxFiles
              ? "border-gray-200 bg-gray-100 opacity-60 pointer-events-none"
              : "border-gray-300 hover:border-gray-400"
          }`}
          onDragEnter={hasMaxFiles ? undefined : handleDrag}
          onDragLeave={hasMaxFiles ? undefined : handleDrag}
          onDragOver={hasMaxFiles ? undefined : handleDrag}
          onDrop={hasMaxFiles ? undefined : handleDrop}
          style={hasMaxFiles ? { pointerEvents: "none" } : {}}
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">
            Glissez-déposez vos {MAX_FILES} fichiers Excel ici
          </p>
          <p className="text-sm text-gray-500 mb-4">
            ou cliquez pour sélectionner (max 10MB chacun)
          </p>
          <Input
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="file-input"
            disabled={hasMaxFiles}
          />
          <Label htmlFor="file-input">
            <Button
              variant="outline"
              type="button"
              asChild
              disabled={hasMaxFiles}
              aria-disabled={hasMaxFiles}
              tabIndex={hasMaxFiles ? -1 : undefined}
            >
              <span>
                {hasMaxFiles
                  ? `Maximum ${MAX_FILES} fichiers atteints`
                  : "Sélectionner des fichiers"}
              </span>
            </Button>
          </Label>
          {hasMaxFiles && (
            <div className="mt-2 text-sm text-gray-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              Vous avez atteint la limite de {MAX_FILES} fichiers.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {!uploadResult ? (
            <Button
              onClick={handleUpload}
              disabled={
                !allFilesValid() || uploading || !periodStart || !periodEnd
              }
              size="lg"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Upload en cours..." : "Uploader les fichiers"}
            </Button>
          ) : (
            <Button onClick={handleTriggerETL} disabled={processing} size="lg">
              <Play className="w-4 h-4 mr-2" />
              {processing ? "Démarrage..." : "Lancer le traitement ETL"}
            </Button>
          )}
        </div>

        {/* Upload Result */}
        {uploadResult && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-semibold text-green-900 mb-2">
              Fichiers uploadés avec succès
            </h3>
            <div className="text-sm text-green-800">
              <p>
                <strong>Période:</strong>{" "}
                {new Date(uploadResult.period.start).toLocaleDateString(
                  "fr-FR"
                )}{" "}
                au{" "}
                {new Date(uploadResult.period.end).toLocaleDateString("fr-FR")}
              </p>
              <p>
                <strong>Batch ID:</strong> {uploadResult.batchId}
              </p>
              <p>
                <strong>Format:</strong> {uploadResult.fileFormat?.version || "v3.0"}
              </p>
            </div>
          </div>
        )}

        {/* Files List */}
        {filesCount > 0 && (
          <div className="space-y-3 mb-6">
            <Label>Fichiers sélectionnés ({filesCount}/{MAX_FILES} requis)</Label>
            {files.map((uploadFile) => (
              <div
                key={uploadFile.id}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{uploadFile.file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(uploadFile.file.size / 1024).toFixed(2)} KB
                  </p>
                  {uploadFile.error && (
                    <p className="text-sm text-red-500">{uploadFile.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {uploadFile.fileType ? (
                    <Badge variant="default">
                      <FileCheck className="w-3 h-3 mr-1" />
                      {REQUIRED_FILE_TYPES.find(
                        (t) => t.type === uploadFile.fileType
                      )?.label || uploadFile.fileType}
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Type non détecté
                      </Badge>
                      <FileTypeSelect
                        value={undefined}
                        excludeTypes={getAlreadySelectedTypes(uploadFile.id)}
                        onChange={(type) => {
                          updateFileType(uploadFile.id, type);
                        }}
                      />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadFile.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Types manquants */}
        {filesCount > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium mb-2">
              Types de fichiers requis:
            </p>
            <div className="flex flex-wrap gap-2">
              {REQUIRED_FILE_TYPES.map(({ type, label }) => {
                const hasType = files.some((f) => f.fileType === type);
                return (
                  <Badge key={type} variant={hasType ? "default" : "outline"}>
                    {hasType ? (
                      <FileCheck className="w-3 h-3 mr-1" />
                    ) : (
                      <AlertCircle className="w-3 h-3 mr-1" />
                    )}
                    {label}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
