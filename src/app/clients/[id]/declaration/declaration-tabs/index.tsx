// components/declaration-tabs.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
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
import { FileText, Calendar, Eye, Trash2, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UploadFileDialog } from "../../upload-file-dialog";

type PeriodFilter = "all" | "year" | "month";

const MONTHS = [
  { value: "01", label: "Janvier" },
  { value: "02", label: "Février" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" },
  { value: "08", label: "Août" },
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
];

type DeclarationTabsProps = {
  clientId: string;
};

const DeclarationTabs: React.FC<DeclarationTabsProps> = ({ clientId }) => {
  const router = useRouter();
  const [periods, setPeriods] = useState<any[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [periodToDelete, setPeriodToDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");

  const loadPeriods = () => {
    fetch(`/api/files/comptable/periods?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => setPeriods(data.periods || []));
  };

  useEffect(() => {
    loadPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Available years from periods
  const availableYears = useMemo(() => {
    const years = new Set(
      periods.map((p) => p.year?.toString()).filter(Boolean),
    );
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [periods]);

  // Filtered periods
  const filteredPeriods = useMemo(() => {
    return periods.filter((p) => {
      // Year filter
      if (filterYear !== "all" && p.year?.toString() !== filterYear) {
        return false;
      }

      // Period type filter
      if (periodFilter === "year") {
        // Full year = Jan 1 to Dec 31
        const start = new Date(p.periodStart);
        const end = new Date(p.periodEnd);
        if (start.getMonth() !== 0 || start.getDate() !== 1) return false;
        if (end.getMonth() !== 11 || end.getDate() !== 31) return false;
      } else if (periodFilter === "month") {
        // Monthly = same month start & end
        const start = new Date(p.periodStart);
        const end = new Date(p.periodEnd);
        if (start.getMonth() !== end.getMonth()) {
          // Not a single-month period, but if month filter is set, check if period overlaps
        }
        if (filterMonth !== "all") {
          const monthNum = Number(filterMonth) - 1;
          if (start.getMonth() !== monthNum) return false;
        }
      }

      return true;
    });
  }, [periods, periodFilter, filterYear, filterMonth]);

  const handleDeleteClick = (period: any) => {
    setPeriodToDelete(period);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!periodToDelete?.id) return;

    setDeleting(true);

    try {
      const response = await fetch(
        `/api/files/comptable/periods/${periodToDelete.id}`,
        { method: "DELETE" },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de la suppression");
      }

      toast.success(
        <>
          <div className="font-semibold">Période supprimée</div>
          <div>{data.deletedFiles} fichier(s) supprimé(s)</div>
        </>,
      );

      loadPeriods();
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setPeriodToDelete(null);
    }
  };

  const handleDownloadExcel = (period: any) => {
    if (!period?.id) return;
    window.location.href = `/api/files/download/${encodeURIComponent(period.id)}`;
  };

  const formatPeriod = (start: string, end: string) => {
    return `${new Date(start).toLocaleDateString("fr-FR")} au ${new Date(end).toLocaleDateString("fr-FR")}`;
  };

  return (
    <>
      <TabsContent value="declaration">
        <Card className="p-6 border-[#D0E3F5]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#00122E]">
              Périodes de reporting financier
            </h2>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-3 h-9">
                <span className="text-xs text-[#335890]">Période :</span>
                <Select
                  value={periodFilter}
                  onValueChange={(v) => {
                    setPeriodFilter(v as PeriodFilter);
                    if (v === "year") setFilterMonth("all");
                  }}
                >
                  <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="year">Année complète</SelectItem>
                    <SelectItem value="month">Mois</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-3 h-9">
                <span className="text-xs text-[#335890]">Année :</span>
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[60px] font-semibold text-[#00122E] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {availableYears.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {periodFilter === "month" && (
                <div className="flex items-center gap-2 border border-[#D0E3F5] rounded-lg px-3 h-9">
                  <span className="text-xs text-[#335890]">Mois :</span>
                  <Select value={filterMonth} onValueChange={setFilterMonth}>
                    <SelectTrigger className="border-0 p-0 h-auto shadow-none min-w-[80px] font-semibold text-[#00122E] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Badge
                variant="outline"
                className="text-xs text-[#335890] border-[#D0E3F5]"
              >
                {filteredPeriods.length} période(s)
              </Badge>
            </div>
          </div>

          {/* Periods table */}
          {filteredPeriods.length > 0 ? (
            <div className="border border-[#D0E3F5] rounded-xl overflow-hidden bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Période
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Année
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Date de création
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPeriods.map((period: any, idx: number) => (
                    <tr
                      key={period.id}
                      className={`border-b border-[#D0E3F5] last:border-b-0 hover:bg-[#F5F9FF] transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#EBF5FF] flex items-center justify-center shrink-0">
                            <Calendar className="w-4 h-4 text-[#0077C3]" />
                          </div>
                          <span className="font-medium text-[#00122E] text-sm">
                            {formatPeriod(period.periodStart, period.periodEnd)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-sm font-medium text-[#00122E]">
                        {period.year}
                      </td>
                      <td className="px-4 py-4 text-sm text-[#335890]">
                        {new Date(period.createdAt).toLocaleDateString(
                          "fr-FR",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          },
                        )}
                        {", "}
                        {new Date(period.createdAt).toLocaleTimeString(
                          "fr-FR",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
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
                          className="text-xs"
                        >
                          {period.status === "PENDING" && "En attente"}
                          {period.status === "VALIDATING" && "Validation"}
                          {period.status === "PROCESSING" && "En cours"}
                          {period.status === "COMPLETED" && "Terminé"}
                          {period.status === "FAILED" && "Échec"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {period.status === "COMPLETED" &&
                            period.excelFileUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                                onClick={() => handleDownloadExcel(period)}
                                title="Télécharger Excel"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            )}
                          <Link
                            href={`/clients/${clientId}/declaration/status/${period.batchId}`}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#0077C3] hover:text-[#005992] hover:bg-[#EBF5FF] h-8 w-8 p-0"
                              title="Voir le statut"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                            onClick={() => handleDeleteClick(period)}
                            disabled={
                              period.status === "PROCESSING" ||
                              period.status === "VALIDATING"
                            }
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
          ) : (
            <div className="text-center py-12 border border-[#D0E3F5] rounded-xl">
              <FileText className="w-12 h-12 text-[#D0E3F5] mx-auto mb-3" />
              <p className="text-[#335890] mb-4">Aucun reporting financier</p>
              <Button
                onClick={() => setShowUploadDialog(true)}
                className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
              >
                <Plus className="w-4 h-4" />
                Créer un reporting
              </Button>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* Upload Dialog */}
      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => {
          setShowUploadDialog(false);
          loadPeriods();
        }}
        client={{ id: clientId }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#DC2626]">
              Supprimer cette période ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="text-sm text-[#335890]">
                  Cette action est irréversible. Tous les fichiers seront
                  supprimés de :
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[#335890] list-disc pl-4">
                  <li>AWS S3 — fichiers sources et résultats</li>
                  <li>ClickHouse — données traitées</li>
                  <li>PostgreSQL — métadonnées</li>
                </ul>
                {periodToDelete && (
                  <div className="mt-4 p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg">
                    <p className="font-medium text-sm text-[#991B1B]">
                      Période :{" "}
                      {formatPeriod(
                        periodToDelete.periodStart,
                        periodToDelete.periodEnd,
                      )}
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-[#DC2626] hover:bg-[#B91C1C]"
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
