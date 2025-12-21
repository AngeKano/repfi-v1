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

  // Download Excel handler
  const handleDownloadExcel = async () => {
    if (!status?.periodId) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/files/download/${encodeURIComponent(status.periodId)}`,
        { method: "GET" }
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
      toast.error(
        <>
          <div className="font-semibold">Erreur de téléchargement</div>
          <div>{error.message}</div>
        </>
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadExcelFile = async (batchId: string, fileName: string) => {
    if (!batchId || !fileName) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/files/download/comptable?batchId=${encodeURIComponent(
          batchId
        )}&fileName=${encodeURIComponent(fileName)}`,
        { method: "GET" }
      );
      let data: any = {};
      try {
        data = await res.json();
      } catch (_e) {}
      if (!res.ok || data?.error) {
        throw new Error(
          data?.error ? data.error : "Erreur lors du téléchargement du fichier."
        );
      }
      if (data?.url) {
        const link = document.createElement("a");
        link.href = data.url;
        link.target = "_blank";
        if (data.fileName) {
          link.download = data.fileName;
        }
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        throw new Error("Lien de téléchargement indisponible.");
      }
    } catch (error: any) {
      toast.error(
        <>
          <div className="font-semibold">Erreur de téléchargement</div>
          <div>{error.message || "Une erreur inconnue est survenue."}</div>
        </>
      );
    } finally {
      setDownloading(false);
    }
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
          `/api/files/comptable/status/${params.batchId}`
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
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-600 animate-pulse">Chargement...</p>
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!status) {
    return <div>Période non trouvée</div>;
  }

  const statusConfig = {
    PENDING: {
      icon: Clock,
      color: "text-gray-500",
      label: "En attente",
      bgColor: "bg-gray-100",
    },
    VALIDATING: {
      icon: Loader2,
      color: "text-blue-500",
      label: "Validation",
      bgColor: "bg-blue-50",
    },
    PROCESSING: {
      icon: Loader2,
      color: "text-blue-500",
      label: "Traitement",
      bgColor: "bg-blue-50",
    },
    COMPLETED: {
      icon: CheckCircle,
      color: "text-green-500",
      label: "Terminé",
      bgColor: "bg-green-50",
    },
    FAILED: {
      icon: XCircle,
      color: "text-red-500",
      label: "Échec",
      bgColor: "bg-red-50",
    },
  };

  const config = statusConfig[status.status as keyof typeof statusConfig];
  const Icon = config.icon;
  const isProcessing = ["PENDING", "VALIDATING", "PROCESSING"].includes(
    status.status
  );

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card className="p-6">
        {/* Message animé en haut */}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Icon
              className={`w-8 h-8 ${config.color} ${
                isProcessing ? "animate-spin" : ""
              }`}
            />
            <div>
              <h2 className="text-xl font-semibold">{config.label}</h2>
              <p className="text-sm text-gray-500">
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
          >
            {Math.round(animatedProgress)}%
          </Badge>
        </div>
        <div className="flex flex-col gap-2">
          {(isProcessing || currentMessage === "Traitement terminé !") && (
            <p className={`font-medium text-gray-800 animate-pulse`}>
              {currentMessage}
            </p>
          )}
          <Progress value={animatedProgress} className="mb-3" />
        </div>

        {/* Button Download Only if Terminé */}
        {status.status === "COMPLETED" && (
          <div className="mb-6 flex">
            <Button
              size="sm"
              onClick={handleDownloadExcel}
              disabled={downloading}
              className="gap-2 cursor-pointer"
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
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50 cursor-pointer"
            >
              <RotateCw
                className={`w-4 h-4 ${reprocessing ? "animate-spin" : ""}`}
              />
              {reprocessing ? "Relance en cours..." : "Relancer le traitement"}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold">Fichiers traités</h3>
          {status.files && status.files.length > 0 ? (
            status.files.map((file: any) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border rounded"
              >
                <div>
                  <p className="font-medium">{file.fileName}</p>
                  <p className="text-sm text-gray-500">{file.fileType}</p>
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
                          file.fileName
                        )
                      }
                      disabled={downloading}
                      className="cursor-pointer"
                      title="Télécharger le fichier Excel"
                      variant="outline"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500">
              Aucun fichier traité pour cette période
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
