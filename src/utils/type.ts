// types/comptable.ts
// Types pour le format v3.0 - Grand Livre unifié avec tiers et factures intégrés

// ============================================================
// TRANSACTION (format v3.0)
// ============================================================
export interface Transaction {
  Date_GL: string;           // Date d'extraction du grand livre
  Entite: string;            // Nom de l'entité
  Compte: string;            // Numéro de compte (6 chiffres)
  Intitule_Compte: string;   // Libellé du compte
  Rubrique: string;          // Rubrique OHADA (ex: RA, RB, TA, TB...)
  Date_Transaction: string;  // Date de la transaction
  Code_Journal: string;      // Code journal (ACH, VTE, CAIS, etc.)
  Numero_Piece: string;      // Numéro de pièce
  Numero_Facture: string;    // N° facture (NOUVEAU v3.0)
  Libelle_Ecriture: string;  // Libellé de l'écriture
  N_Tiers: string;           // N° tiers (NOUVEAU v3.0 - intégré directement)
  Intitule_Tiers: string;    // Intitulé du tiers (enrichi depuis plan_tiers)
  Type_Tiers: string;        // Type: Client | Fournisseur (enrichi)
  Debit: number;
  Credit: number;
  Solde: number;
  Periode: string;           // YYYYMM
  Batch_ID: string;
  Row_ID: number;
}

// ============================================================
// COMPTE (groupement par compte)
// ============================================================
export interface CompteData {
  Numero_Compte: string;
  Intitule_Compte: string;
  Rubrique: string;
  Periode: string;
  Transactions: Transaction[];
  // Stats calculées
  Total_Debit: number;
  Total_Credit: number;
  Solde_Final: number;
  Nb_Transactions: number;
  Nb_Avec_Tiers: number;
  Nb_Avec_Facture: number;
}

// ============================================================
// TIERS (groupement par tiers)
// ============================================================
export interface TiersData {
  N_Tiers: string;
  Intitule_Tiers: string;
  Type_Tiers: string;        // Client | Fournisseur
  Periode: string;
  Transactions: Transaction[];
  // Stats calculées
  Total_Debit: number;
  Total_Credit: number;
  Solde_Final: number;
  Nb_Transactions: number;
}

// ============================================================
// PLAN COMPTABLE
// ============================================================
export interface PlanCompte {
  Numero_Compte: string;
  Type: string;              // Détail | Total
  Intitule_Compte: string;
  Nature_Compte: string;     // Capitaux, Immobilisation, etc.
}

// ============================================================
// PLAN TIERS
// ============================================================
export interface PlanTiers {
  Compte_Tiers: string;
  Type: string;              // Client | Fournisseur
  Intitule_Tiers: string;
}

// ============================================================
// CODE JOURNAL
// ============================================================
export interface CodeJournal {
  Code: string;
  Intitule: string;
  Type: string;              // Achats, Ventes, Trésorerie, Général
}

// ============================================================
// STATISTIQUES GLOBALES
// ============================================================
export interface Stats {
  // Transactions
  totalTransactions: number;
  transactionsAvecTiers: number;
  transactionsSansTiers: number;
  transactionsAvecFacture: number;
  transactionsSansFacture: number;
  
  // Comptes
  comptesTraites: number;
  comptesAvecRubrique: number;
  
  // Tiers
  tiersUniques: number;
  tiersClients: number;
  tiersFournisseurs: number;
  
  // Montants
  totalDebit: number;
  totalCredit: number;
  equilibre: boolean;
  
  // Périodes
  periode: string;
  dateExtraction: string;
}

// ============================================================
// BALANCE PAR RUBRIQUE (pour reporting OHADA)
// ============================================================
export interface BalanceRubrique {
  rubrique: string;
  totalDebit: number;
  totalCredit: number;
  solde: number;
  nbEcritures: number;
}

// ============================================================
// RÉSULTAT PARSING GRAND LIVRE
// ============================================================
export interface GrandLivreParseResult {
  data: Transaction[];
  entite: string;
  periode: string;
  dateExtraction: string;
  stats: Stats;
  comptes: CompteData[];
  tiers: TiersData[];
  balanceParRubrique: BalanceRubrique[];
}

// ============================================================
// PÉRIODE COMPTABLE
// ============================================================
export interface ComptablePeriod {
  id: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  year: number;
  batchId: string;
  status: ProcessingStatus;
  progress: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// STATUTS DE TRAITEMENT
// ============================================================
export type ProcessingStatus = 
  | 'PENDING' 
  | 'VALIDATING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED';

// ============================================================
// FICHIER COMPTABLE
// ============================================================
export interface ComptableFile {
  id: string;
  fileName: string;
  fileType: FileType;
  fileYear: number;
  s3Key: string;
  s3Url: string;
  fileSize: number;
  mimeType: string;
  status: string;
  processingStatus: ProcessingStatus;
  batchId: string;
  periodStart: string;
  periodEnd: string;
  clientId: string;
  periodId?: string;
}

// ============================================================
// TYPES DE FICHIERS (format v3.0)
// ============================================================
export type FileType = 
  | 'GRAND_LIVRE'      // Nouveau: fichier unifié
  | 'PLAN_COMPTES'
  | 'PLAN_TIERS'
  | 'CODE_JOURNAL'
  // Types legacy (pour compatibilité avec anciennes données)
  | 'GRAND_LIVRE_COMPTES'
  | 'GRAND_LIVRE_TIERS';

// ============================================================
// RÉPONSE API UPLOAD
// ============================================================
export interface UploadResponse {
  message: string;
  batchId: string;
  period: {
    id: string;
    start: string;
    end: string;
    year: number;
  };
  s3Prefix: string;
  files: ComptableFile[];
  comptablePeriod: ComptablePeriod;
  fileFormat: {
    version: string;
    description: string;
    requiredFiles: { type: FileType; label: string }[];
  };
}

// ============================================================
// HELPERS
// ============================================================

// Labels des types de fichiers
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  GRAND_LIVRE: 'Grand Livre Comptable',
  PLAN_COMPTES: 'Plan Comptable',
  PLAN_TIERS: 'Plan des Tiers',
  CODE_JOURNAL: 'Codes Journaux',
  // Legacy
  GRAND_LIVRE_COMPTES: 'Grand Livre des Comptes (legacy)',
  GRAND_LIVRE_TIERS: 'Grand Livre des Tiers (legacy)',
};

// Types de fichiers requis (format v3.0)
export const REQUIRED_FILE_TYPES: FileType[] = [
  'GRAND_LIVRE',
  'PLAN_COMPTES',
  'PLAN_TIERS',
  'CODE_JOURNAL',
];

// Mapping des rubriques OHADA
export const RUBRIQUE_LABELS: Record<string, string> = {
  // Charges
  RA: 'Achats de marchandises',
  RB: 'Variations de stocks',
  RC: 'Achats de matières premières',
  RD: 'Variations de stocks matières',
  RE: 'Autres achats',
  RF: 'Variations de stocks autres',
  RG: 'Transports',
  RH: 'Services extérieurs',
  RI: 'Impôts et taxes',
  RJ: 'Autres charges',
  RK: 'Charges de personnel',
  RL: 'Dotations amortissements',
  RM: 'Charges financières',
  RN: 'Charges HAO',
  RO: 'Participation travailleurs',
  RP: 'Impôts sur le résultat',
  // Produits
  TA: 'Ventes de marchandises',
  TB: 'Ventes de produits fabriqués',
  TC: 'Travaux et services vendus',
  TD: 'Production stockée',
  TE: 'Production immobilisée',
  TF: 'Subventions exploitation',
  TG: 'Autres produits',
  TH: 'Reprises amortissements',
  TI: 'Transferts de charges',
  TJ: 'Produits financiers',
  TK: 'Produits HAO',
  TL: 'Reprises HAO',
};
