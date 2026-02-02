/**
 * Définition de toutes les actions possibles dans l'application
 * Organisées par catégorie pour une meilleure lisibilité
 */

// ============================================
// ENTREPRISE
// ============================================
export const ENTREPRISE_ACTIONS = {
  CREER_COMPTE: "entreprise:creer_compte",
  VOIR_INFOS: "entreprise:voir_infos",
  MODIFIER_INFOS: "entreprise:modifier_infos",
} as const;

// ============================================
// ABONNEMENT
// ============================================
export const ABONNEMENT_ACTIONS = {
  SOUSCRIRE_PREMIER: "abonnement:souscrire_premier",
  ACTIVER: "abonnement:activer",
  DESACTIVER: "abonnement:desactiver",
  MODIFIER_PACK: "abonnement:modifier_pack",
  RENOUVELER: "abonnement:renouveler",
} as const;

// ============================================
// MEMBRES
// ============================================
export const MEMBRES_ACTIONS = {
  CREER: "membres:creer",
  ACTIVER: "membres:activer",
  MODIFIER: "membres:modifier",
  DESACTIVER: "membres:desactiver",
  VOIR: "membres:voir",
} as const;

// ============================================
// CLIENTS (Dossiers)
// ============================================
export const CLIENTS_ACTIONS = {
  CREER: "clients:creer",
  MODIFIER: "clients:modifier",
  ACTIVER: "clients:activer",
  DESACTIVER: "clients:desactiver",
  VOIR_TOUS: "clients:voir_tous",
  ASSIGNER_MEMBRE: "clients:assigner_membre",
  RETIRER_MEMBRE: "clients:retirer_membre",
} as const;

// ============================================
// FICHIERS
// ============================================
export const FICHIERS_ACTIONS = {
  CHARGER: "fichiers:charger",
  VOIR: "fichiers:voir",
  EXPORTER_FINAUX: "fichiers:exporter_finaux",
  SUPPRIMER: "fichiers:supprimer",
  VOIR_HISTORIQUE: "fichiers:voir_historique",
} as const;

// ============================================
// REPORTING
// ============================================
export const REPORTING_ACTIONS = {
  CREER: "reporting:creer",
  VOIR: "reporting:voir",
  FILTRER: "reporting:filtrer",
  MODIFIER: "reporting:modifier",
  SUPPRIMER: "reporting:supprimer",
  EXPORTER: "reporting:exporter",
} as const;

// Type union de toutes les actions
export type EntrepriseAction =
  (typeof ENTREPRISE_ACTIONS)[keyof typeof ENTREPRISE_ACTIONS];
export type AbonnementAction =
  (typeof ABONNEMENT_ACTIONS)[keyof typeof ABONNEMENT_ACTIONS];
export type MembresAction =
  (typeof MEMBRES_ACTIONS)[keyof typeof MEMBRES_ACTIONS];
export type ClientsAction =
  (typeof CLIENTS_ACTIONS)[keyof typeof CLIENTS_ACTIONS];
export type FichiersAction =
  (typeof FICHIERS_ACTIONS)[keyof typeof FICHIERS_ACTIONS];
export type ReportingAction =
  (typeof REPORTING_ACTIONS)[keyof typeof REPORTING_ACTIONS];

export type PermissionAction =
  | EntrepriseAction
  | AbonnementAction
  | MembresAction
  | ClientsAction
  | FichiersAction
  | ReportingAction;

// Export groupé de toutes les actions
export const ACTIONS = {
  ...ENTREPRISE_ACTIONS,
  ...ABONNEMENT_ACTIONS,
  ...MEMBRES_ACTIONS,
  ...CLIENTS_ACTIONS,
  ...FICHIERS_ACTIONS,
  ...REPORTING_ACTIONS,
} as const;

// Liste de toutes les actions pour validation
export const ALL_ACTIONS: PermissionAction[] = [
  ...Object.values(ENTREPRISE_ACTIONS),
  ...Object.values(ABONNEMENT_ACTIONS),
  ...Object.values(MEMBRES_ACTIONS),
  ...Object.values(CLIENTS_ACTIONS),
  ...Object.values(FICHIERS_ACTIONS),
  ...Object.values(REPORTING_ACTIONS),
];

/**
 * Catégories d'actions pour l'affichage UI
 */
export const ACTION_CATEGORIES = {
  ENTREPRISE: {
    label: "Entreprise",
    actions: Object.values(ENTREPRISE_ACTIONS),
  },
  ABONNEMENT: {
    label: "Abonnement",
    actions: Object.values(ABONNEMENT_ACTIONS),
  },
  MEMBRES: {
    label: "Membres",
    actions: Object.values(MEMBRES_ACTIONS),
  },
  CLIENTS: {
    label: "Clients (Dossiers)",
    actions: Object.values(CLIENTS_ACTIONS),
  },
  FICHIERS: {
    label: "Fichiers",
    actions: Object.values(FICHIERS_ACTIONS),
  },
  REPORTING: {
    label: "Reporting",
    actions: Object.values(REPORTING_ACTIONS),
  },
} as const;

/**
 * Labels lisibles pour chaque action
 */
export const ACTION_LABELS: Record<PermissionAction, string> = {
  // Entreprise
  [ENTREPRISE_ACTIONS.CREER_COMPTE]: "Créer un compte",
  [ENTREPRISE_ACTIONS.VOIR_INFOS]: "Voir infos entreprise",
  [ENTREPRISE_ACTIONS.MODIFIER_INFOS]: "Modifier infos entreprise",

  // Abonnement
  [ABONNEMENT_ACTIONS.SOUSCRIRE_PREMIER]: "Souscrire 1er abonnement",
  [ABONNEMENT_ACTIONS.ACTIVER]: "Activer un abonnement",
  [ABONNEMENT_ACTIONS.DESACTIVER]: "Désactiver un abonnement",
  [ABONNEMENT_ACTIONS.MODIFIER_PACK]: "Modifier abonnement (Pack)",
  [ABONNEMENT_ACTIONS.RENOUVELER]: "Renouveler un abonnement",

  // Membres
  [MEMBRES_ACTIONS.CREER]: "Créer un membre (user)",
  [MEMBRES_ACTIONS.ACTIVER]: "Activer un membre (affecter licence)",
  [MEMBRES_ACTIONS.MODIFIER]: "Modifier un membre",
  [MEMBRES_ACTIONS.DESACTIVER]: "Désactiver un membre",
  [MEMBRES_ACTIONS.VOIR]: "Voir les membres",

  // Clients
  [CLIENTS_ACTIONS.CREER]: "Créer un client",
  [CLIENTS_ACTIONS.MODIFIER]: "Modifier un client",
  [CLIENTS_ACTIONS.ACTIVER]: "Activer un client",
  [CLIENTS_ACTIONS.DESACTIVER]: "Désactiver un client",
  [CLIENTS_ACTIONS.VOIR_TOUS]: "Voir tous les clients",
  [CLIENTS_ACTIONS.ASSIGNER_MEMBRE]: "Assigner un membre",
  [CLIENTS_ACTIONS.RETIRER_MEMBRE]: "Retirer un membre",

  // Fichiers
  [FICHIERS_ACTIONS.CHARGER]: "Charger des fichiers",
  [FICHIERS_ACTIONS.VOIR]: "Voir fichiers chargés",
  [FICHIERS_ACTIONS.EXPORTER_FINAUX]: "Exporter fichiers finaux",
  [FICHIERS_ACTIONS.SUPPRIMER]: "Supprimer fichiers chargés",
  [FICHIERS_ACTIONS.VOIR_HISTORIQUE]: "Voir historique fichiers",

  // Reporting
  [REPORTING_ACTIONS.CREER]: "Créer un rapport/dashboard",
  [REPORTING_ACTIONS.VOIR]: "Voir un rapport/dashboard",
  [REPORTING_ACTIONS.FILTRER]: "Filtrer un rapport/dashboard",
  [REPORTING_ACTIONS.MODIFIER]: "Modifier un rapport/dashboard",
  [REPORTING_ACTIONS.SUPPRIMER]: "Supprimer un rapport/dashboard",
  [REPORTING_ACTIONS.EXPORTER]: "Exporter un rapport/dashboard",
};
