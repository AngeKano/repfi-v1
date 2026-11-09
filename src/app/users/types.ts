// Données de la page Membres (calculées par la page serveur) et de ses fenêtres.

/** Un rôle tel que présenté dans les fenêtres. */
export interface InfoRole {
  id: string;
  description: string;
  /** Voit tous les dossiers de l'entreprise d'office (administrateurs). */
  voitTousLesDossiers: boolean;
}

/** Une ligne du tableau des membres, avec ce que l'utilisateur connecté peut y faire. */
export interface MembreLigne {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
  _count: { clientAssignments: number; normalFiles: number };
  voitTousLesDossiers: boolean;
  estMoi: boolean;
  peutModifier: boolean;
  peutChangerRole: boolean;
  peutChangerStatut: boolean;
  peutDesactiver: boolean;
}

/** Un dossier (client) attribuable. */
export interface DossierOption {
  id: string;
  name: string;
  denomination: string | null;
  isSelfEntity: boolean;
}

/** Droits de l'utilisateur connecté sur la page. */
export interface DroitsMembres {
  peutCreer: boolean;
  peutActiver: boolean;
  peutAssigner: boolean;
  peutRetirer: boolean;
}

/** Réponse de GET /api/users/:id utilisée par les fenêtres. */
export interface DetailMembre {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { clientAssignments: number; normalFiles: number };
  clientAssignments: { id: string; name: string; email: string; assignedAt: string }[];
}

export const nomMembre = (m: { firstName: string | null; lastName: string | null; email: string }) =>
  m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.email;
