"use client";

import { use, useState } from "react";
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
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface UploadFile {
  file: File;
  id: string;
  fileType?: string;
  error?: string;
}

const REQUIRED_FILE_TYPES = [
  { type: "GRAND_LIVRE_COMPTES", label: "Grand Livre des Comptes" },
  { type: "GRAND_LIVRE_TIERS", label: "Grand Livre des Tiers" },
  { type: "PLAN_COMPTES", label: "Plan Comptable" },
  { type: "PLAN_TIERS", label: "Plan des Tiers" },
  { type: "CODE_JOURNAL", label: "Code Journal" },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

export default function DeclarationComptable({
  session,
  client,
}: {
  session: any;
  client: any;
}) {
  const router = useRouter();

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");

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

  const detectFileType = (fileName: string): string | undefined => {
    const normalizedName = fileName
      .toLowerCase()
      .replace(/[0-9_\-\.]/g, " ")
      .trim();

    const keywords = {
      GRAND_LIVRE_COMPTES: ["grand", "livre", "compte", "glcompte"],
      GRAND_LIVRE_TIERS: ["grand", "livre", "tiers", "gltiers"],
      PLAN_COMPTES: ["plan", "compte", "plancompte"],
      PLAN_TIERS: ["plan", "tiers", "plantiers"],
      CODE_JOURNAL: ["code", "journal", "codejournal"],
    };

    const matchesType = (words: string[]): number => {
      let score = 0;
      words.forEach((word) => {
        if (normalizedName.includes(word)) score += word.length;
      });
      return score;
    };

    const scores = [
      {
        type: "GRAND_LIVRE_COMPTES",
        score: matchesType(keywords.GRAND_LIVRE_COMPTES),
      },
      {
        type: "GRAND_LIVRE_TIERS",
        score: matchesType(keywords.GRAND_LIVRE_TIERS),
      },
      { type: "PLAN_COMPTES", score: matchesType(keywords.PLAN_COMPTES) },
      { type: "PLAN_TIERS", score: matchesType(keywords.PLAN_TIERS) },
      { type: "CODE_JOURNAL", score: matchesType(keywords.CODE_JOURNAL) },
    ];

    const bestMatch = scores.reduce((prev, current) =>
      current.score > prev.score ? current : prev
    );

    return bestMatch.score > 0 ? bestMatch.type : undefined;
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles);
    const validFiles: UploadFile[] = [];

    fileArray.forEach((file) => {
      if (files.length + validFiles.length >= MAX_FILES) return;

      if (!isValidExcel(file)) {
        toast.error(`${file.name} n'est pas un fichier Excel valide`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        validFiles.push({
          file,
          id: Math.random().toString(36),
          error: "Fichier trop volumineux (max 10MB)",
        });
        return;
      }

      const detectedType = detectFileType(file.name);
      validFiles.push({
        file,
        id: Math.random().toString(36),
        fileType: detectedType,
      });
    });

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
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFileType = (id: string, fileType: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, fileType } : f)));
  };

  const allFilesValid = () => {
    if (files.length !== 5) return false;

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
        "Veuillez sélectionner les 5 fichiers obligatoires avec des types valides"
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href={`/clients/${client.id}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Ajouter des documents
                </h1>
                <p className="text-sm text-gray-500">{client.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <Label className="block text-sm font-medium mb-2">
              Date de début de période
            </Label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
          </div>
          <div>
            <Label className="block text-sm font-medium mb-2">
              Date de fin de période
            </Label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </div>
        </div>

        <Card className="p-6">
          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">
              Glissez-déposez vos 5 fichiers Excel ici
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
            />
            <Label htmlFor="file-input">
              <Button variant="outline" type="button" asChild>
                <span>Sélectionner des fichiers</span>
              </Button>
            </Label>
          </div>

          {/* Files List */}
          {files.length > 0 && (
            <div className="space-y-3 mb-6">
              <Label>Fichiers sélectionnés ({files.length}/5 requis)</Label>
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {uploadFile.file.name}
                    </p>
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
                      <Badge variant="secondary">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Type non détecté
                      </Badge>
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
          {files.length > 0 && (
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
                  {new Date(uploadResult.period.end).toLocaleDateString(
                    "fr-FR"
                  )}
                </p>
                <p>
                  <strong>Batch ID:</strong> {uploadResult.batchId}
                </p>
              </div>
            </div>
          )}

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
              <Button
                onClick={handleTriggerETL}
                disabled={processing}
                size="lg"
              >
                <Play className="w-4 h-4 mr-2" />
                {processing ? "Démarrage..." : "Lancer le traitement ETL"}
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
