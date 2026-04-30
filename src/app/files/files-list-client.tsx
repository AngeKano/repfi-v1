"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  Download,
  Trash2,
  RefreshCw,
  Users,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  getRoleLabel,
  getRoleBadgeVariant,
} from "@/lib/permissions/role-utils";
import { UploadFileDialog } from "@/app/clients/[id]/upload-file-dialog";

interface FilesListClientProps {
  files: any[];
  session: any;
  availableClients?: { id: string; name: string; email?: string }[];
}

export default function FilesListClient({
  files,
  session,
  availableClients = [],
}: FilesListClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"loaded" | "pending">("loaded");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [clientFilter, setClientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [uploaderFilter, setUploaderFilter] = useState("all");

  const roleLabel = getRoleLabel(session.user.role);
  const roleBadgeVariant = getRoleBadgeVariant(session.user.role);

  // Extract unique clients and uploaders for filters
  const uniqueClients = Array.from(
    new Set(files.map((f) => f.client.name)),
  ).sort();
  const uniqueUploaders = Array.from(
    new Set(
      files.map((f) =>
        f.uploadedBy.firstName
          ? `${f.uploadedBy.firstName} ${f.uploadedBy.lastName || ""}`
          : f.uploadedBy.email,
      ),
    ),
  ).sort();

  const filteredFiles = files.filter((file) => {
    if (clientFilter !== "all" && file.client.name !== clientFilter) return false;
    if (uploaderFilter !== "all") {
      const uploaderName = file.uploadedBy.firstName
        ? `${file.uploadedBy.firstName} ${file.uploadedBy.lastName || ""}`
        : file.uploadedBy.email;
      if (uploaderName !== uploaderFilter) return false;
    }
    return true;
  });

  const handleDownload = (fileId: string) => {
    window.location.href = `/api/files/download/normal/${fileId}`;
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredFiles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredFiles.map((f) => f.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="rounded-full bg-[#EBF5FF] text-[#335890] border-[#D0E3F5] hover:bg-[#D0E3F5]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraichir
          </Button>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-[#335890]">Utilisateur</p>
              <p className="text-sm font-semibold text-[#00122E]">
                {session.user.firstName && session.user.lastName
                  ? `${session.user.firstName} ${session.user.lastName}`
                  : session.user.name || session.user.email}
              </p>
              <Badge variant={roleBadgeVariant as any} className="text-xs mt-0.5">
                {roleLabel}
              </Badge>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center overflow-hidden">
              <Users className="w-5 h-5 text-[#0077C3]" />
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-[#00122E]">Fichiers</h1>

          <div className="flex items-center gap-3">
            {/* <Button variant="outline" className="h-10 gap-2 border-[#0077C3] text-[#0077C3]">
              <Download className="w-4 h-4" />
              Exporter
            </Button> */}
            <Button
              onClick={() => setShowUploadDialog(true)}
              className="h-10 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Créer un reporting
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mb-6 border-b border-[#D0E3F5]">
          <button
            onClick={() => setActiveTab("loaded")}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === "loaded"
                ? "text-[#0077C3]"
                : "text-[#335890] hover:text-[#0077C3]"
            }`}
          >
            Fichiers chargés ({files.length})
            {activeTab === "loaded" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === "pending"
                ? "text-[#0077C3]"
                : "text-[#335890] hover:text-[#0077C3]"
            }`}
          >
            En cours de chargements (0)
            {activeTab === "pending" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0077C3]" />
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-11 bg-white border-[#D0E3F5]">
              <span className="text-xs text-[#335890] mr-1">Type fichiers :</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="mae">MAE</SelectItem>
            </SelectContent>
          </Select>

          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-11 bg-white border-[#D0E3F5]">
              <span className="text-xs text-[#335890] mr-1">Client :</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {uniqueClients.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-11 bg-white border-[#D0E3F5]">
              <span className="text-xs text-[#335890] mr-1">Date chargement :</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="today">Aujourd&apos;hui</SelectItem>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="month">Ce mois</SelectItem>
            </SelectContent>
          </Select>

          <Select value={uploaderFilter} onValueChange={setUploaderFilter}>
            <SelectTrigger className="h-11 bg-white border-[#D0E3F5]">
              <span className="text-xs text-[#335890] mr-1">Chargé par :</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {uniqueUploaders.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Files Table */}
        {filteredFiles.length === 0 ? (
          <div className="text-center py-16 border border-[#D0E3F5] rounded-xl bg-white">
            <FileText className="w-16 h-16 text-[#D0E3F5] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#00122E] mb-2">
              Aucun fichier trouvé
            </h3>
            <p className="text-[#335890]">
              Aucun fichier ne correspond aux filtres sélectionnés
            </p>
          </div>
        ) : (
          <div className="border border-[#D0E3F5] rounded-xl overflow-hidden bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredFiles.length && filteredFiles.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-[#D0E3F5] text-[#0077C3] focus:ring-[#0077C3]"
                      aria-label="Sélectionner tous les fichiers"
                      title="Sélectionner tous les fichiers"
                    />
              
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Nom du fichier
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Période
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Nom du client
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Date chargement
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Chargé par
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file, idx) => (
                  <tr
                    key={file.id}
                    className={`border-b border-[#D0E3F5] last:border-b-0 hover:bg-[#F5F9FF] transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"
                    }`}
                  >
                    <td className="w-12 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(file.id)}
                        onChange={() => toggleSelect(file.id)}
                        className="w-4 h-4 rounded border-[#D0E3F5] text-[#0077C3] focus:ring-[#0077C3]"
                        aria-label={`Sélectionner le fichier ${file.fileName}`}
                        title={`Sélectionner le fichier ${file.fileName}`}
                      />
                
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-[#00122E]">
                        {file.fileName}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      -
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-semibold text-[#0077C3] shrink-0">
                          {file.client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#00122E]">
                            {file.client.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      {new Date(file.uploadedAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                      {", "}
                      {new Date(file.uploadedAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#335890]">
                      {file.uploadedBy.firstName
                        ? `${file.uploadedBy.firstName} ${(file.uploadedBy.lastName || "").substring(0, 3)}`
                        : file.uploadedBy.email}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                          title="Télécharger"
                          onClick={() => handleDownload(file.id)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#335890]">
            <span>5</span>
            <span>Lignes par page</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-[#335890]">Page</span>
            <button className="w-8 h-8 rounded text-sm font-medium bg-[#0077C3] text-white">
              1
            </button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled
              className="text-[#335890]"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="text-[#335890]"
            >
              Suivant
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>

        <UploadFileDialog
          open={showUploadDialog}
          onClose={() => setShowUploadDialog(false)}
          clients={availableClients}
          defaultClientId={availableClients[0]?.id}
        />
      </div>
    </DashboardLayout>
  );
}
