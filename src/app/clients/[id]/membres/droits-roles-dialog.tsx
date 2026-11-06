"use client";

// Fenêtre « Droits par rôle » : la matrice des droits, lue directement dans le
// code qui l'applique. Même contenu que le document « Accès » (docs/acces.pdf).

import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTION_CATEGORIES, ACTION_LABELS, type PermissionAction } from "@/lib/permissions/actions";
import { hasPermission } from "@/lib/permissions/matrix";
import { getAllRoles } from "@/lib/permissions/roles";

export function DroitsRolesDialog({ onClose }: { onClose: () => void }) {
  const roles = getAllRoles().sort((a, b) => a.level - b.level);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Droits par rôle</DialogTitle>
          <DialogDescription>
            Ce que chaque rôle peut faire dans Click Insight. Le rôle d&apos;un membre se modifie
            depuis la page Membres de l&apos;application.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto border border-[#D0E3F5] rounded-xl">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F5F9FF]">
                <th className="text-left px-3 py-2 text-xs font-semibold text-[#335890] uppercase border-b border-[#D0E3F5]">
                  Droit
                </th>
                {roles.map((r) => (
                  <th
                    key={r.id}
                    title={r.description}
                    className="px-2 py-2 text-[11px] font-semibold text-[#335890] border-b border-[#D0E3F5] text-center whitespace-nowrap"
                  >
                    {r.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.values(ACTION_CATEGORIES).map((categorie) => (
                <Fragment key={categorie.label}>
                  <tr>
                    <td
                      colSpan={roles.length + 1}
                      className="px-3 py-1.5 text-xs font-semibold text-[#00122E] bg-[#EBF5FF]"
                    >
                      {categorie.label}
                    </td>
                  </tr>
                  {(categorie.actions as readonly PermissionAction[]).map((action) => (
                    <tr key={action} className="border-t border-[#EEF2F7]">
                      <td className="px-3 py-1.5 text-[#00122E]">{ACTION_LABELS[action]}</td>
                      {roles.map((r) => (
                        <td key={r.id} className="px-2 py-1.5 text-center">
                          {hasPermission(r.id, action) ? (
                            <Check className="inline w-4 h-4 text-emerald-600" aria-label="Autorisé" />
                          ) : (
                            <Minus className="inline w-4 h-4 text-slate-300" aria-label="Non autorisé" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
