"use client";

// Fenêtre de consultation d'un membre : profil, accès aux dossiers, activité.

import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import Link from "next/link";
import { Building2, Edit, Loader2, Lock, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRoleBadgeVariant, getRoleLabel } from "@/lib/permissions/role-utils";
import { nomMembre, type DetailMembre, type MembreLigne } from "./types";

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

export function MembreDetailsDialog({
  membre,
  nbDossiersEntreprise,
  onClose,
  onModifier,
  onDesactiver,
}: {
  membre: MembreLigne;
  nbDossiersEntreprise: number;
  onClose: () => void;
  onModifier: () => void;
  onDesactiver: () => void;
}) {
  const [detail, setDetail] = useState<DetailMembre | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${membre.id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Membre introuvable");
        if (!annule) setDetail(json.user as DetailMembre);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Membre introuvable");
      }
    })();
    return () => {
      annule = true;
    };
  }, [membre.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#EBF5FF] flex items-center justify-center text-xl font-bold text-[#0077C3] shrink-0">
              {(membre.firstName || membre.email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[#00122E] truncate">{nomMembre(membre)}</DialogTitle>
              <DialogDescription className="truncate">{membre.email}</DialogDescription>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge
                  variant={getRoleBadgeVariant(membre.role) as ComponentProps<typeof Badge>["variant"]}
                  className="text-xs"
                >
                  {getRoleLabel(membre.role)}
                </Badge>
                <Badge
                  className={
                    membre.isActive
                      ? "text-xs bg-[#DCFCE7] text-[#16A34A] hover:bg-[#DCFCE7]"
                      : "text-xs bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FEE2E2]"
                  }
                >
                  {membre.isActive ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        {erreur ? (
          <p className="text-sm text-red-600 py-6 text-center">{erreur}</p>
        ) : !detail ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-3 gap-3">
              {[
                { l: "Membre depuis le", v: date(detail.createdAt) },
                { l: "Dernière connexion", v: date(detail.lastLoginAt) },
                { l: "Fichiers chargés", v: String(detail._count.normalFiles) },
              ].map((x) => (
                <div key={x.l} className="rounded-lg border border-[#D0E3F5] bg-[#F5F9FF] px-3 py-2">
                  <dt className="text-xs text-[#335890]">{x.l}</dt>
                  <dd className="text-sm font-semibold text-[#00122E]">{x.v}</dd>
                </div>
              ))}
            </dl>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#335890]">
                Dossiers accessibles
              </h3>
              {membre.voitTousLesDossiers ? (
                <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                  <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                  Tous les dossiers de l&apos;entreprise ({nbDossiersEntreprise}), d&apos;office par son rôle.
                </p>
              ) : detail.clientAssignments.length === 0 ? (
                <p className="text-sm text-amber-700">
                  Aucun dossier attribué : ce membre ne voit aucun dossier.
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto rounded-lg border border-[#D0E3F5] divide-y divide-[#EEF2F7]">
                  {detail.clientAssignments.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/clients/${c.id}`}
                        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F5F9FF]"
                      >
                        <Building2 className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        <span className="flex-1 min-w-0 truncate font-medium text-[#00122E]">{c.name}</span>
                        <span className="text-xs text-[#94A3B8]">attribué le {date(c.assignedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {(membre.peutModifier || (membre.peutDesactiver && membre.isActive)) && (
          <div className="flex justify-end gap-2 pt-2">
            {membre.peutDesactiver && membre.isActive && (
              <Button variant="outline" className="gap-2 text-red-600 border-red-200 hover:bg-red-50" onClick={onDesactiver}>
                <Trash2 className="w-4 h-4" />
                Désactiver
              </Button>
            )}
            {membre.peutModifier && (
              <Button className="gap-2" onClick={onModifier}>
                <Edit className="w-4 h-4" />
                Modifier
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
