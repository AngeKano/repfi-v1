// components/declaration-tabs.tsx
"use client";

import React, { useEffect, useState } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { FileText, Calendar, Eye, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type DeclarationTabsProps = {
  clientId: string;
};

const DeclarationTabs: React.FC<DeclarationTabsProps> = ({ clientId }) => {
  const router = useRouter();
  const [periods, setPeriods] = useState<any[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [periodToDelete, setPeriodToDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPeriods = () => {
    fetch(`/api/files/comptable/periods?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => setPeriods(data.periods || []));
  };

  useEffect(() => {
    loadPeriods();
  }, [clientId]);

  const handleDeleteClick = (period: any) => {
    setPeriodToDelete(period);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!periodToDelete.id) return;

    setDeleting(true);

    try {
      const response = await fetch(
        `/api/files/comptable/periods/${periodToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de la suppression");
      }

      toast.success(
        <>
          <div className="font-semibold">Période supprimée</div>
          <div>{data.deletedFiles} fichier(s) supprimé(s)</div>
        </>
      );

      loadPeriods();
      router.refresh();
    } catch (error: any) {
      toast.error(
        <>
          <div className="font-semibold">Erreur</div>
          <div>{error.message}</div>
        </>
      );
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setPeriodToDelete(null);
    }
  };

  const handleDownloadExcel = async (period: any) => {
    if (!period?.id) return;
    try {
      const res = await fetch(
        `/api/files/download/${encodeURIComponent(period.id)}`,
        {
          method: "GET",
        }
      );
      let data;
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors du téléchargement");
      }
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("Lien de téléchargement indisponible");
      }
    } catch (error: any) {
      toast?.error(
        <>
          <div className="font-semibold">Erreur de téléchargement</div>
          <div>{error.message}</div>
        </>
      );
    }
  };

  return (
    <>
      <TabsContent value="declaration">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Documents de reporting financier
            </h2>
            <Link href={`/clients/${clientId}/declaration`}>
              <Button size="sm">
                <FileText className="w-4 h-4 mr-2" />
                Nouveaux documents
              </Button>
            </Link>
          </div>
          {periods && periods.length > 0 ? (
            <div className="space-y-3">
              {periods.map((period: any) => (
                <div
                  key={period.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {new Date(period.periodStart).toLocaleDateString(
                          "fr-FR"
                        )}{" "}
                        au{" "}
                        {new Date(period.periodEnd).toLocaleDateString("fr-FR")}
                      </p>
                      <p className="text-sm text-gray-500">
                        Année {period.year} • Créé le{" "}
                        {new Date(period.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        period.status === "COMPLETED"
                          ? "default"
                          : period.status === "FAILED"
                          ? "destructive"
                          : period.status === "PROCESSING"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {period.status === "PENDING" && "En attente"}
                      {period.status === "VALIDATING" && "Validation"}
                      {period.status === "PROCESSING" && "En cours"}
                      {period.status === "COMPLETED" && "Terminé"}
                      {period.status === "FAILED" && "Échec"}
                    </Badge>
                    {/* Download button for excelFileUrl, only if COMPLETED and excelFileUrl is present */}
                    {period.status === "COMPLETED" && period.excelFileUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadExcel(period)}
                        title="Télécharger le fichier Excel"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Télécharger
                      </Button>
                    )}
                    <Link
                      href={`/clients/${clientId}/declaration/status/${period.batchId}`}
                    >
                      <Button size="sm" variant="outline">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteClick(period)}
                      disabled={
                        period.status === "PROCESSING" ||
                        period.status === "VALIDATING"
                      }
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune déclaration comptable</p>
              <Link href={`/clients/${clientId}/declaration`}>
                <Button variant="outline" className="mt-4">
                  <FileText className="w-4 h-4 mr-2" />
                  Nouveaux documents
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* Dialog de confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette période ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span>
                Cette action est irréversible. Tous les fichiers de cette
                période seront supprimés de :
              </span>
              <div className="mt-2 space-y-1">
                <div>• AWS S3 - fichiers sources et résultats</div>
                <div>• ClickHouse - données traitées</div>
                <div>• Base de données PostgreSQL</div>
              </div>
              {periodToDelete && (
                <div className="mt-4 p-3 bg-gray-100 rounded">
                  <p className="font-medium">
                    Période:{" "}
                    {new Date(periodToDelete.periodStart).toLocaleDateString(
                      "fr-FR"
                    )}{" "}
                    au{" "}
                    {new Date(periodToDelete.periodEnd).toLocaleDateString(
                      "fr-FR"
                    )}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting ? "Suppression..." : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DeclarationTabs;
