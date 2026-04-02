"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Download,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  MoreHorizontal,
  Filter,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface FilesListClientProps {
  files: any[];
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("sheet") || mimeType.includes("excel"))
    return FileSpreadsheet;
  return File;
}

function getFileTypeLabel(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.includes("word") || mimeType.includes("document")) return "Word";
  return "Fichier";
}

function getFileTypeColor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "bg-[#FEF3C7] text-[#D97706]";
  if (mimeType.includes("pdf")) return "bg-[#FEE2E2] text-[#DC2626]";
  if (mimeType.includes("sheet") || mimeType.includes("excel"))
    return "bg-[#DCFCE7] text-[#16A34A]";
  if (mimeType.includes("word") || mimeType.includes("document"))
    return "bg-[#DBEAFE] text-[#2563EB]";
  return "bg-[#F3E8FF] text-[#9333EA]";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesListClient({ files }: FilesListClientProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "recent">("all");

  const filteredFiles = files.filter((file) =>
    search
      ? file.fileName.toLowerCase().includes(search.toLowerCase()) ||
        file.client.name.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  const handleDownload = (fileId: string) => {
    window.location.href = `/api/files/download/normal/${fileId}`;
  };

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#00122E]">Fichiers</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mb-6 border-b border-[#D0E3F5]">
          <button
            onClick={() => setActiveTab("all")}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === "all"
                ? "text-[#0077C3]"
                : "text-[#335890] hover:text-[#0077C3]"
            }`}
          >
            Fichiers locaux
            {activeTab === "all" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("recent")}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === "recent"
                ? "text-[#0077C3]"
                : "text-[#335890] hover:text-[#0077C3]"
            }`}
          >
            En cours de changement
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0 min-w-[20px] text-center"
            >
              {0}
            </Badge>
            {activeTab === "recent" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
            )}
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
            <Input
              placeholder="Rechercher un fichier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 bg-[#F8FAFC] border-[#E2E8F0]"
            />
          </div>
          <Button variant="outline" className="h-11 gap-2">
            <Filter className="w-4 h-4" />
            Filtrer par client
          </Button>
        </div>

        {/* Files Table */}
        {filteredFiles.length === 0 ? (
          <div className="text-center py-16 border border-[#D0E3F5] rounded-xl bg-white">
            <FileText className="w-16 h-16 text-[#D0E3F5] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#00122E] mb-2">
              Aucun fichier trouvé
            </h3>
            <p className="text-[#335890]">
              {search
                ? "Essayez de modifier vos critères de recherche"
                : "Aucun fichier n'a encore été uploadé"}
            </p>
          </div>
        ) : (
          <div className="border border-[#D0E3F5] rounded-xl overflow-hidden bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Type de fichier
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Nom
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Déposé par
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Taille
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Client
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file, idx) => {
                  const IconComponent = getFileIcon(file.mimeType);
                  const typeLabel = getFileTypeLabel(file.mimeType);
                  const typeColor = getFileTypeColor(file.mimeType);

                  return (
                    <tr
                      key={file.id}
                      className={`border-b border-[#D0E3F5] last:border-b-0 hover:bg-[#F5F9FF] transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${typeColor}`}
                          >
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-medium text-[#335890]">
                            {typeLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-[#00122E] truncate max-w-[200px]">
                          {file.fileName}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#EBF5FF] flex items-center justify-center text-xs font-semibold text-[#0077C3]">
                            {file.uploadedBy.firstName
                              ? file.uploadedBy.firstName.charAt(0).toUpperCase()
                              : file.uploadedBy.email.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-[#335890]">
                            {file.uploadedBy.firstName
                              ? `${file.uploadedBy.firstName} ${file.uploadedBy.lastName || ""}`
                              : file.uploadedBy.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#335890]">
                        {new Date(file.uploadedAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-5 py-4 text-sm text-[#335890]">
                        {formatFileSize(file.fileSize)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className="text-xs">
                          {file.client.name}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                            onClick={() => handleDownload(file.id)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[#335890] hover:text-[#00122E] hover:bg-[#F5F9FF] h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
