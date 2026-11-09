"use client";

// Fenêtre de création et de modification d'un membre, en trois étapes comme les
// autres fenêtres de création : identité, rôle, dossiers attribués. Sans quitter
// la liste des membres.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  UserCog,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
type Etape = 1 | 2 | 3;

const ETAPES: { n: Etape; label: string; sousTitre: string }[] = [
  { n: 1, label: "Identité", sousTitre: "Identité et mot de passe" },
  { n: 2, label: "Rôle", sousTitre: "Rôle et droits du membre" },
  { n: 3, label: "Dossiers", sousTitre: "Dossiers auxquels il a accès" },
];

const CHAMP = "h-10 bg-[#F8FAFC] border-[#E2E8F0]";
const LIBELLE = "text-sm font-medium text-[#335890]";
const BOUTON_PRINCIPAL =
  "gap-2 flex-1 bg-gradient-to-r from-[#0077C3] to-[#0095F4] hover:from-[#005992] hover:to-[#0077C3] disabled:opacity-50";

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
  const [etape, setEtape] = useState<Etape>(1);
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

  // La fenêtre prend la hauteur de l'étape affichée (les étapes glissent côte à côte).
  const panneaux = useRef<(HTMLDivElement | null)[]>([]);
  const [hauteur, setHauteur] = useState<number>();
  useLayoutEffect(() => {
    const panneau = panneaux.current[etape - 1];
    if (!panneau) return;
    const mesurer = () => setHauteur(panneau.offsetHeight);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(panneau);
    return () => observateur.disconnect();
  }, [etape]);

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

  // Validation de chaque étape : on ne passe à la suivante qu'une fois remplie.
  const motDePasseRequis = creation || motDePasse.length > 0;
  const motDePasseCourt = motDePasse.length > 0 && motDePasse.length < 8;
  const confirmationFausse = confirmation.length > 0 && confirmation !== motDePasse;
  const etapeValide: Record<Etape, boolean> = {
    1:
      /\S+@\S+\.\S+/.test(email.trim()) &&
      (!motDePasseRequis || (motDePasse.length >= 8 && confirmation === motDePasse)),
    2: !!role,
    3: true,
  };
  const accessible = (n: Etape) => ETAPES.filter((e) => e.n < n).every((e) => etapeValide[e.n]);
  const derniere = etape === 3;

  const enregistrer = async () => {
    setErreur("");
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

  // Entrée : étape suivante en création, enregistrement en modification.
  const valider = (e: React.FormEvent) => {
    e.preventDefault();
    if (enregistrement || chargement) return;
    if (creation && !derniere) {
      if (etapeValide[etape]) setEtape((etape + 1) as Etape);
      return;
    }
    if (ETAPES.every((x) => etapeValide[x.n])) enregistrer();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !enregistrement && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[680px] max-h-[calc(100vh-2rem)] border border-[#D0E3F5]"
      >
        <form onSubmit={valider}>
          <div className="p-6 pb-4">
            {/* En-tête */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#EBF5FF] flex items-center justify-center shrink-0">
                  {creation ? (
                    <UserPlus className="w-5 h-5 text-[#0077C3]" />
                  ) : (
                    <UserCog className="w-5 h-5 text-[#0077C3]" />
                  )}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold text-[#00122E] truncate">
                    {creation ? "Nouveau membre" : `Modifier ${nomMembre(membre!)}`}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-[#335890]">
                    {ETAPES[etape - 1].sousTitre}
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={enregistrement}
                className="w-8 h-8 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#94A3B8] transition-colors shrink-0"
                aria-label="Fermer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Indicateur d'étapes : une étape déjà remplie se rouvre d'un clic. */}
            <div className="flex items-center gap-3 mb-5">
              {ETAPES.map((e, i) => (
                <div key={e.n} className={cn("flex items-center gap-3", i < ETAPES.length - 1 && "flex-1")}>
                  <button
                    type="button"
                    onClick={() => setEtape(e.n)}
                    disabled={!accessible(e.n) || enregistrement}
                    aria-current={etape === e.n ? "step" : undefined}
                    className="flex items-center gap-2 disabled:cursor-not-allowed"
                  >
                    <span
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold",
                        etape >= e.n ? "bg-[#0077C3] text-white" : "bg-[#E2E8F0] text-[#94A3B8]",
                      )}
                    >
                      {etape > e.n ? <Check className="w-3.5 h-3.5" /> : e.n}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        etape === e.n ? "font-semibold text-[#00122E]" : "text-[#335890]",
                      )}
                    >
                      {e.label}
                    </span>
                  </button>
                  {i < ETAPES.length - 1 && (
                    <div className="flex-1 h-0.5 bg-[#E2E8F0]">
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          etape > e.n ? "w-full bg-[#0077C3]" : "w-0",
                        )}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {erreur && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            {/* Étapes, en glissement */}
            <div
              className="relative overflow-hidden transition-[height] duration-300 ease-out"
              style={{ height: hauteur }}
              // Le navigateur peut faire défiler cette zone (focus, saisie) : seul
              // le glissement des étapes la déplace.
              onScroll={(e) => {
                e.currentTarget.scrollLeft = 0;
              }}
            >
              <div
                className="flex items-start transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${(etape - 1) * 100}%)` }}
              >
                {/* ÉTAPE 1 — Identité et mot de passe */}
                <div
                  ref={(el) => {
                    panneaux.current[0] = el;
                  }}
                  inert={etape !== 1}
                  className="w-full shrink-0 px-1 space-y-4 max-h-[52vh] overflow-y-auto"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="membre-email" className={LIBELLE}>
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="membre-email"
                      type="email"
                      placeholder="prenom.nom@entreprise.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={enregistrement}
                      className={CHAMP}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="membre-prenom" className={LIBELLE}>
                        Prénom
                      </Label>
                      <Input
                        id="membre-prenom"
                        value={prenom}
                        onChange={(e) => setPrenom(e.target.value)}
                        disabled={enregistrement}
                        className={CHAMP}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="membre-nom" className={LIBELLE}>
                        Nom
                      </Label>
                      <Input
                        id="membre-nom"
                        value={nom}
                        onChange={(e) => setNom(e.target.value)}
                        disabled={enregistrement}
                        className={CHAMP}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="membre-mdp" className={LIBELLE}>
                        {creation ? "Mot de passe" : "Nouveau mot de passe"}
                        {creation && <span className="text-red-500"> *</span>}
                      </Label>
                      <Input
                        id="membre-mdp"
                        type="password"
                        value={motDePasse}
                        onChange={(e) => setMotDePasse(e.target.value)}
                        placeholder={creation ? "8 caractères minimum" : "Inchangé si vide"}
                        autoComplete="new-password"
                        disabled={enregistrement}
                        className={CHAMP}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="membre-mdp2" className={LIBELLE}>
                        Confirmation
                        {motDePasseRequis && <span className="text-red-500"> *</span>}
                      </Label>
                      <Input
                        id="membre-mdp2"
                        type="password"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        autoComplete="new-password"
                        disabled={enregistrement || !motDePasseRequis}
                        className={CHAMP}
                      />
                    </div>
                  </div>
                  {(motDePasseCourt || confirmationFausse) && (
                    <p className="text-xs text-red-600 -mt-2">
                      {motDePasseCourt
                        ? "Le mot de passe doit contenir au moins 8 caractères."
                        : "Les mots de passe ne correspondent pas."}
                    </p>
                  )}

                  {!creation && membre?.peutChangerStatut && (
                    <div className="flex items-center justify-between p-3 border border-[#D0E3F5] rounded-lg">
                      <div>
                        <Label className="text-sm font-medium text-[#00122E]">Compte actif</Label>
                        <p className="text-xs text-[#94A3B8]">Désactivé, le membre ne peut plus se connecter.</p>
                      </div>
                      <Switch
                        checked={actif}
                        onCheckedChange={setActif}
                        disabled={enregistrement || (!membre.isActive && !droits.peutActiver)}
                        aria-label="Compte actif"
                      />
                    </div>
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

                {/* ÉTAPE 2 — Rôle */}
                <div
                  ref={(el) => {
                    panneaux.current[1] = el;
                  }}
                  inert={etape !== 2}
                  className="w-full shrink-0 px-1 max-h-[52vh] overflow-y-auto"
                >
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
                                  {info?.voitTousLesDossiers ? "Tous les dossiers, d'office" : "Dossiers attribués"}
                                </span>
                              </span>
                              <span className="block text-xs text-[#335890] mt-1">{info?.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 border border-[#D0E3F5] rounded-lg">
                      <Badge variant={getRoleBadgeVariant(role) as VarianteBadge} className="text-xs">
                        {getRoleLabel(role)}
                      </Badge>
                      <span className="text-xs text-[#94A3B8]">
                        Le rôle ne se modifie que par un administrateur de niveau supérieur.
                      </span>
                    </div>
                  )}
                </div>

                {/* ÉTAPE 3 — Dossiers attribués */}
                <div
                  ref={(el) => {
                    panneaux.current[2] = el;
                  }}
                  inert={etape !== 3}
                  className="w-full shrink-0 px-1 space-y-4 max-h-[52vh] overflow-y-auto"
                >
                  {/* Récapitulatif */}
                  <div className="flex items-center gap-3 p-3 border border-[#D0E3F5] rounded-lg bg-[#F5F9FF]">
                    <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-bold text-[#0077C3] shrink-0">
                      {(prenom || email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#00122E] truncate">
                        {[prenom, nom].filter(Boolean).join(" ") || email || "—"}
                      </p>
                      <p className="text-xs text-[#335890] truncate">{email}</p>
                    </div>
                    {role && (
                      <Badge variant={getRoleBadgeVariant(role) as VarianteBadge} className="text-xs">
                        {getRoleLabel(role)}
                      </Badge>
                    )}
                  </div>

                  {chargement ? (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
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
                </div>
              </div>
            </div>
          </div>

          {/* Pied : Annuler, Retour, Continuer ou Créer / Enregistrer. En
              modification, Enregistrer reste disponible à chaque étape. */}
          <div className="flex items-center gap-3 px-6 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={enregistrement}
              className="gap-2 text-[#335890] border-[#E2E8F0]"
            >
              <XCircle className="w-4 h-4" />
              Annuler
            </Button>
            {etape > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEtape((etape - 1) as Etape)}
                disabled={enregistrement}
                className="gap-2 text-[#335890] border-[#E2E8F0]"
              >
                <ChevronLeft className="w-4 h-4" />
                Retour
              </Button>
            )}
            {!derniere && (
              <Button
                type="button"
                variant={creation ? "default" : "outline"}
                onClick={() => setEtape((etape + 1) as Etape)}
                disabled={!etapeValide[etape] || enregistrement}
                className={creation ? BOUTON_PRINCIPAL : "gap-2 text-[#335890] border-[#E2E8F0]"}
              >
                Continuer
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
            {(derniere || !creation) && (
              <Button
                type="submit"
                disabled={enregistrement || chargement || !ETAPES.every((x) => etapeValide[x.n])}
                className={BOUTON_PRINCIPAL}
              >
                {enregistrement ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {enregistrement ? "Enregistrement..." : creation ? "Créer le membre" : "Enregistrer"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
