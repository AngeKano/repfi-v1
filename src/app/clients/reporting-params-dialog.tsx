"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart3, Check, XCircle } from "lucide-react";

export type CalcMode = "periodique" | "cumule";
export type Granularity = "mois" | "annee";

interface ReportingParamsDialogProps {
  open: boolean;
  onClose: () => void;
  onValidate: (params: { mode: CalcMode; granularity: Granularity }) => void;
  clientName?: string;
}

export function ReportingParamsDialog({
  open,
  onClose,
  onValidate,
  clientName,
}: ReportingParamsDialogProps) {
  const [mode, setMode] = useState<CalcMode>("periodique");
  const [granularity, setGranularity] = useState<Granularity>("mois");

  const handleValidate = () => {
    onValidate({ mode, granularity });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[480px] border border-[#D0E3F5]"
      >
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EBF5FF] flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-[#0077C3]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[#00122E]">
                  Paramètres du reporting
                </DialogTitle>
                <DialogDescription className="text-sm text-[#335890]">
                  {clientName
                    ? `Visualisation pour ${clientName}`
                    : "Choisissez le mode et la granularité"}
                </DialogDescription>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#94A3B8] transition-colors"
              aria-label="Fermer"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#335890] mb-2">
                Mode de calcul <span className="text-red-500">*</span>
              </label>
              <Select value={mode} onValueChange={(v) => setMode(v as CalcMode)}>
                <SelectTrigger className="w-full h-11 border-[#D0E3F5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="periodique">Périodique</SelectItem>
                  <SelectItem value="cumule">Cumulé</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#94A3B8] mt-1">
                {mode === "periodique"
                  ? "Affiche les valeurs de chaque période indépendamment."
                  : "Affiche les valeurs cumulées jusqu'à la période sélectionnée."}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#335890] mb-2">
                Granularité <span className="text-red-500">*</span>
              </label>
              <Select
                value={granularity}
                onValueChange={(v) => setGranularity(v as Granularity)}
              >
                <SelectTrigger className="w-full h-11 border-[#D0E3F5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mois">Mois</SelectItem>
                  <SelectItem value="annee">Année</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#94A3B8] mt-1">
                {granularity === "mois"
                  ? "Découpage mensuel des indicateurs."
                  : "Vue annuelle agrégée des indicateurs."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 pb-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="gap-2 text-[#335890] border-[#E2E8F0]"
          >
            <XCircle className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            onClick={handleValidate}
            className="gap-2 flex-1 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3]"
          >
            <Check className="w-4 h-4" />
            Valider
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function paramsToQuery(params: {
  mode: CalcMode;
  granularity: Granularity;
}): string {
  // Map to the existing periodType accepted by ClientReportingChart:
  // - Granularity "annee"             → year
  // - Granularity "mois" + periodique → month
  // - Granularity "mois" + cumule     → ytd
  let periodType: "year" | "month" | "ytd" = "year";
  if (params.granularity === "mois") {
    periodType = params.mode === "cumule" ? "ytd" : "month";
  } else {
    periodType = "year";
  }
  const sp = new URLSearchParams();
  sp.set("mode", params.mode);
  sp.set("granularity", params.granularity);
  sp.set("periodType", periodType);
  return sp.toString();
}
