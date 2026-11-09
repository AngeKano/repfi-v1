// Réponse de GET /api/clients/[id]/membres (onglet Membres du dossier).

export interface MembreDossier {
  id: string;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
  /** Administrateur : accès d'office à tous les dossiers, ne peut pas être retiré. */
  dOffice: boolean;
  /** Attribué explicitement à ce dossier (LOADER, LOADER_PLUS, VIEWER). */
  assigne: boolean;
  assigneLe: string | null;
  /** La matrice des droits autorise son rôle à voir le reporting. */
  voitReporting: boolean;
  /** Ce que son rôle peut faire d'autre sur le reporting. */
  peutFiltrer: boolean;
  peutExporter: boolean;
  /** L'utilisateur connecté peut définir ce que ce membre voit. */
  peutRestreindre: boolean;
  /** Éléments masqués ; null si l'utilisateur connecté n'a pas à le savoir. */
  masques: string[] | null;
  modification: { le: string; par: string | null } | null;
}

export interface MembreDisponible {
  id: string;
  nom: string;
  email: string;
  role: string;
}

export interface DonneesMembres {
  moi: string;
  peutAssigner: boolean;
  peutRetirer: boolean;
  peutGerer: boolean;
  membres: MembreDossier[];
  disponibles: MembreDisponible[];
}
