"use client";

import React, { useState, useEffect } from "react";
import {
  Folder,
  FolderPlus,
  ChevronRight,
  Edit,
  Trash,
  Upload,
  FileText,
  Download,
} from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import UploadFilesDialog from "@/components/files/upload-files-dialog";
import { useRouter } from "next/navigation";

// Helper function for download
const handleDownload = async (id: string, fileName: string) => {
  const res = await fetch(`/api/files/normal/download/${id}`);
  if (!res.ok) return alert("Erreur lors du téléchargement du fichier.");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

interface FilesTabsProps {
  clientId: string;
}

const FilesTabs: React.FC<FilesTabsProps> = ({ clientId }) => {
  // States
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [renameFolderDialogOpen, setRenameFolderDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<any>(null);
  const router = useRouter();

  // Fetch folders and files
  useEffect(() => {
    loadFoldersAndFiles();
  }, [currentFolderId, clientId]);

  async function loadFoldersAndFiles() {
    const parentParam = currentFolderId || "root";

    // Load folders
    const foldersRes = await fetch(
      `/api/folders?clientId=${clientId}&parentId=${parentParam}`
    );
    const foldersData = await foldersRes.json();
    setFolders(foldersData.folders || []);

    // Load files
    const filesRes = await fetch(
      `/api/files/normal?clientId=${clientId}${
        currentFolderId ? `&folderId=${currentFolderId}` : ""
      }`
    );
    const filesData = await filesRes.json();
    setFiles(filesData.files || []);
  }

  // Create folder
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFolderName,
        clientId,
        parentId: currentFolderId,
      }),
    });
    setNewFolderName("");
    setCreateFolderDialogOpen(false);
    loadFoldersAndFiles();
  }

  // Rename folder
  async function handleRenameFolder() {
    if (!editingFolder || !newFolderName.trim()) return;
    await fetch(`/api/folders/${editingFolder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName }),
    });
    setNewFolderName("");
    setRenameFolderDialogOpen(false);
    setEditingFolder(null);
    loadFoldersAndFiles();
  }

  // Delete folder
  async function handleDeleteFolder(folderId: string) {
    if (!window.confirm("Supprimer ce dossier ?")) return;
    await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
    loadFoldersAndFiles();
  }

  // Delete file
  async function handleDeleteFile(fileId: string) {
    if (!window.confirm("Supprimer ce fichier ?")) return;
    await fetch(`/api/files/normal/${fileId}`, { method: "DELETE" });
    loadFoldersAndFiles();
  }

  return (
    <>
      {/* Files Tab avec Folders */}
      <TabsContent value="files">
        <Card className="p-6">
          {/* Header avec breadcrumb et actions */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Fichiers</h2>
              {currentFolderId && (
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <ChevronRight className="w-4 h-4" />
                  <button
                    onClick={() => setCurrentFolderId(null)}
                    className="hover:text-gray-700"
                  >
                    Retour
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateFolderDialogOpen(true)}
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                Nouveau dossier
              </Button>
              <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Uploader
              </Button>
            </div>
          </div>

          {/* Liste des dossiers */}
          {folders.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Dossiers
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {folders.map((folder: any) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => setCurrentFolderId(folder.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Folder className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{folder.name}</p>
                        <p className="text-xs text-gray-500">
                          {folder._count?.files ?? 0} fichier(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setEditingFolder(folder);
                          setRenameFolderDialogOpen(true);
                          setNewFolderName(folder.name);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id);
                        }}
                      >
                        <Trash className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liste des fichiers */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Fichiers {currentFolderId && "dans ce dossier"}
            </h3>
            {files.length > 0 ? (
              <div className="space-y-3">
                {files.map((file: any) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="font-medium">{file.fileName}</p>
                        <p className="text-sm text-gray-500">
                          {(file.fileSize / 1024).toFixed(2)} KB •{" "}
                          {new Date(file.uploadedAt).toLocaleDateString(
                            "fr-FR"
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          file.status === "SUCCES"
                            ? "default"
                            : file.status === "ERROR"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {file.status === "EN_COURS" ? "En cours" : file.status}
                      </Badge>
                      {file.status === "SUCCES" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(file.id, file.fileName)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => handleDeleteFile(file.id)}
                      >
                        <Trash className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  {currentFolderId
                    ? "Ce dossier est vide"
                    : "Aucun fichier dans cet espace"}
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setUploadDialogOpen(true)}
                >
                  Uploader des fichiers
                </Button>
              </div>
            )}
          </div>
        </Card>
      </TabsContent>

      {/* Dialog: Créer un dossier */}
      <Dialog
        open={createFolderDialogOpen}
        onOpenChange={setCreateFolderDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un nouveau dossier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nom du dossier</label>
              <Input
                placeholder="Mon dossier"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCreateFolderDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleCreateFolder}>Créer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Renommer un dossier */}
      <Dialog
        open={renameFolderDialogOpen}
        onOpenChange={setRenameFolderDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le dossier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nouveau nom</label>
              <Input
                placeholder="Nouveau nom"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRenameFolderDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleRenameFolder}>Renommer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <UploadFilesDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        clientId={clientId}
        onSuccess={() => router.refresh()}
      />
    </>
  );
};

export default FilesTabs;
