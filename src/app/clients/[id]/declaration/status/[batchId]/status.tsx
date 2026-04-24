"use client";

import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  Download,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";

// Messages par étape
const STEP_MESSAGES = {
  PENDING: ["Début du traitement..."],
  VALIDATING: [
    "Traitement du plan comptable...",
    "Traitement du code journal...",
    "Traitement du plan tiers...",
    "Traitement du grand livre de compte...",
    "Traitement du grand livre de tiers...",
  ],
  PROCESSING: [
    "Traitement final...",
    "Ajout des statistiques...",
    "Génération des documents Excel...",
  ],
  COMPLETED: ["Traitement terminé !"],
  FAILED: ["Échec du traitement"],
};

// Plages de progression par étape
const PROGRESS_RANGES = {
  PENDING: { min: 0, max: 10 },
  VALIDATING: { min: 10, max: 75 },
  PROCESSING: { min: 75, max: 95 },
  COMPLETED: { min: 100, max: 100 },
  FAILED: { min: 0, max: 0 },
};

export default function StatusComponents({
  params: asyncParams,
}: {
  params: Promise<{ clientId: string; batchId: string }>;
}) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<{
    clientId: string;
    batchId: string;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  // États pour l'animation des messages et de la progression
  const [currentMessage, setCurrentMessage] = useState("");
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const messageIndexRef = useRef(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Download Excel handler — l'API streame le fichier directement (pas de CORS)
  const handleDownloadExcel = () => {
    if (!status?.periodId) return;
    window.location.href = `/api/files/download/${encodeURIComponent(status.periodId)}`;
  };

  const handleDownloadExcelFile = (batchId: string, fileName: string) => {
    if (!batchId || !fileName) return;
    window.location.href = `/api/files/download/comptable?batchId=${encodeURIComponent(batchId)}&fileName=${encodeURIComponent(fileName)}`;
  };

  // Handler for relancer le traitement ETL si Echec
  const handleRetryETL = async () => {
    if (!params?.batchId) return;
    setReprocessing(true);
    try {
      const response = await fetch("/api/files/comptable/trigger-etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: params.batchId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors du déclenchement");
      }

      toast.success("Traitement ETL relancé avec succès");
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReprocessing(false);
    }
  };

  // Gestion des messages animés et de la progression
  useEffect(() => {
    if (!status?.status) return;

    const currentStatus = status.status as keyof typeof STEP_MESSAGES;
    const messages = STEP_MESSAGES[currentStatus] || [];
    const range = PROGRESS_RANGES[currentStatus] || { min: 0, max: 0 };

    // Nettoyer les intervalles précédents
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // Si COMPLETED ou FAILED, pas d'animation
    if (currentStatus === "COMPLETED") {
      setCurrentMessage(messages[0]);
      setAnimatedProgress(100);
      return;
    }

    if (currentStatus === "FAILED") {
      setCurrentMessage(messages[0]);
      return;
    }

    // Initialiser le message
    messageIndexRef.current = 0;
    setCurrentMessage(messages[0]);
    setAnimatedProgress(range.min);

    // Calculer l'incrément de progression par message
    const progressPerMessage = (range.max - range.min) / messages.length;
    let currentProgressTarget = range.min + progressPerMessage;

    // Intervalle pour changer les messages
    const messageInterval = setInterval(() => {
      messageIndexRef.current = (messageIndexRef.current + 1) % messages.length;
      setCurrentMessage(messages[messageIndexRef.current]);

      // Mettre à jour la cible de progression
      if (messageIndexRef.current < messages.length - 1) {
        currentProgressTarget =
          range.min + progressPerMessage * (messageIndexRef.current + 1);
      } else {
        currentProgressTarget = range.max;
      }
    }, 3000); // Change de message toutes les 3 secondes

    // Intervalle pour animer la progression progressivement
    progressIntervalRef.current = setInterval(() => {
      setAnimatedProgress((prev) => {
        if (prev < currentProgressTarget) {
          return Math.min(prev + 1, currentProgressTarget);
        }
        return prev;
      });
    }, 100);

    return () => {
      clearInterval(messageInterval);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [status?.status]);

  useEffect(() => {
    let isMounted = true;

    const resolveParams = async () => {
      if (asyncParams instanceof Promise) {
        const awaitedParams = await asyncParams;
        if (isMounted) setParams(awaitedParams);
      } else {
        setParams(asyncParams);
      }
    };

    resolveParams();

    return () => {
      isMounted = false;
    };
  }, [asyncParams]);

  useEffect(() => {
    if (!params) return;
    let shouldPoll = true;

    const fetchStatus = async () => {
      try {
        const response = await fetch(
          `/api/files/comptable/status/${params.batchId}`,
        );
        const data = await response.json();
        setStatus(data);

        if (
          data.status === "PROCESSING" ||
          data.status === "VALIDATING" ||
          data.status === "PENDING"
        ) {
          if (shouldPoll) setTimeout(fetchStatus, 3000);
        }
      } catch (error) {
        console.error("Erreur:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    return () => {
      shouldPoll = false;
    };
  }, [params]);

  if (loading) {
    return (
      <Card className="p-12 border-[#D0E3F5]">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#0077C3]" />
          <p className="text-[#335890] animate-pulse">Chargement...</p>
        </div>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="p-12 border-[#D0E3F5] text-center">
        <p className="text-[#335890]">Période non trouvée</p>
      </Card>
    );
  }

  const statusConfig = {
    PENDING: {
      icon: Clock,
      color: "text-[#94A3B8]",
      label: "En attente",
      bgColor: "bg-[#F1F5F9]",
    },
    VALIDATING: {
      icon: Loader2,
      color: "text-[#0077C3]",
      label: "Validation",
      bgColor: "bg-[#EBF5FF]",
    },
    PROCESSING: {
      icon: Loader2,
      color: "text-[#0077C3]",
      label: "Traitement",
      bgColor: "bg-[#EBF5FF]",
    },
    COMPLETED: {
      icon: CheckCircle,
      color: "text-[#16A34A]",
      label: "Terminé",
      bgColor: "bg-[#DCFCE7]",
    },
    FAILED: {
      icon: XCircle,
      color: "text-[#DC2626]",
      label: "Échec",
      bgColor: "bg-[#FEE2E2]",
    },
  };

  const config = statusConfig[status.status as keyof typeof statusConfig];
  const Icon = config.icon;
  const isProcessing = ["PENDING", "VALIDATING", "PROCESSING"].includes(
    status.status,
  );

  return (
    <div className="max-w-4xl">
      <Card className="p-6 border-[#D0E3F5]">
        {/* Message animé en haut */}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center`}
            >
              <Icon
                className={`w-6 h-6 ${config.color} ${
                  isProcessing ? "animate-spin" : ""
                }`}
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#00122E]">
                {config.label}
              </h2>
              <p className="text-sm text-[#335890]">
                Période:{" "}
                {status.periodStart
                  ? new Date(status.periodStart).toLocaleDateString("fr-FR")
                  : "N/A"}{" "}
                au{" "}
                {status.periodEnd
                  ? new Date(status.periodEnd).toLocaleDateString("fr-FR")
                  : "N/A"}
              </p>
            </div>
          </div>
          <Badge
            variant={
              status.status === "COMPLETED"
                ? "default"
                : status.status === "FAILED"
                  ? "destructive"
                  : "secondary"
            }
            className="text-sm"
          >
            {Math.round(animatedProgress)}%
          </Badge>
        </div>
        <div className="flex flex-col gap-2 mb-6">
          {(isProcessing || currentMessage === "Traitement terminé !") && (
            <p className="font-medium text-[#335890] animate-pulse">
              {currentMessage}
            </p>
          )}
          <Progress value={animatedProgress} />
        </div>

        {/* Button Download Only if Terminé */}
        {status.status === "COMPLETED" && (
          <div className="mb-6 flex">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadExcel}
              disabled={downloading}
              className="gap-2 text-[#0077C3] border-[#D0E3F5] hover:text-[#005992] hover:bg-[#EBF5FF]"
            >
              <Download className="w-4 h-4" />
              {downloading ? "Téléchargement..." : "Télécharger l'export Excel"}
            </Button>
          </div>
        )}

        {/* Button Retry (relancer) if Echec */}
        {status.status === "FAILED" && (
          <div className="mb-6 flex">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryETL}
              disabled={reprocessing}
              className="gap-2 text-[#DC2626] border-[#FCA5A5] hover:bg-[#FEE2E2]"
            >
              <RotateCw
                className={`w-4 h-4 ${reprocessing ? "animate-spin" : ""}`}
              />
              {reprocessing ? "Relance en cours..." : "Relancer le traitement"}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold text-[#00122E]">Fichiers traités</h3>
          {status.files && status.files.length > 0 ? (
            <div className="border border-[#D0E3F5] rounded-xl overflow-hidden">
              {status.files.map((file: any, idx: number) => (
                <div
                  key={file.id}
                  className={`flex items-center justify-between p-4 ${
                    idx !== status.files.length - 1
                      ? "border-b border-[#D0E3F5]"
                      : ""
                  } ${idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]"}`}
                >
                  <div>
                    <p className="font-medium text-[#00122E]">{file.fileName}</p>
                    <p className="text-sm text-[#335890]">{file.fileType}</p>
                  </div>
                  <div className="flex flex-row gap-x-3 items-center">
                    <Badge
                      variant={
                        file.processingStatus === "COMPLETED"
                          ? "default"
                          : file.processingStatus === "FAILED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {file.processingStatus}
                    </Badge>
                    {status.status === "COMPLETED" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleDownloadExcelFile(
                            params?.batchId ?? "",
                            file.fileName,
                          )
                        }
                        disabled={downloading}
                        title="Télécharger le fichier Excel"
                        variant="outline"
                        className="border-[#0077C3] text-[#0077C3] hover:bg-[#EBF5FF]"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[#335890]">
              Aucun fichier traité pour cette période
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
