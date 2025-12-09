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


// Compte tiers	Type	Intitulé du tiers	Centralisateur	Periode
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
