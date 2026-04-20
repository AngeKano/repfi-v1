"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface DeleteClientDialogProps {
  client: any | null;
  open: boolean;
  onClose: () => void;
}

export function DeleteClientDialog({
  client,
  open,
  onClose,
}: DeleteClientDialogProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmation("");
      setDeleting(false);
    }
  }, [open]);

  if (!client) return null;

  const isConfirmed = confirmation === client.name;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la suppression");
      }

      toast.success(`Client "${client.name}" supprimé définitivement`);
      onClose();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la suppression");
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[480px] border border-[#FCA5A5]"
      >
        <div className="p-6 pb-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[#DC2626]">
                  Supprimer le client
                </DialogTitle>
                <DialogDescription className="text-sm text-[#335890]">
                  Cette action est irréversible
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

          {/* Warning */}
          <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg p-4 mb-4">
            <p className="text-sm text-[#991B1B] font-medium mb-2">
              Vous êtes sur le point de supprimer définitivement le client{" "}
              <span className="font-bold">&quot;{client.name}&quot;</span>.
            </p>
            <ul className="text-xs text-[#991B1B] space-y-1 list-disc pl-4">
              <li>
                Tous les <strong>fichiers</strong> (normaux et comptables) seront
                supprimés de S3
              </li>
              <li>
                Tous les <strong>reportings financiers</strong> (périodes et
                résultats) seront supprimés
              </li>
              <li>
                Toutes les <strong>attributions aux membres</strong> seront
                annulées
              </li>
              <li>
                L&apos;historique des fichiers sera{" "}
                <strong>définitivement perdu</strong>
              </li>
            </ul>
          </div>

          {/* Confirmation input */}
          <div className="space-y-2">
            <Label className="text-sm text-[#335890]">
              Pour confirmer, tapez le nom du client :{" "}
              <span className="font-bold text-[#00122E]">{client.name}</span>
            </Label>
            <Input
              placeholder={client.name}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={deleting}
              className="h-10 border-[#FCA5A5] focus:ring-[#DC2626] bg-[#F8FAFC]"
              autoComplete="off"
            />
            {confirmation.length > 0 && !isConfirmed && (
              <p className="text-xs text-[#DC2626]">
                Le texte ne correspond pas au nom du client
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleting}
            className="gap-2 text-[#335890] border-[#E2E8F0]"
          >
            <XCircle className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
            className="gap-2 flex-1 bg-[#DC2626] hover:bg-[#B91C1C] text-white disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? "Suppression..." : "Supprimer définitivement"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
