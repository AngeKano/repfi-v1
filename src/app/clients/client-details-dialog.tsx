"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  FileText,
  Edit,
  Trash2,
  XCircle,
  Building2,
} from "lucide-react";

interface ClientDetailsDialogProps {
  client: any | null;
  open: boolean;
  onClose: () => void;
  onDelete?: (client: any) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  getCompanyTypeLabel?: (type: string) => string;
}

export function ClientDetailsDialog({
  client,
  open,
  onClose,
  onDelete,
  canEdit = false,
  canDelete = false,
  getCompanyTypeLabel,
}: ClientDetailsDialogProps) {
  const router = useRouter();

  if (!client) return null;

  const typeLabel = getCompanyTypeLabel
    ? getCompanyTypeLabel(client.companyType)
    : client.companyType;

  const createdAt = new Date(client.createdAt);
  const createdAtFormatted = createdAt
    .toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .replace(".", "");
  const createdAtTime = createdAt.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const primaryAdmin =
    client.assignedMembers && client.assignedMembers.length > 0
      ? client.assignedMembers[0]
      : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden max-w-[560px] border border-[#D0E3F5]"
      >
        <div className="p-6 pb-4">
          <DialogTitle className="sr-only">
            Détails du client {client.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Informations détaillées sur le client
          </DialogDescription>

          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#FEF3C7] flex items-center justify-center shrink-0">
                <Building2 className="w-8 h-8 text-[#0077C3]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#00122E]">
                  {client.name}
                </h2>
                <p className="text-sm text-[#335890]">
                  {client.email}
                  {client.phone && (
                    <>
                      {" / "}
                      <span className="text-[#0077C3]">{client.phone}</span>
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {client.denomination && (
                    <Badge variant="outline" className="text-xs">
                      {client.denomination}
                    </Badge>
                  )}
                  {typeLabel && (
                    <Badge
                      variant="outline"
                      className="text-xs border-[#0077C3] text-[#0077C3]"
                    >
                      {typeLabel}
                    </Badge>
                  )}
                </div>
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

          {/* Stats Row */}
          <div className="border border-[#D0E3F5] rounded-xl p-4 mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 text-[#94A3B8] mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs">Date de création</span>
                </div>
                <p className="text-sm font-semibold text-[#00122E]">
                  {createdAtFormatted}, {createdAtTime}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-[#94A3B8] mb-1">
                  <FileText className="w-4 h-4 text-[#9333EA]" />
                  <span className="text-xs">Fichiers chargés</span>
                </div>
                <Badge
                  variant="outline"
                  className="text-sm font-semibold border-[#0077C3] text-[#0077C3]"
                >
                  {client._count?.normalFiles ?? 0}
                </Badge>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="border border-[#D0E3F5] rounded-xl p-4 space-y-4">
            {client.website && (
              <div>
                <p className="text-xs text-[#94A3B8] mb-1">Site web</p>
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#0077C3] underline break-all"
                >
                  {client.website}
                </a>
              </div>
            )}

            {client.description && (
              <>
                <div className="h-px bg-[#E2E8F0]" />
                <div>
                  <p className="text-xs text-[#94A3B8] mb-1">Description</p>
                  <p className="text-sm font-medium text-[#00122E]">
                    {client.description}
                  </p>
                </div>
              </>
            )}

            {primaryAdmin && (
              <>
                <div className="h-px bg-[#E2E8F0]" />
                <div>
                  <p className="text-xs text-[#94A3B8] mb-2">
                    Administrateur principal
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-semibold text-[#0077C3]">
                      {(primaryAdmin.firstName || primaryAdmin.email)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#00122E]">
                        {primaryAdmin.firstName && primaryAdmin.lastName
                          ? `${primaryAdmin.firstName} ${primaryAdmin.lastName}`
                          : primaryAdmin.email}
                      </p>
                      <p className="text-xs text-[#335890]">
                        {primaryAdmin.email}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="gap-2 text-[#335890] border-[#E2E8F0]"
          >
            <XCircle className="w-4 h-4" />
            Fermer
          </Button>
          {canEdit && !client.isSelfEntity && (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                router.push(`/clients/${client.id}/edit`);
              }}
              className="gap-2 bg-[#EBF5FF] text-[#0077C3] border-[#0077C3] hover:bg-[#D0E3F5]"
            >
              <Edit className="w-4 h-4" />
              Modifier
            </Button>
          )}
          {canDelete && !client.isSelfEntity && onDelete && (
            <Button
              variant="outline"
              onClick={() => onDelete(client)}
              className="gap-2 bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5] hover:bg-[#FCA5A5]/30"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
