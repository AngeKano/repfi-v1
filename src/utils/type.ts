// src/utils/type.ts
// Types pour REPFI - Compatible Legacy (v2) + v3.0

// ============================================================
// TYPES LEGACY (v2) - Pour FusionGrandLivres.tsx et compatibilité
// ============================================================

export interface Transaction {
  Date_GL: string;
  Entite: string;
  Compte: string;
  Date: string;
  Code_Journal: string;
  Numero_Piece: string;
  Libelle_Ecriture: string;
  Debit: number;
  Credit: number;
  Solde: number;
}

export interface CompteData {
  Numero_Compte: string;
  Libelle_Compte: string;
  Periode: string;
  Transactions: Transaction[];
}

export interface TiersData {
  Compte_tiers: string;
  Type: string;
  Intitule_du_tiers: string;
  Centralisateur: string;
  Periode: string;
  Transactions: Transaction[];
}

export interface PlanTiers {
  Compte_tiers: string;
  Type: string;
  Intitule_du_tiers: string;
  Centralisateur: string;
  Periode: string;
}

export interface TransactionEnrichie extends Transaction {
  Compte_tiers?: string;
  Intitule_du_tiers?: string;
  Centralisateur?: string;
  Type?: string;
  Statut_Jointure: "Trouvé" | "Non trouvé";
}

export interface CompteEnrichi {
  Numero_Compte: string;
  Libelle_Compte: string;
  Periode: string;
  Transactions: TransactionEnrichie[];
}

export interface Stats {
  totalTransactionsComptes: number;
  transactionsAvecTiers: number;
  transactionsSansTiers: number;
  comptesTraites: number;
}

// ============================================================
// TYPES v3.0 - Grand Livre unifié
// ============================================================

export interface TransactionV3 {
  Date_GL: string;
  Entite: string;
  Compte: string;
  Intitule_Compte: string;
  Rubrique: string;
  Date_Transaction: string;
  Code_Journal: string;
  Numero_Piece: string;
  Numero_Facture: string;
  Libelle_Ecriture: string;
  N_Tiers: string;
  Intitule_Tiers: string;
  Type_Tiers: string;
  Debit: number;
  Credit: number;
  Solde: number;
  Periode: string;
  Batch_ID: string;
  Row_ID: number;
}

export interface CompteDataV3 {
  Numero_Compte: string;
  Intitule_Compte: string;
  Rubrique: string;
  Periode: string;
  Transactions: TransactionV3[];
  Total_Debit: number;
  Total_Credit: number;
  Solde_Final: number;
  Nb_Transactions: number;
  Nb_Avec_Tiers: number;
  Nb_Avec_Facture: number;
}

export interface TiersDataV3 {
  N_Tiers: string;
  Intitule_Tiers: string;
  Type_Tiers: string;
  Periode: string;
  Transactions: TransactionV3[];
  Total_Debit: number;
  Total_Credit: number;
  Solde_Final: number;
  Nb_Transactions: number;
}

export interface PlanTiersV3 {
  Compte_Tiers: string;
  Type: string;
  Intitule_Tiers: string;
}

export interface StatsV3 {
  totalTransactions: number;
  transactionsAvecTiers: number;
  transactionsSansTiers: number;
  transactionsAvecFacture: number;
  transactionsSansFacture: number;
  comptesTraites: number;
  comptesAvecRubrique: number;
  tiersUniques: number;
  tiersClients: number;
  tiersFournisseurs: number;
  totalDebit: number;
  totalCredit: number;
  equilibre: boolean;
  periode: string;
  dateExtraction: string;
}

// ============================================================
// TYPES COMMUNS
// ============================================================

export interface PlanCompte {
  Numero_Compte: string;
  Type: string;
  Intitule_Compte: string;
  Nature_Compte: string;
}

export interface CodeJournal {
  Code: string;
  Intitule: string;
  Type: string;
}

export interface BalanceRubrique {
  rubrique: string;
  totalDebit: number;
  totalCredit: number;
  solde: number;
  nbEcritures: number;
}

export interface GrandLivreParseResult {
  data: TransactionV3[];
  entite: string;
  periode: string;
  dateExtraction: string;
  stats: StatsV3;
  comptes: CompteDataV3[];
  tiers: TiersDataV3[];
  balanceParRubrique: BalanceRubrique[];
}

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

export type ProcessingStatus =
  | "PENDING"
  | "VALIDATING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

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

export type FileType =
  | "GRAND_LIVRE"
  | "PLAN_COMPTES"
  | "PLAN_TIERS"
  | "CODE_JOURNAL"
  | "GRAND_LIVRE_COMPTES"
  | "GRAND_LIVRE_TIERS";

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
// CONSTANTES
// ============================================================

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  GRAND_LIVRE: "Grand Livre Comptable",
  PLAN_COMPTES: "Plan Comptable",
  PLAN_TIERS: "Plan des Tiers",
  CODE_JOURNAL: "Codes Journaux",
  GRAND_LIVRE_COMPTES: "Grand Livre des Comptes (legacy)",
  GRAND_LIVRE_TIERS: "Grand Livre des Tiers (legacy)",
};

export const REQUIRED_FILE_TYPES: FileType[] = [
  "GRAND_LIVRE",
  "PLAN_COMPTES",
  "PLAN_TIERS",
  "CODE_JOURNAL",
];

export const RUBRIQUE_LABELS: Record<string, string> = {
  RA: "Achats de marchandises",
  RB: "Variations de stocks",
  RC: "Achats de matières premières",
  RD: "Variations de stocks matières",
  RE: "Autres achats",
  RF: "Variations de stocks autres",
  RG: "Transports",
  RH: "Services extérieurs",
  RI: "Impôts et taxes",
  RJ: "Autres charges",
  RK: "Charges de personnel",
  RL: "Dotations amortissements",
  RM: "Charges financières",
  RN: "Charges HAO",
  RO: "Participation travailleurs",
  RP: "Impôts sur le résultat",
  TA: "Ventes de marchandises",
  TB: "Ventes de produits fabriqués",
  TC: "Travaux et services vendus",
  TD: "Production stockée",
  TE: "Production immobilisée",
  TF: "Subventions exploitation",
  TG: "Autres produits",
  TH: "Reprises amortissements",
  TI: "Transferts de charges",
  TJ: "Produits financiers",
  TK: "Produits HAO",
  TL: "Reprises HAO",
};