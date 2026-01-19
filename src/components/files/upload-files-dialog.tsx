// components/files/upload-files-dialog.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, X, FileSpreadsheet, AlertCircle } from "lucide-react";
import { isValidFile } from "@/utils/validate-files";
import { FileType } from "../../../prisma/generated/prisma/enums";

interface UploadFile {
  file: File;
  id: string;
  error?: string;
}

interface UploadFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSuccess?: () => void;
}

export default function UploadFilesDialog({
  open,
  onOpenChange,
  clientId,
  onSuccess,
}: UploadFilesDialogProps) {
  const router = useRouter();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const today = new Date().toISOString().split("T")[0];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  const MAX_FILES = 10;

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles);
    const validFiles: UploadFile[] = [];

    fileArray.forEach((file) => {
      if (files.length + validFiles.length >= MAX_FILES) {
        return;
      }

      if (!isValidFile(file)) {
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        validFiles.push({
          file,
          id: Math.random().toString(36),
          error: "Fichier trop volumineux (max 2MB)",
        });
        return;
      }

      validFiles.push({
        file,
        id: Math.random().toString(36),
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

  const updateFileType = (id: string, fileType: FileType) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, fileType } : f)));
  };

  const handleSubmit = async () => {
    setError("");

    const invalidFiles = files.filter((f) => f.error);
    if (invalidFiles.length > 0) {
      setError("Tous les fichiers doivent avoir un type valide");
      return;
    }

    setLoading(true);

    const date = new Date(today);
    const fileYear = date.getFullYear();
    const fileMonth = date.getMonth() + 1;
    const fileDay = date.getDate();

    try {
      for (const uploadFile of files) {
        const formData = new FormData();
        formData.append("file", uploadFile.file);
        formData.append("clientId", clientId);
        formData.append("fileYear", fileYear.toString());
        formData.append("fileMonth", fileMonth.toString());
        formData.append("fileDay", fileDay.toString());

        const response = await fetch("/api/files/normal/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          console.error(`Erreur upload ${uploadFile.file.name}`);
        }
      }

      onOpenChange(false);
      setFiles([]);
      router.refresh();
      onSuccess?.();
    } catch (err) {
      setError("Erreur lors de l'upload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto min-w-5xl">
        <DialogHeader>
          <DialogTitle>Uploader des fichiers</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed flex-col justify-center items-center rounded-lg p-8 text-center transition-colors ${
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
              Glissez-déposez vos fichiers Excel ici
            </p>
            <p className="text-sm text-gray-500 mb-4">
              ou cliquez pour sélectionner (max 10 fichiers, 2MB chacun)
            </p>
            <Input
              type="file"
              multiple
              accept=".png,.jpeg,.jpg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mae,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/png,image/jpeg,image/jpg,image/webp"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              id="file-input"
            />
            <div className="flex justify-center">
              <Label htmlFor="file-input">
                <Button variant="outline" type="button" asChild>
                  <span>Sélectionner des fichiers</span>
                </Button>
              </Label>
            </div>
          </div>

          {/* Files List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <Label>Fichiers sélectionnés ({files.length}/10)</Label>
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-white"
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadFile.id)}
                    className="flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setFiles([]);
            }}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              files.length === 0 ||
              files.filter((f) => f.error).length > 0
            }
          >
            {loading
              ? "Upload en cours..."
              : `Uploader ${files.length} fichier(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
