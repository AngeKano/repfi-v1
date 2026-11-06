"use client";

// ============================================================================
// Visibilité du reporting pour le membre connecté, sur le dossier affiché :
// éléments masqués par un administrateur (onglet Membres) et droit d'export de
// la matrice. Sans fournisseur, tout est visible.
// ============================================================================
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import {
  idElement,
  ongletVisible,
  type OngletReportingId,
  type TypeElement,
} from "@/lib/reporting/elements";

interface ValeurVisibilite {
  masques: ReadonlySet<string>;
  peutExporter: boolean;
}

const Contexte = createContext<ValeurVisibilite>({ masques: new Set(), peutExporter: true });

export function VisibiliteProvider({
  masques,
  peutExporter,
  children,
}: {
  masques: string[];
  peutExporter: boolean;
  children: ReactNode;
}) {
  const valeur = useMemo(
    () => ({ masques: new Set(masques), peutExporter }),
    [masques, peutExporter],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useVisibilite() {
  const { masques, peutExporter } = useContext(Contexte);
  return useMemo(
    () => ({
      peutExporter,
      estVisible: (onglet: OngletReportingId, type: TypeElement, cle: string) =>
        !masques.has(idElement(onglet, type, cle)),
      ongletVisible: (onglet: string) => ongletVisible(onglet, masques),
    }),
    [masques, peutExporter],
  );
}
