"use client";

// Onglet Membres d'un dossier : tout se gère ici, sans changer de page. Qui
// accède au dossier, avec quel rôle, et ce que chacun voit du reporting.

import { useCallback, useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { Eye, Loader2, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getRoleBadgeVariant, getRoleLabel } from "@/lib/permissions/role-utils";
import { NB_ELEMENTS, ONGLETS_REPORTING, nbMasquesOnglet } from "@/lib/reporting/elements";
import { cn } from "@/lib/utils";
import { AssignerDialog } from "./assigner-dialog";
import { DroitsRolesDialog } from "./droits-roles-dialog";
import type { DonneesMembres, MembreDossier } from "./types";
import { VisibiliteDialog } from "./visibilite-dialog";

const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Une case par onglet de reporting : ce que le membre voit, d'un coup d'œil. */
function BarreVisibilite({ masques }: { masques: string[] }) {
  const ensemble = new Set(masques);
  return (
    <div className="flex items-center gap-0.5" aria-hidden>
      {ONGLETS_REPORTING.map((o) => {
        const nb = nbMasquesOnglet(o, ensemble);
        return (
          <span
            key={o.id}
            title={`${o.label} : ${o.elements.length - nb} visible${o.elements.length - nb > 1 ? "s" : ""} sur ${o.elements.length}`}
            className={cn(
              "w-3 h-2 rounded-[2px]",
              nb === 0 ? "bg-emerald-500" : nb === o.elements.length ? "bg-slate-300" : "bg-amber-400",
            )}
          />
        );
      })}
    </div>
  );
}

function EtatReporting({ membre }: { membre: MembreDossier }) {
  if (!membre.voitReporting) {
    return <span className="text-xs text-[#94A3B8]">Aucun accès (rôle)</span>;
  }
  if (membre.masques === null) {
    return <span className="text-xs text-[#94A3B8]">—</span>;
  }
  const nb = membre.masques.length;
  return (
    <div className="space-y-1.5">
      <span className={cn("text-xs font-medium", nb === 0 ? "text-emerald-700" : "text-amber-700")}>
        {nb === 0 ? "Accès complet" : `${nb} élément${nb > 1 ? "s" : ""} masqué${nb > 1 ? "s" : ""} sur ${NB_ELEMENTS}`}
      </span>
      <BarreVisibilite masques={membre.masques} />
      {membre.modification && (
        <p className="text-[11px] text-[#94A3B8]">
          Modifié le {dateCourte(membre.modification.le)}
          {membre.modification.par ? ` par ${membre.modification.par}` : ""}
        </p>
      )}
    </div>
  );
}

function Chiffre({ valeur, label, detail }: { valeur: number; label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#D0E3F5] bg-[#F5F9FF] px-4 py-3">
      <p className="text-2xl font-bold text-[#00122E]">{valeur}</p>
      <p className="text-sm font-medium text-[#335890]">{label}</p>
      <p className="text-xs text-[#94A3B8]">{detail}</p>
    </div>
  );
}

export function MembresTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [donnees, setDonnees] = useState<DonneesMembres | null>(null);
  const [erreur, setErreur] = useState("");
  const [assignation, setAssignation] = useState(false);
  const [droits, setDroits] = useState(false);
  const [aRegler, setARegler] = useState<MembreDossier | null>(null);
  const [aRetirer, setARetirer] = useState<MembreDossier | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/membres`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors du chargement des membres");
      setDonnees(json as DonneesMembres);
      setErreur("");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors du chargement des membres");
    }
  }, [clientId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const modifierAssignation = async (membre: MembreDossier, methode: "POST" | "DELETE") => {
    setEnCours(membre.id);
    try {
      const res = await fetch(`/api/clients/${clientId}/assign`, {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [membre.id] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Opération impossible");
      toast.success(`${membre.nom} ${methode === "POST" ? "assigné au" : "retiré du"} dossier`);
      await charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      setEnCours(null);
      setARetirer(null);
    }
  };

  if (erreur) {
    return (
      <Card className="p-12 text-center">
        <p className="text-[#335890]">{erreur}</p>
      </Card>
    );
  }
  if (!donnees) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { membres, disponibles, moi, peutAssigner, peutRetirer, peutGerer } = donnees;
  const nbAssignes = membres.filter((m) => m.assigne).length;
  const nbRestreints = membres.filter((m) => (m.masques?.length ?? 0) > 0).length;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#00122E]">Membres et accès</h2>
          <p className="text-sm text-[#335890]">
            Qui accède à ce dossier, avec quel rôle, et ce que chacun voit du reporting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setDroits(true)}>
            <ShieldCheck className="w-4 h-4" />
            Droits par rôle
          </Button>
          {peutAssigner && (
            <Button size="sm" className="gap-2" onClick={() => setAssignation(true)}>
              <UserPlus className="w-4 h-4" />
              Assigner des membres
            </Button>
          )}
        </div>
      </div>

      <div className={cn("grid gap-3", peutGerer ? "grid-cols-3" : "grid-cols-2")}>
        <Chiffre valeur={nbAssignes} label="Membres assignés" detail="Affectés à ce dossier" />
        <Chiffre
          valeur={membres.length - nbAssignes}
          label="Accès par rôle"
          detail="Leur rôle voit tous les dossiers"
        />
        {peutGerer && (
          <Chiffre valeur={nbRestreints} label="Accès restreints" detail="Au moins un élément masqué" />
        )}
      </div>

      {membres.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-[#D0E3F5] mx-auto mb-3" />
          <p className="text-[#335890]">Aucun membre sur ce dossier</p>
        </div>
      ) : (
        <div className="border border-[#D0E3F5] rounded-xl overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#D0E3F5] bg-[#F5F9FF]">
                {["Membre", "Rôle", "Affectation", "Reporting visible", ""].map((t) => (
                  <th key={t} className="text-left px-4 py-3 text-xs font-semibold text-[#335890] uppercase">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {membres.map((m) => (
                <tr key={m.id} className="border-b border-[#D0E3F5] last:border-b-0 align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#EBF5FF] flex items-center justify-center text-sm font-semibold text-[#0077C3] shrink-0">
                        {m.nom.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#00122E] truncate">
                          {m.nom}
                          {m.id === moi && <span className="font-normal text-[#94A3B8]"> (vous)</span>}
                        </p>
                        <p className="text-xs text-[#335890] truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={getRoleBadgeVariant(m.role) as ComponentProps<typeof Badge>["variant"]}
                      className="text-xs"
                    >
                      {getRoleLabel(m.role)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#335890] whitespace-nowrap">
                    {m.assigne ? (
                      <>
                        Assigné
                        {m.assigneLe && <span className="block text-xs text-[#94A3B8]">le {dateCourte(m.assigneLe)}</span>}
                      </>
                    ) : (
                      <span title="Ce rôle voit tous les dossiers, sans assignation">Par son rôle</span>
                    )}
                    {!m.actif && (
                      <Badge variant="destructive" className="block w-fit mt-1 text-xs">
                        Désactivé
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EtatReporting membre={m} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {m.peutRestreindre && (
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setARegler(m)}>
                          <Eye className="w-4 h-4" />
                          Visibilité
                        </Button>
                      )}
                      {m.assigne && peutRetirer && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setARetirer(m)}
                        >
                          <UserMinus className="w-4 h-4" />
                          Retirer
                        </Button>
                      )}
                      {!m.assigne && m.actif && peutAssigner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2"
                          disabled={enCours === m.id}
                          onClick={() => modifierAssignation(m, "POST")}
                        >
                          <UserPlus className="w-4 h-4" />
                          Assigner
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutGerer && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#335890]">
          <span>Une case par onglet de reporting :</span>
          {[
            { c: "bg-emerald-500", l: "tout est visible" },
            { c: "bg-amber-400", l: "une partie est masquée" },
            { c: "bg-slate-300", l: "onglet masqué" },
          ].map((x) => (
            <span key={x.l} className="flex items-center gap-1.5">
              <span className={cn("inline-block w-3 h-2 rounded-[2px]", x.c)} />
              {x.l}
            </span>
          ))}
        </div>
      )}

      {assignation && (
        <AssignerDialog
          clientId={clientId}
          clientName={clientName}
          disponibles={disponibles}
          onClose={() => setAssignation(false)}
          onAssigne={() => {
            setAssignation(false);
            charger();
          }}
        />
      )}

      {droits && <DroitsRolesDialog onClose={() => setDroits(false)} />}

      {aRegler && (
        <VisibiliteDialog
          clientId={clientId}
          membre={aRegler}
          onClose={() => setARegler(null)}
          onEnregistre={() => {
            setARegler(null);
            charger();
          }}
        />
      )}

      <AlertDialog open={!!aRetirer} onOpenChange={(o) => !o && setARetirer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {aRetirer?.nom} de ce dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Si son rôle voit tous les dossiers, ce membre gardera l&apos;accès à celui-ci, avec les
              mêmes éléments masqués. Sinon, il n&apos;y aura plus accès.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!enCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!enCours}
              onClick={(e) => {
                e.preventDefault();
                if (aRetirer) modifierAssignation(aRetirer, "DELETE");
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
