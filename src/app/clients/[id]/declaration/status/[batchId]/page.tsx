"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, XCircle, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

export default function StatusPage({
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

  // Download Excel handler, same as in index.tsx (92-124)
  const handleDownloadExcel = async () => {
    if (!status?.periodId) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/files/download/${encodeURIComponent(status.periodId)}`,
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

  useEffect(() => {
    let isMounted = true;

    // Await the params if they are a Promise
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

        // Continue polling if the status is a running state
        if (data.status === "PROCESSING") {
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!status) {
    return <div>Période non trouvée</div>;
  }

  const statusConfig = {
    PENDING: { icon: Clock, color: "text-gray-500", label: "En attente" },
    VALIDATING: { icon: Loader2, color: "text-blue-500", label: "Validation" },
    PROCESSING: { icon: Loader2, color: "text-blue-500", label: "Traitement" },
    COMPLETED: { icon: CheckCircle, color: "text-green-500", label: "Terminé" },
    FAILED: { icon: XCircle, color: "text-red-500", label: "Échec" },
  };

  const config = statusConfig[status.status as keyof typeof statusConfig];
  const Icon = config.icon;

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Statut du Traitement ETL</h1>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Icon
              className={`w-8 h-8 ${config.color} ${
                status.status === "PROCESSING" ? "animate-spin" : ""
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
            {status.progress}%
          </Badge>
        </div>

        <Progress value={status.progress} className="mb-6" />

        {/* Button Download Only if Terminé */}
        {status.status === "COMPLETED" && (
          <div className="mb-6 flex">
            <Button
              size="sm"
              onClick={handleDownloadExcel}
              disabled={downloading}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {downloading ? "Téléchargement..." : "Télécharger l'export Excel"}
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
