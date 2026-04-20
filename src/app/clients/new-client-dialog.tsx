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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Building2,
  XCircle,
  Check,
  ChevronRight,
  ChevronLeft,
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

interface NewClientDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewClientDialog({ open, onClose }: NewClientDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [phone, setPhone] = useState("");
  const [denomination, setDenomination] = useState("");
  const [assujettiTVA, setAssujettiTVA] = useState(true);

  // Step 2 fields
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setName("");
      setEmail("");
      setCompanyType("");
      setPhone("");
      setWebsite("");
      setDescription("");
      setDenomination("");
      setAssujettiTVA(true);
      setError("");
      setLoading(false);
    }
  }, [open]);

  const canGoStep2 = !!name && !!email && !!companyType;

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    const data = {
      name,
      email: email.toLowerCase().trim(),
      companyType,
      phone: phone || undefined,
      website: website || undefined,
      description: description || undefined,
      denomination: denomination || undefined,
      assujettiTVA,
    };

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Erreur lors de la création du client");
        setLoading(false);
        return;
      }

      toast.success("Client créé avec succès");
      onClose();
      router.refresh();
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[calc(100vh-2rem)] border border-[#D0E3F5]"
      >
        <div className="p-6 pb-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EBF5FF] flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[#0077C3]" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[#00122E]">
                  Nouveau client
                </DialogTitle>
                <DialogDescription className="text-sm text-[#335890]">
                  {step === 1
                    ? "Informations de base"
                    : "Informations complémentaires"}
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#94A3B8] transition-colors"
              aria-label="Fermer"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step >= 1
                    ? "bg-[#0077C3] text-white"
                    : "bg-[#E2E8F0] text-[#94A3B8]"
                }`}
              >
                1
              </div>
              <span className="text-xs text-[#335890]">Base</span>
            </div>
            <div className="flex-1 h-0.5 bg-[#E2E8F0]">
              <div
                className={`h-full transition-all duration-300 ${
                  step >= 2 ? "w-full bg-[#0077C3]" : "w-0"
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step >= 2
                    ? "bg-[#0077C3] text-white"
                    : "bg-[#E2E8F0] text-[#94A3B8]"
                }`}
              >
                2
              </div>
              <span className="text-xs text-[#335890]">Détails</span>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Slider */}
          <div className="relative overflow-hidden">
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(${step === 1 ? "0%" : "-100%"})`,
              }}
            >
              {/* STEP 1 — Informations de base */}
              <div className="w-full shrink-0 px-1 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#335890]">
                    Nom du client <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Entreprise Client"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
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
                      placeholder="contact@client.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      className="h-10 bg-[#F8FAFC] border-[#E2E8F0]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-[#335890]">
                      Téléphone
                    </Label>
                    <Input
                      type="tel"
                      placeholder="+225 1 23 45 67 89"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={loading}
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
                      value={companyType}
                      onValueChange={setCompanyType}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-10 bg-[#F8FAFC] border-[#E2E8F0]">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
                      placeholder="SARL, SAS, etc."
                      value={denomination}
                      onChange={(e) => setDenomination(e.target.value)}
                      disabled={loading}
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
                      CA calculé sur comptes 70 (HT) si activé, sinon comptes 41
                      (TTC).
                    </p>
                  </div>
                  <Switch
                    checked={assujettiTVA}
                    onCheckedChange={setAssujettiTVA}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* STEP 2 — Détails complémentaires */}
              <div className="w-full shrink-0 px-1 space-y-4">
                {/* Recap header */}
                <div className="flex items-center gap-3 p-3 border border-[#D0E3F5] rounded-lg bg-[#F5F9FF]">
                  <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-bold text-[#0077C3] shrink-0">
                    {name ? name.charAt(0).toUpperCase() : "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#00122E] truncate">
                      {name || "—"}
                    </p>
                    <p className="text-xs text-[#335890] truncate">{email}</p>
                  </div>
                  <div className="text-right">
                    {denomination && (
                      <span className="text-xs text-[#335890] border border-[#D0E3F5] rounded px-1.5 py-0.5 mr-1">
                        {denomination}
                      </span>
                    )}
                    <span className="text-xs text-[#0077C3] border border-[#0077C3] rounded px-1.5 py-0.5">
                      {COMPANY_TYPES.find((t) => t.value === companyType)
                        ?.label || companyType}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#335890]">
                    Site web
                  </Label>
                  <Input
                    type="url"
                    placeholder="https://www.client.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    disabled={loading}
                    className="h-10 bg-[#F8FAFC] border-[#E2E8F0]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#335890]">
                    Description
                  </Label>
                  <Textarea
                    placeholder="Description de l'activité du client..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                    rows={3}
                    className="bg-[#F8FAFC] border-[#E2E8F0]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="gap-2 text-[#335890] border-[#E2E8F0]"
          >
            <XCircle className="w-4 h-4" />
            Annuler
          </Button>

          {step === 1 ? (
            <Button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canGoStep2}
              className="gap-2 flex-1 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] disabled:opacity-50"
            >
              Continuer
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={loading}
                className="gap-2 text-[#335890] border-[#E2E8F0]"
              >
                <ChevronLeft className="w-4 h-4" />
                Retour
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !canGoStep2}
                className="gap-2 flex-1 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {loading ? "Création..." : "Créer le client"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
