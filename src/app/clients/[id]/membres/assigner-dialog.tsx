"use client";

// Fenêtre « Assigner des membres » : remplace l'ancienne page d'assignation.

import { useState } from "react";
import type { ComponentProps } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getRoleBadgeVariant, getRoleLabel } from "@/lib/permissions/role-utils";
import type { MembreDisponible } from "./types";

export function AssignerDialog({
  clientId,
  clientName,
  disponibles,
  onClose,
  onAssigne,
}: {
  clientId: string;
  clientName: string;
  disponibles: MembreDisponible[];
  onClose: () => void;
  onAssigne: () => void;
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState(false);

  const terme = recherche.trim().toLowerCase();
  const liste = disponibles.filter(
    (m) => !terme || m.nom.toLowerCase().includes(terme) || m.email.toLowerCase().includes(terme),
  );

  const basculer = (id: string) =>
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const assigner = async () => {
    setEnCours(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selection }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de l'assignation");
      toast.success(`${json.stats.newAssignments} membre(s) assigné(s)`);
      onAssigne();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'assignation");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assigner des membres</DialogTitle>
          <DialogDescription>
            Sélectionnez les membres à assigner au dossier {clientName}. Ils voient tout le reporting
            que leur rôle autorise, sauf ce qu&apos;un administrateur leur masque.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un membre…"
            className="pl-9"
            aria-label="Rechercher un membre"
          />
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {liste.length === 0 ? (
            <p className="text-sm text-[#335890] text-center py-8">
              {disponibles.length === 0 ? "Tous les membres sont déjà assignés." : "Aucun membre trouvé."}
            </p>
          ) : (
            liste.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 p-3 border border-[#D0E3F5] rounded-lg cursor-pointer hover:bg-[#F5F9FF]"
              >
                <Checkbox checked={selection.includes(m.id)} onCheckedChange={() => basculer(m.id)} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-[#00122E] truncate">{m.nom}</span>
                  <span className="block text-xs text-[#335890] truncate">{m.email}</span>
                </span>
                <Badge
                  variant={getRoleBadgeVariant(m.role) as ComponentProps<typeof Badge>["variant"]}
                  className="text-xs"
                >
                  {getRoleLabel(m.role)}
                </Badge>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enCours}>
            Annuler
          </Button>
          <Button onClick={assigner} disabled={selection.length === 0 || enCours} className="gap-2">
            {enCours && <Loader2 className="w-4 h-4 animate-spin" />}
            Assigner{selection.length > 0 ? ` (${selection.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
