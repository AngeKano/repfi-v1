"use client";

// Fenêtre de création et de modification d'un membre : identité, rôle, dossiers
// attribués et mot de passe, sans quitter la liste des membres.

import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { AlertTriangle, Building2, Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getRoleBadgeVariant, getRoleLabel } from "@/lib/permissions/role-utils";
import { cn } from "@/lib/utils";
import { DossiersSelecteur } from "./dossiers-selecteur";
import {
  nomMembre,
  type DetailMembre,
  type DossierOption,
  type DroitsMembres,
  type InfoRole,
  type MembreLigne,
} from "./types";

type VarianteBadge = ComponentProps<typeof Badge>["variant"];

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#335890]">{titre}</h3>
      {children}
    </section>
  );
}

export function MembreFormDialog({
  membre,
  rolesAttribuables,
  infosRoles,
  dossiers,
  droits,
  onClose,
  onEnregistre,
}: {
  /** Absent : création d'un membre. */
  membre?: MembreLigne;
  /** Rôles que l'utilisateur connecté peut donner (niveau inférieur au sien). */
  rolesAttribuables: string[];
  infosRoles: Record<string, InfoRole>;
  dossiers: DossierOption[];
  droits: DroitsMembres;
  onClose: () => void;
  onEnregistre: () => void;
}) {
  const creation = !membre;
  const [chargement, setChargement] = useState(!creation);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");

  const [email, setEmail] = useState(membre?.email ?? "");
  const [prenom, setPrenom] = useState(membre?.firstName ?? "");
  const [nom, setNom] = useState(membre?.lastName ?? "");
  const [role, setRole] = useState(membre?.role ?? "");
  const [actif, setActif] = useState(membre?.isActive ?? true);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [attribuesInitiaux, setAttribuesInitiaux] = useState<string[]>([]);

  // Modification : dossiers déjà attribués.
  useEffect(() => {
    if (!membre) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${membre.id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Membre introuvable");
        const ids = (json.user as DetailMembre).clientAssignments.map((c) => c.id);
        if (!annule) {
          setSelection(ids);
          setAttribuesInitiaux(ids);
        }
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Membre introuvable");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [membre]);

  const peutChangerRole = creation || !!membre?.peutChangerRole;
  const voitTout = role ? (infosRoles[role]?.voitTousLesDossiers ?? false) : false;
  // Les dossiers ne se choisissent qu'avec le droit d'assigner, et ne se décochent
  // qu'avec le droit de retirer.
  const verrouilles = droits.peutRetirer ? [] : attribuesInitiaux;
  const dossiersAttribues = dossiers.filter((d) => selection.includes(d.id));

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (!role) return setErreur("Choisissez un rôle.");
    if (creation || motDePasse) {
      if (motDePasse.length < 8) return setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      if (motDePasse !== confirmation) return setErreur("Les mots de passe ne correspondent pas.");
    }

    const corps: Record<string, unknown> = {
      email: email.toLowerCase().trim(),
      firstName: prenom.trim() || (creation ? undefined : null),
      lastName: nom.trim() || (creation ? undefined : null),
    };
    if (peutChangerRole) corps.role = role;
    if (!creation && membre?.peutChangerStatut) corps.isActive = actif;
    if (motDePasse) corps.password = motDePasse;
    if (droits.peutAssigner && !voitTout) corps.clientIds = selection;

    setEnregistrement(true);
    try {
      const res = await fetch(creation ? "/api/users" : `/api/users/${membre!.id}`, {
        method: creation ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Enregistrement impossible");
      toast.success(
        creation
          ? json.user?.isActive === false
            ? "Membre créé, inactif jusqu'à son activation par un administrateur"
            : "Membre créé"
          : "Modifications enregistrées",
      );
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !enregistrement && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#D0E3F5]">
          <DialogTitle className="text-[#00122E]">
            {creation ? "Nouveau membre" : `Modifier ${nomMembre(membre!)}`}
          </DialogTitle>
          <DialogDescription>
            Les administrateurs voient tous les dossiers d&apos;office. LOADER, LOADER_PLUS et VIEWER ne
            voient que les dossiers qui leur sont attribués.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enregistrer} className="flex flex-col flex-1 min-h-0">
          {chargement ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-5 grid md:grid-cols-2 gap-x-8 gap-y-6">
              {/* ---- Identité et connexion ---- */}
              <div className="space-y-6">
                <Section titre="Identité">
                  <div className="space-y-1.5">
                    <Label htmlFor="membre-email">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="membre-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={enregistrement}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="membre-prenom">Prénom</Label>
                      <Input
                        id="membre-prenom"
                        value={prenom}
                        onChange={(e) => setPrenom(e.target.value)}
                        disabled={enregistrement}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="membre-nom">Nom</Label>
                      <Input
                        id="membre-nom"
                        value={nom}
                        onChange={(e) => setNom(e.target.value)}
                        disabled={enregistrement}
                      />
                    </div>
                  </div>
                </Section>

                <Section titre={creation ? "Mot de passe" : "Changer le mot de passe (facultatif)"}>
                  <div className="space-y-1.5">
                    <Label htmlFor="membre-mdp">
                      {creation ? "Mot de passe" : "Nouveau mot de passe"}
                      {creation && <span className="text-red-500"> *</span>}
                    </Label>
                    <Input
                      id="membre-mdp"
                      type="password"
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      placeholder={creation ? "8 caractères minimum" : "Laisser vide pour ne pas changer"}
                      required={creation}
                      autoComplete="new-password"
                      disabled={enregistrement}
                    />
                  </div>
                  {(creation || motDePasse) && (
                    <div className="space-y-1.5">
                      <Label htmlFor="membre-mdp2">
                        Confirmer le mot de passe <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="membre-mdp2"
                        type="password"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        required
                        autoComplete="new-password"
                        disabled={enregistrement}
                      />
                    </div>
                  )}
                </Section>

                {!creation && membre?.peutChangerStatut && (
                  <Section titre="Statut">
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-[#D0E3F5] px-3 py-2.5">
                      <span>
                        <span className="block text-sm font-medium text-[#00122E]">Compte actif</span>
                        <span className="block text-xs text-[#335890]">
                          Désactivé, le membre ne peut plus se connecter.
                        </span>
                      </span>
                      <Switch
                        checked={actif}
                        onCheckedChange={setActif}
                        disabled={enregistrement || (!membre.isActive && !droits.peutActiver)}
                        aria-label="Compte actif"
                      />
                    </label>
                  </Section>
                )}
                {creation && !droits.peutActiver && (
                  <Alert>
                    <AlertDescription>
                      Le membre sera créé inactif : il pourra se connecter après son activation par un
                      administrateur autorisé.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* ---- Rôle et dossiers ---- */}
              <div className="space-y-6">
                <Section titre="Rôle">
                  {peutChangerRole ? (
                    <div className="space-y-2" role="radiogroup" aria-label="Rôle du membre">
                      {rolesAttribuables.map((id) => {
                        const info = infosRoles[id];
                        const choisi = role === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={choisi}
                            aria-label={getRoleLabel(id)}
                            onClick={() => setRole(id)}
                            disabled={enregistrement}
                            className={cn(
                              "w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                              choisi
                                ? "border-[#0077C3] bg-[#EBF5FF] ring-1 ring-[#0077C3]/30"
                                : "border-[#D0E3F5] hover:bg-[#F5F9FF]",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                                choisi ? "border-[#0077C3] bg-[#0077C3]" : "border-[#94A3B8]",
                              )}
                            >
                              {choisi && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <Badge variant={getRoleBadgeVariant(id) as VarianteBadge} className="text-xs">
                                  {getRoleLabel(id)}
                                </Badge>
                                <span className="text-[11px] text-[#335890]">
                                  {info?.voitTousLesDossiers ? "Tous les dossiers" : "Dossiers attribués"}
                                </span>
                              </span>
                              <span className="block text-xs text-[#335890] mt-1">{info?.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(role) as VarianteBadge} className="text-xs">
                        {getRoleLabel(role)}
                      </Badge>
                      <span className="text-xs text-[#94A3B8]">
                        Le rôle ne se modifie que par un administrateur de niveau supérieur.
                      </span>
                    </div>
                  )}
                </Section>

                <Section titre="Dossiers attribués">
                  {!role ? (
                    <p className="text-sm text-[#94A3B8]">Choisissez d&apos;abord un rôle.</p>
                  ) : voitTout ? (
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <Lock className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" />
                      <p className="text-sm text-emerald-800">
                        Attribué d&apos;office à tous les dossiers de l&apos;entreprise ({dossiers.length}).
                        Il figure dans l&apos;onglet Membres de chacun, sans pouvoir en être retiré.
                      </p>
                    </div>
                  ) : droits.peutAssigner ? (
                    <>
                      <DossiersSelecteur
                        dossiers={dossiers}
                        selection={selection}
                        onChange={setSelection}
                        verrouilles={verrouilles}
                      />
                      {selection.length === 0 && (
                        <p className="flex items-start gap-2 text-xs text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          Sans dossier attribué, ce membre ne verra aucun dossier.
                        </p>
                      )}
                    </>
                  ) : dossiersAttribues.length === 0 ? (
                    <p className="text-sm text-[#335890]">Aucun dossier attribué.</p>
                  ) : (
                    <ul className="space-y-1">
                      {dossiersAttribues.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-sm text-[#00122E]">
                          <Building2 className="w-4 h-4 text-[#94A3B8]" />
                          {d.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-[#D0E3F5]">
            <p className="flex-1 min-w-[200px] text-sm text-red-600">{erreur}</p>
            <Button type="button" variant="outline" onClick={onClose} disabled={enregistrement}>
              Annuler
            </Button>
            <Button type="submit" disabled={enregistrement || chargement || !role} className="gap-2">
              {enregistrement && <Loader2 className="w-4 h-4 animate-spin" />}
              {creation ? "Créer le membre" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
