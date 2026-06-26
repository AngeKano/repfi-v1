# 📊 REPFI — Catalogue complet des métriques du Reporting

> Référence technique exhaustive de toutes les métriques calculées et affichées
> dans le module Reporting de REPFI. Plan comptable **SYSCOHADA révisé**.
>
> Pour chaque métrique : description, formule de calcul, comptes / rubriques
> mobilisés, unité, mode de calcul applicable, fichier source.

---

## Table des matières

1. [Architecture & sources de données](#1-architecture--sources-de-données)
2. [Plan comptable SYSCOHADA : rappels](#2-plan-comptable-syscohada--rappels)
3. [Modes de calcul & granularités](#3-modes-de-calcul--granularités)
4. [Rubriques OHADA — charges (classe 6)](#4-rubriques-ohada--charges-classe-6)
5. [Rubriques OHADA — produits (classe 7)](#5-rubriques-ohada--produits-classe-7)
6. [Soldes Intermédiaires de Gestion (SIG)](#6-soldes-intermédiaires-de-gestion-sig)
7. [Chiffre d'affaires](#7-chiffre-daffaires)
8. [Charges vs Produits](#8-charges-vs-produits)
9. [Trésorerie](#9-trésorerie)
10. [Recouvrement clients](#10-recouvrement-clients)
11. [Dettes](#11-dettes)
12. [Tunnel de rentabilité](#12-tunnel-de-rentabilité)
13. [KPI configurables](#13-kpi-configurables)
14. [Variations N vs N-1](#14-variations-n-vs-n-1)
15. [Endpoints API & schémas de réponse](#15-endpoints-api--schémas-de-réponse)
16. [Composition par onglet UI](#16-composition-par-onglet-ui)
17. [Schéma ClickHouse `grand_livre`](#17-schéma-clickhouse-grand_livre)

---

## 1. Architecture & sources de données

### Sources

| Source | Rôle |
|---|---|
| **ClickHouse** — table `${dbName}.grand_livre` | Source de vérité pour toutes les écritures comptables. |
| **Postgres (Prisma)** — `ComptablePeriod` | Métadonnées des périodes importées (`batchId`, dates de période). |

### Pipelines

```
ClickHouse grand_livre
        │
        ▼
┌──────────────────────────────────────────┐
│  src/app/api/clients/[id]/reporting/     │
│  ├── route.ts          (synthèse, CA, résultats, KPI, SIG, charges/produits)
│  ├── recouvrement/route.ts   (créances 41*, taux, Top 10)
│  └── dettes/route.ts         (dettes 40*/42-45*, taux remboursement, Top)
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│  src/components/reporting/                │
│  ├── client-reporting-chart.tsx           (Synthèse, CA, Résultats, Recouvrement)
│  ├── client-dettes-tab.tsx                (Dettes)
│  └── client-bilan-tab.tsx                 (Bilan d'activité — rapport narratif)
└──────────────────────────────────────────┘
```

### Champs clés ClickHouse `grand_livre`

| Colonne | Type | Rôle |
|---|---|---|
| `date_transaction` | string (`DD/MM/YYYY`) | Extraction mois (`substring(date_transaction, 4, 2)`) et année (`substring(date_transaction, 7, 4)`). |
| `compte` | string (ex. `411001`) | Numéro de compte SYSCOHADA. |
| `debit` / `credit` | number | Mouvements bruts. |
| `rubrique` | string (`TA`, `RK`, …) | Rubrique du compte de résultat. |
| `bilan_rubrique` | string (`DJ`, `DK1`, …) | Rubrique du bilan (dettes). |
| `n_tiers` | string | Numéro du tiers (groupage Top 10). |
| `intitule_tiers` | string | Libellé du client/fournisseur. |
| `intitule_compte` | string | Libellé du compte. |
| `numero_piece` | string | Numéro de pièce comptable (rapprochement HT ↔ TTC). |
| `batch_id` | string | ID du batch d'import (jointure avec `ComptablePeriod`). |

---

## 2. Plan comptable SYSCOHADA : rappels

### Classes utilisées par REPFI

| Classe | Libellé | Utilisée pour |
|---|---|---|
| **40** | Fournisseurs | Dettes fournisseurs (rubrique DJ) |
| **41** | Clients | Créances TTC, Recouvrement (hors **418** & **419**) |
| **42** | Personnel | Dettes personnel (rubrique DK1) |
| **43** | Sociales | Dettes sociales (rubrique DK2) |
| **44** | Fiscales | Dettes fiscales (rubrique DK3) |
| **45** | HAO (bilan) | Dettes HAO (rubrique DH) |
| **52** | Banques | Trésorerie |
| **57** | Caisse | Trésorerie |
| **6x** | Charges | Tunnel, charges, SIG |
| **7x** | Produits | CA, tunnel, produits, SIG |

### Exclusions obligatoires (comptes "douteux")

- **418** Clients - Produits non encore facturés
- **419** Clients créditeurs et avances reçues

Ces deux préfixes sont **systématiquement exclus** de tous les calculs Recouvrement et CA TTC (créances). Filtre SQL standard :

```sql
AND startsWith(compte, '41')
AND NOT startsWith(compte, '418')
AND NOT startsWith(compte, '419')
```

---

## 3. Modes de calcul & granularités

L'application expose 4 combinaisons (`periodType`) :

| `periodType` | Mode | Granularité | Baseline | Couvre |
|---|---|---|---|---|
| `year` | Périodique | Mensuelle | 0 | 12 mois (Jan → Déc) |
| `month` | Périodique | Journalière | 0 | 1 mois sélectionné (jour par jour) |
| `ytd` | Cumulé | Mensuelle | 0 | Jan → mois sélectionné |
| `ytd-day` | Cumulé | Journalière | cumul Jan → M-1 | Jours du mois sélectionné avec valeur initiale = cumul des mois précédents |

L'**onglet Dettes** et l'**onglet Recouvrement** verrouillent le mode sur Cumulé (`ytd` ou `ytd-day`).

L'**onglet Bilan d'activité** est **toujours cumulé**, indépendamment du choix utilisateur.

---

## 4. Rubriques OHADA — charges (classe 6)

Source : `recupererRubriquesParMois()` / `recupererRubriquesParJour()` dans
[reporting/route.ts](src/app/api/clients/[id]/reporting/route.ts).

**Convention : `solde = debit − credit`** (positif = charge réelle).

| Rubrique | Libellé | Comptes | Description |
|---|---|---|---|
| **RA** | Achats de marchandises | 60* | Achats destinés à être revendus en l'état. |
| **RB** | Variations de stocks marchandises | — | Δ stock marchandises (60*). |
| **RC** | Achats de matières premières | 60* | Matières destinées à la production. |
| **RD** | Variations de stocks matières | — | Δ stock matières. |
| **RE** | Autres achats | 60* | Fournitures non stockables, énergie, etc. |
| **RF** | Variations de stocks autres approv. | — | Δ stock autres. |
| **RG** | Transports | 60* / 61* | Transports sur achats, ventes, personnel. |
| **RH** | Services extérieurs | 61* / 62* | Loyers, entretien, primes d'assurance, etc. |
| **RI** | Impôts et taxes | 64* | Patente, taxes, droits d'enregistrement. |
| **RJ** | Autres charges d'exploitation | 65* | Pertes sur créances, dons, etc. |
| **RK** | Charges de personnel | 66* | Salaires, charges sociales (= masse salariale). |
| **RL** | Dotations aux amortissements & provisions | 68* | Charges calculées (non décaissables). |
| **RM** | Charges financières | 67* | Intérêts, agios, escomptes, pertes de change. |
| **RN** | Charges HAO | 83* / 85* | Charges Hors Activités Ordinaires. |
| **RO** | Participation des travailleurs | 87* | Intéressement obligatoire. |
| **RP** | Impôts sur le résultat | 89* | IS / IBIC. |
| **RQ** | (Charge complémentaire) | — | Variante. |
| **RS** | Impôts sur le résultat (variante) | 89* | Utilisé par `impotResultat`. |

---

## 5. Rubriques OHADA — produits (classe 7)

**Convention : `solde = credit − debit`** (positif = produit réel).

| Rubrique | Libellé | Comptes | Description |
|---|---|---|---|
| **TA** | Ventes de marchandises | 701* | Revente en l'état. |
| **TB** | Ventes de produits fabriqués | 702* | Production vendue. |
| **TC** | Travaux et services vendus | 703* / 706* | Prestations. **Détaillé compte par compte** dans "CA par Nature". |
| **TD** | Produits accessoires / variations production | 707* / 73* | Annexes à l'activité. |
| **TE** | Production immobilisée | 72* | Immobilisations réalisées par l'entreprise. |
| **TF** | Subventions d'exploitation | 71* | Subventions reçues. |
| **TG** | Autres produits d'exploitation | 75* | Divers exploitation. |
| **TH** | Reprises d'amortissements & provisions | 78* | Produits calculés. |
| **TI** | Transferts de charges | 78* | Refacturation/affectation. |
| **TJ** | Produits financiers | 77* | Intérêts perçus, gains de change. |
| **TK** | Produits HAO | 82* / 84* | Hors Activités Ordinaires. |
| **TL** | Reprises HAO | 86* | Reprises sur provisions HAO. |
| **TM** | (Produit complémentaire) | — | Variante. |

---

## 6. Soldes Intermédiaires de Gestion (SIG)

Calculés par `calculerSIG()` dans
[reporting/route.ts](src/app/api/clients/[id]/reporting/route.ts).
Combine des rubriques pour produire l'arborescence du résultat.

| Sigle | Libellé | Formule | Sens économique |
|---|---|---|---|
| **XA** | Marge commerciale | `TA + RA + RB` | Marge sur revente marchandises. |
| **XB** | Chiffre d'affaires | `TA + TB + TC + TD` | CA brut SYSCOHADA. |
| **XC** | Valeur ajoutée | `XA + TB + TC + TD + TE + TF + TG + TH + TI + RC + RD + RE + RF + RG + RH + RI + RJ` | Richesse créée avant rémunération des facteurs. |
| **XD** | EBE (Excédent Brut d'Exploitation) | `XC + RK` | VA moins charges de personnel. |
| **XE** | Résultat d'exploitation | `XD + TJ + RL` | EBE + ajustements (amortissements/produits financiers de classe 73). |
| **XF** | Résultat financier | `TK + TL + TM + RM + RN` | Hors exploitation (financier strict). |
| **XG** | Résultat courant | `XE + XF` | Avant HAO. |
| **XH** | Résultat HAO | `TN + TO + RO + RP` | Hors Activités Ordinaires. |
| **XI** | Résultat net | `XG + XH + RQ + RS` | Résultat final après impôt. |

> ⚠️ Les signes des rubriques charges (R*) sont déjà négatifs dans le SQL via
> `debit − credit`. Les sommes ci-dessus s'appliquent telles quelles.

---

## 7. Chiffre d'affaires

### Variantes

| Métrique | Clé JSON | Formule | Comptes | Mode |
|---|---|---|---|---|
| **CA HT** (assujetti TVA) | `chiffreAffaires` | `sig.XB` (somme rubriques 70*) | 70* | Cumulé par défaut |
| **CA TTC** (non assujetti TVA) | `chiffreAffaires` | `sum(debit) compte 41*` (hors 418, 419) | 41* (hors 418/419) | Cumulé par défaut |
| **CA périodique** | `chiffreAffairesPeriodique` | CA du mois/jour seul (non cumulé) | idem | Périodique |
| **CA cumulé YTD** | `chiffreAffaires` | Cumul Jan → mois sélectionné | idem | Cumulé |
| **CA N-1** | `chiffreAffairesN1` / `chiffreAffairesPeriodiqueN1` | Même formule appliquée à l'année précédente | idem | Comparatif |

### CA par Nature

Décomposition des comptes appartenant à la rubrique TC (Travaux & services
vendus), avec comparaison N vs N-1.

- **Calcul** : `sum(credit - debit)` par `compte` où `rubrique = 'TC'`
- **Source** : `recupererCAParNature()` dans `reporting/route.ts`
- **UI** : composant `CAParNature` dans `client-reporting-chart.tsx`
- **Couleurs** : N en `hsl(221,83%,53%)` (bleu foncé), N-1 en `hsl(221,83%,73%)` (bleu clair).

### Détermination du mode "assujetti TVA"

- Client `assujettiTVA = true` → CA = `sig.XB` (rubriques 70*).
- Client `assujettiTVA = false` → CA = total des débits compte 41* (créances TTC, hors 418/419).

---

## 8. Charges vs Produits

**Composant** : `ChargesVsProduits` dans `client-reporting-chart.tsx`
(remplace le Tunnel dans l'onglet **Synthèse Financière**).

| Série | Couleur | Comptes pris en compte | Formule API | Mode périodique | Mode cumulé |
|---|---|---|---|---|---|
| **Charges** | `hsl(221, 83%, 53%)` bleu foncé | **6\*** (exploitation) + **81\*, 83\*, 85\*, 87\*, 89\*** (HAO) | `sum(CASE WHEN startsWith(compte,'6') OR startsWith(compte,'81') OR startsWith(compte,'83') OR startsWith(compte,'85') OR startsWith(compte,'87') OR startsWith(compte,'89') THEN debit - credit ELSE 0 END)` par période | Valeur du mois/jour seul | **Running sum** frontend (cumul Jan → période courante) |
| **Produits** | `hsl(221, 83%, 73%)` bleu clair | **7\*** (exploitation) + **82\*, 84\*, 86\*, 88\*** (HAO) | `sum(CASE WHEN startsWith(compte,'7') OR startsWith(compte,'82') OR startsWith(compte,'84') OR startsWith(compte,'86') OR startsWith(compte,'88') THEN credit - debit ELSE 0 END)` par période | Valeur du mois/jour seul | Running sum frontend |

**Détail des comptes HAO inclus (SYSCOHADA — Hors Activités Ordinaires) :**

| Compte | Type | Libellé |
|---|---|---|
| **81** | Charges | Valeurs comptables des cessions d'immobilisations |
| **82** | Produits | Produits des cessions d'immobilisations |
| **83** | Charges | Charges HAO |
| **84** | Produits | Produits HAO |
| **85** | Charges | Dotations HAO |
| **86** | Produits | Reprises HAO |
| **87** | Charges | Participation des travailleurs |
| **88** | Produits | Subventions d'équilibre |
| **89** | Charges | Impôts sur le résultat |

**Note** : les charges/produits stockés dans `chartData[i]` sont toujours
**périodiques** (valeur de la période). Le frontend les agrège en cumul quand
`periodType ∈ {ytd, ytd-day}`.

**Affichage** : `LineChart` (recharts), 2 lignes, axe Y en M FCFA.

---

## 9. Trésorerie

| Métrique | Clé JSON | Formule | Comptes |
|---|---|---|---|
| **Solde de trésorerie** | `soldeTresorerie` | `sum(CASE WHEN startsWith(compte,'52') OR startsWith(compte,'57') THEN debit - credit ELSE 0 END)` | 52* (banques), 57* (caisse) |
| **Solde N-1** | `soldeTresorerieN1` | idem année précédente | 52* + 57* |

**Spécificité** : la chart **Évolution de la Trésorerie** est **toujours cumulée**, indépendamment du mode choisi. La granularité (mois ou jour) suit le `periodType`.

- `periodType=year` → mois par mois cumulés (Jan → Déc)
- `periodType=month` → jour par jour cumulés intra-mois (baseline = 0)
- `periodType=ytd` → mois par mois cumulés Jan → endMonth
- `periodType=ytd-day` → jour par jour avec baseline = cumul Jan → M-1

**Backend** : `recupererTresorerieParMois()`, `recupererTresorerieParJour()`.

---

## 10. Recouvrement clients

**Endpoint** : `GET /api/clients/[id]/reporting/recouvrement?endPeriod=YYYY-MM&startPeriod=YYYY-MM`

### Métriques

| Métrique | Clé JSON | Formule | Comptes |
|---|---|---|---|
| **Créances Clients TTC** | `caTTCTotal` | `sum(debit)` compte 41* (hors 418/419), période donnée | 41* (hors 418/419) |
| **Encaissements Clients TTC** | `caEncaisseTTC` | `sum(credit)` compte 41* (hors 418/419), période donnée | 41* (hors 418/419) |
| **Taux périodique** | `tauxRecouvrement` | `(caEncaisseTTC / caTTCTotal) × 100` (sur le mois seul) | — |
| **Taux cumulé** | `tauxRecouvrementCumule` | `(cumulativeCaEncaisse / cumulativeCaTTC) × 100` (cumul Jan → endMonth) | — |
| **Solde créances** | `soldeCreances` | `cumulativeCaTTC - cumulativeCaEncaisse` | — |

### Top 10 Créances

- **Filtre** : `compte 41*` hors 418/419 + `n_tiers != ''` + `intitule_tiers != ''`
- **Calcul** : `sum(debit) - sum(credit)` par tiers, seuls les soldes > 0
- **Tri** : `ORDER BY solde_creance DESC LIMIT 10`
- **Fenêtre** : `concat(year, month) ≥ startYM AND concat(year, month) ≤ endYM`
- **Backend** : `recupererTop10Creances()` dans `recouvrement/route.ts`

### Mode

- Onglet Recouvrement **verrouillé sur Cumulé** (Mode select disabled).
- Le graphe principal **Évolution du Taux de Recouvrement** affiche les deux courbes (taux cumulé + taux périodique).
- Le **Top 10** et le graphe **Créances vs Encaissements** suivent le filtre période (mode, granularité, mois).

---

## 11. Dettes

**Endpoint** : `GET /api/clients/[id]/reporting/dettes?endPeriod=YYYY-MM&startPeriod=YYYY-MM&mode=cumule&granularity=month|day`

### Rubriques de dette (bilan)

Convention : `dette née = sum(credit)`, `remboursée = sum(debit)`, `solde = credit - debit`.

| Rubrique | Libellé | Comptes |
|---|---|---|
| **DJ** | Dettes fournisseurs | 40* |
| **DK1** | Dettes personnel | 42* |
| **DK2** | Dettes sociales | 43* |
| **DK3** | Dettes fiscales | 44* |
| **DH** | Dettes HAO | 45* |

### KPI agrégés (sur Jan → endMonth)

| Métrique | Clé JSON | Formule |
|---|---|---|
| **Dettes fournisseurs** | `dettesFournisseurs` | `sum(credit - debit)` rubrique `DJ` |
| **Dettes personnel** | `dettesPersonnel` | `sum(credit - debit)` rubrique `DK1` |
| **Dettes sociales** | `dettesSociales` | `sum(credit - debit)` rubrique `DK2` |
| **Dettes fiscales** | `dettesFiscales` | `sum(credit - debit)` rubrique `DK3` |
| **Dettes HAO** | `dettesHAO` | `sum(credit - debit)` rubrique `DH` |
| **Taux de remboursement** | `tauxRemboursement` | `(cumulRembourseTotal / cumulDetteNeeTotal) × 100` |

### Données chart

| Champ | Description | Mode |
|---|---|---|
| `detteFournisseurNee` | Crédit DJ du jour/mois | Périodique |
| `detteFournisseurRemboursee` | Débit DJ du jour/mois | Périodique |
| `detteNeeTotal` | Crédit total toutes rubriques de dette | Périodique |
| `rembourseTotal` | Débit total toutes rubriques de dette | Périodique |
| `tauxRemboursement` | `rembourseTotal / detteNeeTotal × 100` | Périodique |
| `cumulDetteNeeTotal` | Cumul de `detteNeeTotal` | Cumulé |
| `cumulRembourseTotal` | Cumul de `rembourseTotal` | Cumulé |
| `tauxRemboursementCumule` | `cumul.../cumul... × 100` | Cumulé |

### Tops

- **Top par type** : `recupererTopParType()` — agrège par rubrique (DJ, DK1, DK2, DK3, DH).
- **Top par fournisseur** : `recupererTopParFournisseur()` — agrège la rubrique DJ par `n_tiers`.

### Mode

- Onglet Dettes **verrouillé sur Cumulé** (Mode select disabled).
- Granularité Mois → vue mensuelle Jan → endMonth.
- Granularité Année → vue annuelle Jan → Déc.
- Granularité Mois + `ytd-day` → vue journalière intra-mois avec **baseline** (cumul des mois précédents) — calculée côté backend (`dettes/route.ts` ~ lignes 443-449).

---

## 12. Tunnel de rentabilité

**Composant** : `TunnelRentabilite` dans `client-reporting-chart.tsx`, affiché
dans l'onglet **Résultats**.

Représentation horizontale (barres positives/négatives) de la formation du
résultat à partir du chiffre d'affaires.

### Métriques composant le tunnel

| Métrique | Clé | Formule | Base 100% |
|---|---|---|---|
| Chiffre d'affaires | `chiffreAffaires` | `sig.XB` (assujetti) ou `caTTCTotal` (non) | 100% |
| Marge commerciale | `margeCommerciale` | `sig.XA` | % du CA |
| Valeur Ajoutée | `valeurAjoutee` | `sig.XC` | % du CA |
| Résultat d'exploitation | `resultatExploitation` | `sig.XE` | % du CA |
| Résultat financier | `resultatFinancier` | `sig.XF` | % du CA |
| Résultat HAO | `resultatHAO` | `sig.XH` | % du CA |
| Résultat net | `resultatNet` | `sig.XI` | % du CA |

- **Configurable** : ordre + visibilité via `INITIAL_TUNNEL_METRICS`, persisté
  dans le state local (mode édition `tunnelEditMode`).
- **Couleurs** : bleu foncé (valeur positive), rouge (valeur négative).

---

## 13. KPI configurables

### Onglet Synthèse Financière (`KPI_CARDS`)

| KPI | Clé | Couleur | Variation associée |
|---|---|---|---|
| Chiffre d'affaires | `chiffreAffaires` | `text-blue-600` | `chiffreAffaires` |
| Masse salariale | `masseSalariale` (= rubrique RK) | `text-orange-600` | `masseSalariale` |
| Résultat d'exploitation | `resultatExploitation` | `text-fuchsia-500` (positif) / rouge | `resultatExploitation` |
| Résultat Net | `resultatNet` | `text-green-600` / rouge | `resultatNet` |
| Trésorerie | `soldeTresorerie` | `text-cyan-600` / rouge | `soldeTresorerie` |
| Marge commerciale | `margeCommerciale` | `text-indigo-600` / rouge | `margeCommerciale` |

**Persistance** : `localStorage` clé `kpi-config-${clientId}` (ordre + visibilité).

### Onglet Dettes (`DEFAULT_DETTE_KPIS`)

| KPI | Clé | Format |
|---|---|---|
| Dettes fournisseurs | `dettesFournisseurs` | FCFA compact |
| Dettes sociales | `dettesSociales` | FCFA compact |
| Dettes personnel | `dettesPersonnel` | FCFA compact |
| Dettes fiscales | `dettesFiscales` | FCFA compact |
| Dettes HAO | `dettesHAO` | FCFA compact |
| Taux de remboursement | `tauxRemboursement` | `%` |

**Persistance** : `localStorage` clé `kpi-config-dettes-${clientId}`.

---

## 14. Variations N vs N-1

Calculées par `calculerVariation()` dans `reporting/route.ts` :

```typescript
const variation = (n: number, n1: number): number =>
  n1 !== 0 ? ((n - n1) / Math.abs(n1)) * 100 : n !== 0 ? 100 : 0;
```

### Variations exposées

| Variation | Sur |
|---|---|
| `chiffreAffaires` | CA |
| `masseSalariale` | Masse salariale (RK) |
| `resultatExploitation` | XE |
| `resultatNet` | XI |
| `soldeTresorerie` | Solde 52* + 57* |
| `margeCommerciale` | XA |
| `valeurAjoutee` | XC |
| `ebe` | XD |
| `resultatFinancier` | XF |
| `resultatHAO` | XH |
| `tauxRecouvrement` | Différence absolue (pts), pas un % |
| `caTA`, `caTB`, `caTC`, `caTD` | Variations CA par nature |

**Affichage** : badge avec icône `TrendingUp` / `TrendingDown` / `Minus`,
couleur verte / rouge / grise.

---

## 15. Endpoints API & schémas de réponse

### 15.1 `GET /api/clients/[id]/reporting`

**Query params** :
| Param | Type | Défaut | Effet |
|---|---|---|---|
| `year` | `string` (YYYY) | année courante | Année N |
| `periodType` | `year` \| `month` \| `ytd` \| `ytd-day` | `year` | Mode + granularité |
| `month` | `string` (MM) | — | Requis si `periodType ∈ {month, ytd, ytd-day}` |

**Réponse (résumée)** :
```ts
{
  client: { id, name, assujettiTVA },
  year, yearN1, periodType, selectedMonth, availableYears,
  chartData: DataPoint[],
  totals: { totalCharges, totalProduits, totalTransactions, resultat },
  indicateurs: {
    anneeN:  { chiffreAffaires, masseSalariale, resultatExploitation,
               resultatNet, soldeTresorerie, valeurAjoutee, ebe,
               resultatFinancier, resultatHAO, margeCommerciale,
               produitsAdditionnels, totalAchats, impotResultat },
    anneeN1: { ...mêmes clés },
    variations: { ...% }
  },
  topClients: TopClient[],
  caParNature: CAParNatureItem[]
}
```

**Structure `DataPoint`** (chaque point du chart) :
```ts
{
  label, period, periodNumber,
  charges, produits, resultat, cumulativeBalance, nbTransactions,
  chiffreAffaires, chiffreAffairesN1,
  chiffreAffairesPeriodique, chiffreAffairesPeriodiqueN1,
  soldeTresorerie, soldeTresorerieN1,
  margeCommerciale, margeCommercialeN1,
  tauxRecouvrement, tauxRecouvrementN1,
  caTTCTotal, caEncaisseTTC,
}
```

### 15.2 `GET /api/clients/[id]/reporting/recouvrement`

**Query params** :
| Param | Type | Effet |
|---|---|---|
| `endPeriod` | `YYYY-MM` | Mois de fin du cumul |
| `startPeriod` | `YYYY-MM` | Optionnel — début (default : Jan) |

**Réponse** :
```ts
{
  client, endPeriod, endYear, endMonth,
  chartData: RecouvrementDataPoint[],
  totals: { caTTCTotal, caEncaisseTTC, tauxRecouvrement, soldeCreances },
  periodRange: { start, end },
  topCreances: TopCreance[],
  totalCreances
}
```

### 15.3 `GET /api/clients/[id]/reporting/dettes`

**Query params** :
| Param | Type | Effet |
|---|---|---|
| `endPeriod` | `YYYY-MM` | Fin du cumul |
| `startPeriod` | `YYYY-MM` | Optionnel |
| `mode` | `cumule` \| `periodique` | Affichage |
| `granularity` | `month` \| `day` | Granularité chart |

**Réponse** :
```ts
{
  client, endPeriod, endYear, endMonth, mode, granularity,
  kpis: { dettesFournisseurs, dettesPersonnel, dettesSociales,
          dettesFiscales, dettesHAO, tauxRemboursement },
  totals: { detteNeeTotal, rembourseTotal, tauxRemboursement, soldeDettes },
  chartData: DetteDataPoint[],
  topByType: TopDette[],
  topByFournisseur: TopDetteFournisseur[]
}
```

---

## 16. Composition par onglet UI

### Synthèse Financière (`overview`)

1. **KPI Cards** (6) — CA, Masse salariale, Rés. expl., Rés. net, Trésorerie, Marge
2. **Évolution de la Trésorerie** — `LineChart`, toujours cumulé, N vs N-1
3. **Charges vs Produits** — `LineChart`, 2 lignes, mode-aware ⚙️

### Chiffres d'affaires (`chiffres`)

1. **Évolution CA** — `BarChart` N vs N-1, mode-aware (périodique / cumulé)
2. **CA par Nature** — `BarChart` horizontal détail comptes rubrique TC + tableau récap

### Résultats (`resultats`)

1. **KPI Cards** spécifiques (résultat net, marges, etc.)
2. **Tunnel de rentabilité** — configurable

### Recouvrement (`recouvrement`)

1. **KPI Cards** — Taux de recouvrement, Créances TTC, Encaissements TTC
2. **Évolution du Taux de Recouvrement** — `LineChart` (cumulé + périodique)
3. **Créances Clients TTC vs Encaissements Clients TTC** — `BarChart` mensuel
4. **Top 10 Créances** — Tableau + histogramme horizontal

### Dettes (`dettes`)

1. **KPI Cards** — 5 catégories de dettes + taux remboursement
2. **Évolution Taux de Remboursement** — `LineChart` (cumulé + périodique)
3. **Dettes Fournisseurs vs Remboursées** — `BarChart` (couleurs duotone bleu)
4. **Top 10 par Type** — Tableau
5. **Top 10 par Fournisseur** — Tableau

### Bilan d'activité (`bilan`)

Rapport narratif **toujours cumulé**, 4 sections :

1. **Chiffre d'affaires** — narration + `LineChart` N vs N-1
2. **Recouvrement** — narration + `LineChart` taux + `BarChart` Créances/Encaissé + Top 10
3. **Trésorerie** — narration + `LineChart` N vs N-1
4. **Résultat** — narration + `BarChart` tunnel SIG (CA → VA → EBE → Rés. expl. → Rés. net)

---

## 17. Schéma ClickHouse `grand_livre`

Table unique alimentée par les 4 fichiers d'import (Grand Livre, Plan des
Comptes, Plan Tiers, Codes Journaux) puis enrichie par Airflow avec les
rubriques OHADA.

```sql
CREATE TABLE ${dbName}.grand_livre (
  batch_id            String,
  date_transaction    String,      -- DD/MM/YYYY
  compte              String,      -- ex. '411001'
  intitule_compte     String,
  n_tiers             String,
  intitule_tiers      String,
  rubrique            String,      -- TA, RK, etc. (résultat)
  bilan_rubrique      String,      -- DJ, DK1, etc. (bilan)
  numero_piece        String,
  debit               Float64,
  credit              Float64,
  ...
) ENGINE = MergeTree
ORDER BY (batch_id, date_transaction, compte);
```

### Index logiques utilisés par REPFI

- Filtre temporel : `substring(date_transaction, 7, 4)` (année), `substring(date_transaction, 4, 2)` (mois), `substring(date_transaction, 1, 2)` (jour).
- Comparaison période : `concat(substring(7,4), substring(4,2))` = `YYYYMM`.
- Filtre comptes : `startsWith(compte, '41')`, etc.
- Groupage tiers : `GROUP BY n_tiers, intitule_tiers`.

---

## 📖 Pour aller plus loin

| Sujet | Fichier |
|---|---|
| Calcul des rubriques OHADA | [reporting/route.ts](src/app/api/clients/[id]/reporting/route.ts) `recupererRubriquesParMois` |
| Calcul SIG | [reporting/route.ts](src/app/api/clients/[id]/reporting/route.ts) `calculerSIG` |
| Indicateurs anneeN / anneeN1 | [reporting/route.ts](src/app/api/clients/[id]/reporting/route.ts) `calculerIndicateurs*` |
| Recouvrement | [recouvrement/route.ts](src/app/api/clients/[id]/reporting/recouvrement/route.ts) |
| Dettes | [dettes/route.ts](src/app/api/clients/[id]/reporting/dettes/route.ts) |
| Composition UI | [client-reporting-chart.tsx](src/components/reporting/client-reporting-chart.tsx) |
| Rapport narratif | [client-bilan-tab.tsx](src/components/reporting/client-bilan-tab.tsx) |

---

> **Convention de signes (rappel) :**
> - Comptes de charges (6*) : `debit − credit` (positif = charge réelle).
> - Comptes de produits (7*) : `credit − debit` (positif = produit réel).
> - Comptes de trésorerie (52*, 57*) : `debit − credit` (positif = solde disponible).
> - Comptes clients (41*) : débit = créance née, crédit = encaissement.
> - Comptes fournisseurs (40*) et autres dettes (42-45*) : crédit = dette née, débit = remboursement.

---

*Document généré automatiquement à partir du code source. Pour toute mise à
jour, modifier les fichiers backend (`route.ts`) ou frontend correspondants
puis régénérer ce README.*
