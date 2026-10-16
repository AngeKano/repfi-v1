"use client";

// ============================================================================
// Référentiels (tables de dimension) — mise à jour unitaire.
//
// Plan comptable, plan tiers et codes journaux peuvent être mis à jour
// séparément, un fichier à la fois, sans période ni grand livre : les lignes
// du fichier sont ajoutées ou mises à jour, aucune n'est supprimée.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  XCircle,
  X,
  FileCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";
import { PiListChecksDuotone, PiUsersThreeDuotone, PiBooksDuotone } from "react-icons/pi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FileType } from "../../../../../../prisma/generated/prisma/enums";
import {
  acceptedExtensionsAttribute,
  detectComptableFormat,
  validateComptableFormat,
  MAX_COMPTABLE_FILE_SIZE,
  ALLOWED_FORMATS,
  FORMAT_LABELS,
} from "@/lib/comptable-formats";
import { DIMENSIONS, dimensionParType } from "@/lib/comptable/dimensions";
import DimensionsViewer from "./dimensions-viewer";

type Statut = "PENDING" | "VALIDATING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface EtatTable {
  fileType: FileType;
  label: string;
  lignes: number | null;
  derniereMiseAJour: string | null;
  enCours: boolean;
}

interface MiseAJour {
  id: string;
  fileType: FileType;
  fileName: string;
  fileSize: number;
  status: Statut;
  progress: number;
  rowsInserted: number | null;
  rowsUpdated: number | null;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
  uploadedBy: string;
}

interface Reponse {
  canUpload: boolean;
  tables: EtatTable[];
  updates: MiseAJour[];
}

const ICONES: Record<string, React.ElementType> = {
  [FileType.PLAN_COMPTES]: PiBooksDuotone,
  [FileType.PLAN_TIERS]: PiUsersThreeDuotone,
  [FileType.CODE_JOURNAL]: PiListChecksDuotone,
};

const EN_COURS: Statut[] = ["PENDING", "VALIDATING", "PROCESSING"];
// Seuls ces statuts évoluent sans action de l'utilisateur : Airflow les fait
// progresser. Un dépôt PENDING attend son lancement.
const EN_TRAITEMENT: Statut[] = ["VALIDATING", "PROCESSING"];

/**
 * Lance le traitement Airflow d'un dépôt — pendant de l'appel à
 * /api/files/comptable/trigger-etl de l'import complet.
 */
async function lancerTraitement(clientId: string, updateId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/clients/${clientId}/dimensions/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updateId }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? null : json?.error || "Le traitement n'a pas pu démarrer.";
  } catch {
    return "Erreur réseau.";
  }
}

const fmtDate = (iso: string | null) =>
  iso
    ? `${new Date(iso).toLocaleDateString("fr-FR")}, ${new Date(iso).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "—";

function BadgeStatut({ statut }: { statut: Statut }) {
  const libelles: Record<Statut, string> = {
    PENDING: "En attente",
    VALIDATING: "Validation",
    PROCESSING: "En cours",
    COMPLETED: "Terminé",
    FAILED: "Échec",
  };
  return (
    <Badge
      variant={
        statut === "COMPLETED"
          ? "default"
          : statut === "FAILED"
            ? "destructive"
            : statut === "PROCESSING" || statut === "VALIDATING"
              ? "secondary"
              : "outline"
      }
      className="text-xs gap-1"
    >
      {EN_TRAITEMENT.includes(statut) && <Loader2 className="w-3 h-3 animate-spin" />}
      {libelles[statut]}
    </Badge>
  );
}

export default function DimensionsSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Reponse | null>(null);
  const [dialogType, setDialogType] = useState<FileType | null>(null);
  // Incrémenté à la fin d'une mise à jour par fichier : le contenu affiché
  // des référentiels est alors rechargé.
  const [versionDonnees, setVersionDonnees] = useState(0);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/dimensions`);
      if (!res.ok) throw new Error();
      setData((await res.json()) as Reponse);
    } catch {
      // Silencieux : la section reste sur son dernier état connu.
    }
  }, [clientId]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Suivi en direct tant qu'une mise à jour est en cours.
  const enCours = data?.updates.some((u) => EN_TRAITEMENT.includes(u.status)) ?? false;
  const [lancement, setLancement] = useState<string | null>(null);

  const relancer = async (u: MiseAJour) => {
    setLancement(u.id);
    const erreur = await lancerTraitement(clientId, u.id);
    setLancement(null);
    if (erreur) toast.error(erreur);
    else toast.success("Traitement lancé");
    charger();
  };
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(charger, 4000);
    return () => clearInterval(t);
  }, [enCours, charger]);

  // Notification à la fin d'un traitement suivi depuis cet écran.
  const statutsPrecedents = useRef<Map<string, Statut>>(new Map());
  useEffect(() => {
    if (!data) return;
    for (const u of data.updates) {
      const avant = statutsPrecedents.current.get(u.id);
      if (avant && EN_COURS.includes(avant) && !EN_COURS.includes(u.status)) {
        const label = dimensionParType(u.fileType)?.label ?? u.fileType;
        if (u.status === "COMPLETED") setVersionDonnees((v) => v + 1);
        if (u.status === "COMPLETED")
          toast.success(
            `${label} mis à jour : ${u.rowsInserted ?? 0} ligne(s) ajoutée(s), ` +
              `${u.rowsUpdated ?? 0} modifiée(s).`,
          );
        else toast.error(`${label} : échec de la mise à jour.`);
      }
      statutsPrecedents.current.set(u.id, u.status);
    }
  }, [data]);

  return (
    <>
      <Card className="p-6 border-[#D0E3F5] mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#00122E]">
              Référentiels (tables de dimension)
            </h2>
            <p className="text-sm text-[#335890] mt-0.5">
              Mettez à jour un référentiel seul, sans réimporter de période. Les lignes du
              fichier sont ajoutées ou modifiées — aucune n&apos;est supprimée.
            </p>
          </div>
          {data?.canUpload && (
            <Button
              onClick={() => setDialogType(FileType.PLAN_COMPTES)}
              className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] rounded-full"
            >
              <RefreshCw className="w-4 h-4" />
              Mettre à jour un référentiel
            </Button>
          )}
        </div>

        {/* État des trois référentiels */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {DIMENSIONS.map((d) => {
            const etat = data?.tables.find((t) => t.fileType === d.fileType);
            const Icon = ICONES[d.fileType] ?? PiBooksDuotone;
            return (
              <div
                key={d.fileType}
                className="rounded-xl border border-[#D0E3F5] p-4 flex flex-col gap-3 bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-[#0077C3]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#00122E] text-sm">{d.label}</p>
                    <p className="text-xs text-[#335890]">
                      {etat?.lignes == null
                        ? "Aucune donnée"
                        : `${etat.lignes.toLocaleString("fr-FR")} ligne(s)`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {etat?.enCours ? (
                      <span className="inline-flex items-center gap-1 text-[#0077C3]">
                        <Loader2 className="w-3 h-3 animate-spin" /> Mise à jour en cours
                      </span>
                    ) : (
                      <>Dernière mise à jour : {fmtDate(etat?.derniereMiseAJour ?? null)}</>
                    )}
                  </span>
                  {data?.canUpload && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={etat?.enCours}
                      onClick={() => setDialogType(d.fileType)}
                      className="h-8 gap-1.5 border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF] shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Mettre à jour
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Historique */}
        <h3 className="text-sm font-semibold text-[#00122E] mb-2">Historique des mises à jour</h3>
        {data && data.updates.length > 0 ? (
          <div className="border border-[#D0E3F5] rounded-xl overflow-hidden bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                  {["Date", "Référentiel", "Fichier", "Résultat", "Statut", "Par", ""].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-3 text-xs font-semibold text-[#335890] uppercase tracking-wider",
                        i === 4 ? "text-center" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.updates.map((u, idx) => (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b border-[#D0E3F5] last:border-b-0",
                      idx % 2 === 0 ? "bg-white" : "bg-[#FAFCFF]",
                    )}
                  >
                    <td className="px-4 py-3 text-sm text-[#335890] whitespace-nowrap">
                      {fmtDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[#00122E] whitespace-nowrap">
                      {dimensionParType(u.fileType)?.label ?? u.fileType}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#00122E] max-w-[260px] truncate" title={u.fileName}>
                      {u.fileName}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {u.status === "COMPLETED" ? (
                        <span className="text-[#00122E]">
                          <span className="text-green-700 font-medium">
                            +{(u.rowsInserted ?? 0).toLocaleString("fr-FR")}
                          </span>{" "}
                          ajoutée(s),{" "}
                          <span className="text-[#0077C3] font-medium">
                            {(u.rowsUpdated ?? 0).toLocaleString("fr-FR")}
                          </span>{" "}
                          modifiée(s)
                        </span>
                      ) : u.status === "FAILED" ? (
                        <span
                          className="text-red-600 text-xs line-clamp-2"
                          title={u.errorMessage ?? ""}
                        >
                          {u.errorMessage || "Erreur inconnue"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Traitement… {u.progress}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <BadgeStatut statut={u.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-[#335890] whitespace-nowrap">
                      {u.uploadedBy}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {data.canUpload && (u.status === "PENDING" || u.status === "FAILED") && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={lancement === u.id}
                          onClick={() => relancer(u)}
                          className="h-8 gap-1.5 border-[#D0E3F5] text-[#335890] hover:bg-[#EBF5FF] whitespace-nowrap"
                        >
                          {lancement === u.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          {u.status === "FAILED" ? "Relancer" : "Lancer le traitement"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 border border-[#D0E3F5] rounded-xl text-sm text-[#335890]">
            Aucune mise à jour unitaire pour ce client.
          </div>
        )}
      </Card>

      {/* Consultation et modification ligne à ligne */}
      <DimensionsViewer clientId={clientId} version={versionDonnees} />

      {dialogType && (
        <DimensionUploadDialog
          clientId={clientId}
          initialType={dialogType}
          tables={data?.tables ?? []}
          onClose={(lancee) => {
            setDialogType(null);
            if (lancee) charger();
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// Boîte de dialogue : choix du référentiel + un seul fichier
// ============================================================================
function DimensionUploadDialog({
  clientId,
  initialType,
  tables,
  onClose,
}: {
  clientId: string;
  initialType: FileType;
  tables: EtatTable[];
  onClose: (lancee: boolean) => void;
}) {
  const [fileType, setFileType] = useState<FileType>(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [erreur, setErreur] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const def = dimensionParType(fileType)!;
  const formatsAutorises = (ALLOWED_FORMATS[fileType] ?? []).map((f) => FORMAT_LABELS[f]).join(" ou ");

  // Le fichier est revalidé à chaque changement de référentiel : un .pnc
  // n'est valable que pour le plan tiers.
  const choisir = (f: File | null, type: FileType = fileType) => {
    setErreur("");
    if (!f) {
      setFile(null);
      return;
    }
    const msg = validateComptableFormat(type, detectComptableFormat(f.name));
    if (msg) {
      setFile(null);
      setErreur(msg);
      return;
    }
    if (f.size > MAX_COMPTABLE_FILE_SIZE) {
      setFile(null);
      setErreur(`Fichier trop volumineux (max ${MAX_COMPTABLE_FILE_SIZE / (1024 * 1024)} Mo).`);
      return;
    }
    setFile(f);
  };

  const changerType = (t: FileType) => {
    setFileType(t);
    if (file) choisir(file, t);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };
  const handleDrop = (e: React.DragEvent) => {
    handleDrag(e);
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files.length > 1) {
      setErreur("Un seul fichier à la fois.");
      return;
    }
    choisir(files[0] ?? null);
  };

  const envoyer = async () => {
    if (!file) return;
    setEnvoi(true);
    try {
      const fd = new FormData();
      fd.append("fileType", fileType);
      fd.append("file", file);
      // 1. Dépôt du fichier (équivalent de /api/files/comptable/upload).
      const res = await fetch(`/api/clients/${clientId}/dimensions`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(json?.error || "Le dépôt a échoué.");
        return;
      }

      // 2. Lancement du DAG Airflow (équivalent de trigger-etl). En cas
      //    d'échec, le dépôt reste visible et relançable dans l'historique.
      const erreurLancement = await lancerTraitement(clientId, json.update.id);
      if (erreurLancement) {
        toast.error(`Fichier déposé, mais ${erreurLancement.charAt(0).toLowerCase()}${erreurLancement.slice(1)}`);
      } else {
        toast.success(`${def.label} : traitement Airflow lancé.`);
      }
      onClose(true);
    } catch {
      setErreur("Erreur réseau.");
    } finally {
      setEnvoi(false);
    }
  };

  const tableEnCours = tables.find((t) => t.fileType === fileType)?.enCours;

  return (
    <Dialog open onOpenChange={(v) => !v && !envoi && onClose(false)}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[620px] border border-[#D0E3F5]"
      >
        <div className="p-6 pb-4 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-lg font-bold text-[#00122E]">
                Mettre à jour un référentiel
              </DialogTitle>
              <DialogDescription className="text-sm text-[#335890]">
                Un seul fichier, appliqué à la table choisie uniquement.
              </DialogDescription>
            </div>
            <button
              onClick={() => !envoi && onClose(false)}
              className="w-8 h-8 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#94A3B8] transition-colors"
              aria-label="Fermer"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Choix du référentiel */}
          <div className="grid grid-cols-3 gap-3">
            {DIMENSIONS.map((d) => {
              const Icon = ICONES[d.fileType] ?? PiBooksDuotone;
              const actif = d.fileType === fileType;
              return (
                <button
                  key={d.fileType}
                  type="button"
                  onClick={() => changerType(d.fileType)}
                  aria-pressed={actif}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors",
                    actif
                      ? "border-[#0077C3] bg-[#EBF5FF] ring-1 ring-[#0077C3]/20"
                      : "border-[#D0E3F5] hover:bg-[#F5F9FF]",
                  )}
                >
                  <Icon className={cn("w-7 h-7", actif ? "text-[#0077C3]" : "text-[#94A3B8]")} />
                  <span className="text-sm font-medium text-[#00122E]">{d.label}</span>
                </button>
              );
            })}
          </div>

          {/* Règle de mise à jour */}
          <div className="flex gap-2 rounded-lg bg-[#F5F9FF] border border-[#D0E3F5] p-3 text-xs text-[#335890]">
            <Info className="w-4 h-4 shrink-0 text-[#0077C3] mt-0.5" />
            <div className="space-y-1">
              <p>
                Chaque ligne est identifiée par son <strong>{def.cle}</strong> : une clé nouvelle
                est <strong>ajoutée</strong>, une clé existante est <strong>mise à jour</strong>.
              </p>
              <p>
                Les lignes absentes du fichier sont <strong>conservées</strong> : aucune
                suppression. Format accepté : {formatsAutorises}.
              </p>
            </div>
          </div>

          {/* Fichier unique */}
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-[#D0E3F5] bg-white p-3">
              <div className="w-9 h-9 rounded-lg bg-[#EBF5FF] flex items-center justify-center shrink-0">
                <FileCheck className="w-5 h-5 text-[#0077C3]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#00122E] truncate">{file.name}</p>
                <p className="text-xs text-[#335890]">{(file.size / 1024).toFixed(0)} Ko</p>
              </div>
              <button
                onClick={() => choisir(null)}
                disabled={envoi}
                className="w-6 h-6 rounded-full hover:bg-[#F1F5F9] flex items-center justify-center text-[#94A3B8]"
                aria-label="Retirer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-4 transition-colors",
                dragActive ? "border-[#0077C3] bg-[#EBF5FF]" : "border-[#D0E3F5] bg-[#F8FAFC]",
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex items-center justify-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#D0E3F5] flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5 text-[#0077C3]" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#00122E]">
                    Glissez-déposez le fichier ici
                  </p>
                  <p className="text-xs text-[#335890]">
                    1 fichier — max {MAX_COMPTABLE_FILE_SIZE / (1024 * 1024)} Mo
                  </p>
                </div>
                <Input
                  type="file"
                  accept={acceptedExtensionsAttribute([fileType])}
                  onChange={(e) => {
                    choisir(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                  className="hidden"
                  id="dimension-upload-input"
                />
                <Label htmlFor="dimension-upload-input">
                  <Button
                    type="button"
                    asChild
                    size="sm"
                    className="bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] whitespace-nowrap"
                  >
                    <span>Sélectionner</span>
                  </Button>
                </Label>
              </div>
            </div>
          )}

          {(erreur || tableEnCours) && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {erreur ||
                  `Une mise à jour « ${def.label} » est déjà en cours : attendez sa fin.`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onClose(false)}
            disabled={envoi}
            className="gap-2 text-[#335890] border-[#E2E8F0]"
          >
            <XCircle className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            onClick={envoyer}
            disabled={!file || envoi || !!tableEnCours}
            className="gap-2 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3]"
          >
            {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Lancer la mise à jour
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
