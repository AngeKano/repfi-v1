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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  FileText,
  Edit,
  Trash2,
  XCircle,
  Building2,
  Users,
  Phone,
  Mail,
  Globe,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

const COMPANY_TYPES = [
  { value: "TECHNOLOGIE", label: "Technologie" },
  { value: "FINANCE", label: "Finance" },
  { value: "SANTE", label: "Santé" },
  { value: "EDUCATION", label: "Éducation" },
  { value: "COMMERCE", label: "Commerce" },
  { value: "INDUSTRIE", label: "Industrie" },
  { value: "AGRICULTURE", label: "Agriculture" },
  { value: "IMMOBILIER", label: "Immobilier" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "ENERGIE", label: "Énergie" },
  { value: "TELECOMMUNICATION", label: "Télécommunication" },
  { value: "TOURISME", label: "Tourisme" },
];

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
  canEdit = true,
  canDelete = false,
  getCompanyTypeLabel,
}: ClientDetailsDialogProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCompanyType, setEditCompanyType] = useState("");
  const [editDenomination, setEditDenomination] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAssujettiTVA, setEditAssujettiTVA] = useState(true);

  // Reset edit state when dialog opens or client changes
  useEffect(() => {
    if (open && client) {
      setEditing(false);
      populateEditFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id]);

  const populateEditFields = () => {
    if (!client) return;
    setEditName(client.name || "");
    setEditEmail(client.email || "");
    setEditPhone(client.phone || "");
    setEditCompanyType(client.companyType || "");
    setEditDenomination(client.denomination || "");
    setEditWebsite(client.website || "");
    setEditDescription(client.description || "");
    setEditAssujettiTVA(client.assujettiTVA ?? true);
  };

  const handleStartEdit = () => {
    populateEditFields();
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          email: editEmail.toLowerCase().trim(),
          companyType: editCompanyType,
          phone: editPhone || null,
          website: editWebsite || null,
          description: editDescription || null,
          denomination: editDenomination || null,
          assujettiTVA: editAssujettiTVA,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la modification");
      }

      toast.success("Client modifié avec succès");
      setEditing(false);
      onClose();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la modification");
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  const typeLabel = getCompanyTypeLabel
    ? getCompanyTypeLabel(client.companyType)
    : COMPANY_TYPES.find((t) => t.value === client.companyType)?.label ||
      client.companyType;

  const createdAt = new Date(client.createdAt);
  const updatedAt = client.updatedAt ? new Date(client.updatedAt) : null;
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const primaryAdmin =
    client.assignedMembers && client.assignedMembers.length > 0
      ? client.assignedMembers[0]
      : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[620px] max-h-[calc(100vh-2rem)] border border-[#D0E3F5]"
      >
        <div className="p-6 pb-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
          <DialogTitle className="sr-only">
            Détails du client {client.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Informations détaillées sur le client
          </DialogDescription>

          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#EBF5FF] flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-[#0077C3]">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                {!editing ? (
                  <>
                    <h2 className="text-xl font-bold text-[#00122E]">
                      {client.name}
                    </h2>
                    <p className="text-sm text-[#335890]">{client.email}</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-[#0077C3]">
                      Mode édition
                    </h2>
                    <p className="text-xs text-[#94A3B8]">
                      Modifiez les champs puis validez
                    </p>
                  </>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {client.denomination && !editing && (
                    <Badge variant="outline" className="text-xs">
                      {client.denomination}
                    </Badge>
                  )}
                  {!editing && (
                    <Badge
                      variant="outline"
                      className="text-xs border-[#0077C3] text-[#0077C3]"
                    >
                      {typeLabel}
                    </Badge>
                  )}
                  {client.assujettiTVA && !editing && (
                    <Badge className="text-xs bg-[#DCFCE7] text-[#16A34A] hover:bg-[#DCFCE7]">
                      TVA
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

          {/* ==================== VIEW MODE ==================== */}
          {!editing && (
            <div className="space-y-4">
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-[#D0E3F5] rounded-xl p-3">
                  <div className="flex items-center gap-2 text-[#94A3B8] mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-[10px] uppercase">Créé le</span>
                  </div>
                  <p className="text-xs font-semibold text-[#00122E]">
                    {fmtDate(createdAt)}
                  </p>
                </div>
                <div className="border border-[#D0E3F5] rounded-xl p-3">
                  <div className="flex items-center gap-2 text-[#94A3B8] mb-1">
                    <FileText className="w-3.5 h-3.5 text-[#9333EA]" />
                    <span className="text-[10px] uppercase">Fichiers</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs font-semibold border-[#0077C3] text-[#0077C3]"
                  >
                    {client._count?.normalFiles ?? 0}
                  </Badge>
                </div>
                <div className="border border-[#D0E3F5] rounded-xl p-3">
                  <div className="flex items-center gap-2 text-[#94A3B8] mb-1">
                    <Users className="w-3.5 h-3.5 text-[#16A34A]" />
                    <span className="text-[10px] uppercase">Membres</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs font-semibold border-[#16A34A] text-[#16A34A]"
                  >
                    {client._count?.assignments ?? 0}
                  </Badge>
                </div>
              </div>

              {/* Contact info */}
              <div className="border border-[#D0E3F5] rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <Mail className="w-4 h-4 text-[#94A3B8] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-[#94A3B8] uppercase">
                        Email
                      </p>
                      <p className="text-sm text-[#00122E] break-all">
                        {client.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="w-4 h-4 text-[#94A3B8] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-[#94A3B8] uppercase">
                        Téléphone
                      </p>
                      <p className="text-sm text-[#00122E]">
                        {client.phone || "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {client.website && (
                  <>
                    <div className="h-px bg-[#E2E8F0]" />
                    <div className="flex items-start gap-2">
                      <Globe className="w-4 h-4 text-[#94A3B8] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[10px] text-[#94A3B8] uppercase">
                          Site web
                        </p>
                        <a
                          href={client.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#0077C3] underline break-all"
                        >
                          {client.website}
                        </a>
                      </div>
                    </div>
                  </>
                )}

                {client.description && (
                  <>
                    <div className="h-px bg-[#E2E8F0]" />
                    <div>
                      <p className="text-[10px] text-[#94A3B8] uppercase mb-1">
                        Description
                      </p>
                      <p className="text-sm text-[#00122E]">
                        {client.description}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Assigned members */}
              {client.assignedMembers && client.assignedMembers.length > 0 && (
                <div className="border border-[#D0E3F5] rounded-xl p-4">
                  <p className="text-[10px] text-[#94A3B8] uppercase mb-3">
                    Membres assignés ({client.assignedMembers.length})
                  </p>
                  <div className="space-y-2">
                    {client.assignedMembers.map((member: any, idx: number) => (
                      <div
                        key={member.id || idx}
                        className="flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#EBF5FF] flex items-center justify-center text-xs font-semibold text-[#0077C3] shrink-0">
                          {(member.firstName || member.email)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#00122E] truncate">
                            {member.firstName && member.lastName
                              ? `${member.firstName} ${member.lastName}`
                              : member.email}
                          </p>
                          <p className="text-xs text-[#335890] truncate">
                            {member.email}
                          </p>
                        </div>
                        {member.role && (
                          <Badge variant="outline" className="text-[10px]">
                            {member.role}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Updated at */}
              {updatedAt && (
                <p className="text-[10px] text-[#94A3B8] text-right">
                  Dernière modification : {fmtDate(updatedAt)}
                </p>
              )}
            </div>
          )}

          {/* ==================== EDIT MODE ==================== */}
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[#335890]">
                  Nom du client <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                  className="h-10 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#335890]">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    disabled={saving}
                    className="h-10 bg-[#F8FAFC] border-[#E2E8F0]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#335890]">
                    Téléphone
                  </Label>
                  <Input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    disabled={saving}
                    className="h-10 bg-[#F8FAFC] border-[#E2E8F0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#335890]">
                    Type d&apos;entreprise{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={editCompanyType}
                    onValueChange={setEditCompanyType}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-10 bg-[#F8FAFC] border-[#E2E8F0]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#335890]">
                    Dénomination
                  </Label>
                  <Input
                    value={editDenomination}
                    onChange={(e) => setEditDenomination(e.target.value)}
                    disabled={saving}
                    placeholder="SARL, SAS..."
                    className="h-10 bg-[#F8FAFC] border-[#E2E8F0]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 border border-[#D0E3F5] rounded-lg">
                <div>
                  <Label className="text-sm font-medium text-[#00122E]">
                    Assujetti à la TVA
                  </Label>
                  <p className="text-xs text-[#94A3B8]">
                    CA sur comptes 70 (HT) si activé, sinon 41 (TTC).
                  </p>
                </div>
                <Switch
                  checked={editAssujettiTVA}
                  onCheckedChange={setEditAssujettiTVA}
                  disabled={saving}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[#335890]">
                  Site web
                </Label>
                <Input
                  type="url"
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  disabled={saving}
                  placeholder="https://..."
                  className="h-10 bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[#335890]">
                  Description
                </Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={saving}
                  rows={2}
                  className="bg-[#F8FAFC] border-[#E2E8F0]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 pb-6">
          {!editing ? (
            <>
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
                  onClick={handleStartEdit}
                  className="gap-2 flex-1 bg-[#EBF5FF] text-[#0077C3] border-[#0077C3] hover:bg-[#D0E3F5]"
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
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                disabled={saving}
                className="gap-2 text-[#335890] border-[#E2E8F0]"
              >
                <X className="w-4 h-4" />
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !editName || !editEmail || !editCompanyType}
                className="gap-2 flex-1 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
