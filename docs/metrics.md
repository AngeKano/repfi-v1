# 📊 REPFI — Catalogue complet des métriques du Reporting

> Référence technique exhaustive de toutes les métriques calculées et affichées
> dans le module Reporting de REPFI. Plan comptable **SYSCOHADA révisé**.
>
> Pour chaque métrique : description, formule de calcul, rubriques (et
> exceptions par compte) mobilisées, unité, mode de calcul applicable, fichier
> source.
>
> **Document maintenu dans le dépôt** : `docs/metrics.md` est la source,
> `docs/metrics.pdf` sa version imprimable, régénérée par
> `npm run docs:metrics`. Il est mis à jour à chaque évolution du reporting
> (voir l'historique, §29).
>
> **Dernière mise à jour : 26/10/2026** — États Financiers : Bilan et Compte de
> résultat dans leur présentation d'origine, nouveau sous-onglet **Compte
> d'exploitation** (janvier → mois du filtre + total, §18). Détail de toutes les évolutions :
> historique, §29.
>
> *23/10/2026* — **tous les indicateurs se calculent par rubrique** et non
> plus par numéro de compte, hors cinq exceptions métier (§2) ; carte
> **Charges et rentabilité** (§22) ; rubriques et tiers des écritures saisies
> déterminés par le Mapping (§19).
>
> *21/10/2026* — définitions du Recouvrement Clients et du Règlement
> Fournisseurs (solde, séparation par type de journal), Trésorerie par
> rubrique, onglets Dettes Financières et Ratios bilantiels, référentiels
> modifiables.

---

## Table des matières

1. [Architecture & sources de données](#1-architecture--sources-de-données)
2. [Règle de calcul : rubriques et exceptions](#2-règle-de-calcul--rubriques-et-exceptions)
3. [Référentiels (tables de dimension)](#3-référentiels-tables-de-dimension)
4. [Modes de calcul & granularités](#4-modes-de-calcul--granularités)
5. [Rubriques OHADA — charges (RA à RS)](#5-rubriques-ohada--charges-ra-à-rs)
6. [Rubriques OHADA — produits (TA à TO)](#6-rubriques-ohada--produits-ta-à-to)
7. [Soldes Intermédiaires de Gestion (SIG)](#7-soldes-intermédiaires-de-gestion-sig)
8. [Chiffre d'affaires](#8-chiffre-daffaires)
9. [Charges vs Produits](#9-charges-vs-produits)
10. [Journaux de trésorerie](#10-journaux-de-trésorerie)
11. [Trésorerie](#11-trésorerie)
12. [Recouvrement Clients](#12-recouvrement-clients)
13. [Règlement Fournisseurs](#13-règlement-fournisseurs)
14. [Dettes court terme](#14-dettes-court-terme)
15. [Dettes Financières](#15-dettes-financières)
16. [Ratios bilantiels](#16-ratios-bilantiels)
17. [États Financiers — Bilan](#17-états-financiers--bilan)
18. [États Financiers — Compte de résultat et Compte d'exploitation](#18-états-financiers--compte-de-résultat-et-compte-dexploitation)
19. [Comptabilité — écritures saisies](#19-comptabilité--écritures-saisies)
20. [Inclusion / exclusion des saisies dans le reporting](#20-inclusion--exclusion-des-saisies-dans-le-reporting)
21. [Tunnel de rentabilité](#21-tunnel-de-rentabilité)
22. [Charges et rentabilité](#22-charges-et-rentabilité)
23. [KPI configurables](#23-kpi-configurables)
24. [Variations N vs N-1 & devise](#24-variations-n-vs-n-1--devise)
25. [Endpoints API & schémas de réponse](#25-endpoints-api--schémas-de-réponse)
26. [Composition par onglet UI](#26-composition-par-onglet-ui)
27. [Schéma ClickHouse `grand_livre`](#27-schéma-clickhouse-grand_livre)
28. [Contrôles qualité (QC)](#28-contrôles-qualité-qc)
29. [Historique des mises à jour](#29-historique-des-mises-à-jour)

---

## 1. Architecture & sources de données

### Sources

| Source | Rôle | Nature |
|---|---|---|
| **ClickHouse** `repfi_{clientId}` | Grand livre et référentiels (plan comptable, mapping, plan tiers, codes journaux) | Lecture ; écriture limitée aux saisies et aux référentiels |
| **PostgreSQL** (Prisma) | Clients, périodes comptables, utilisateurs, **écritures saisies**, **suivi des mises à jour de référentiels** | Lecture / écriture |
| **Airflow** | ETL : parsing, mapping SYSCOHADA, alimentation ClickHouse, mise à jour des référentiels, reclassement | Externe |

### Tables ClickHouse par client

| Table | Contenu |
|---|---|
| `grand_livre` | Toutes les écritures, importées et saisies |
| `plan_compte` | `compte`, `intitule_compte`, `nature_compte` — **fait autorité sur les intitulés** |
| `ple` | **Mapping** racine de compte → rubrique (compte de résultat `PL` et bilan `BILAN`) |
| `plan_tiers` | Référentiel des tiers (`compte_tiers`, `intitule_tiers`, `type`) |
| `code_journal` | Codes journaux (`code_journal`, `intitule`, **`type`**) |

Les référentiels sont des `ReplacingMergeTree(updated_at)` : une ligne de même
clé remplace l'ancienne à la fusion. Le type de journal prend les valeurs Sage
`Achats`, `Trésorerie`, `Général`, `Ventes`, `Situation`, `A-nouveaux`.

### Tables PostgreSQL utiles au reporting

| Table | Rôle |
|---|---|
| `comptable_periods` | Périodes importées (batch, exercice, statut) |
| `manual_ledger_entries` | Écritures saisies (source de vérité) |
| `dimension_updates` | Suivi des mises à jour de référentiels (statut, lignes ajoutées / modifiées, erreur) — écrit par Airflow |

### Pipelines

```
Fichiers comptables ──► Airflow etl_comptable_clickhouse ──► ClickHouse.grand_livre
Fichier de référentiel ─► Airflow etl_dimensions_clickhouse ─► plan_compte / ple / plan_tiers / code_journal
                                                              ▲
Écritures saisies ──► PostgreSQL (source de vérité) ──────────┘
                      syncManualBatch() → batch « manual_{clientId}_{année} »
```

### Colonne `rubrique` — schéma fusionné

`rubrique` porte **les deux familles de codes** :

| Famille | Codes | État concerné |
|---|---|---|
| Bilan | `AD…BZ` (actif), `CA…DZ` (passif) | Bilan |
| Gestion | `TA…TO`, `RA…RS` | Compte de résultat |

Les bases non migrées conservent `bilan_rubrique`. Le code **détecte les
colonnes réellement présentes** (`system.columns`, cache 60 s).

> `src/lib/clickhouse/schema.ts` — `bilanRefExpr()`, `tableColumns()`

---

## 2. Règle de calcul : rubriques et exceptions

### Principe

**Tous les KPI, graphiques et contrôles se calculent sur les rubriques** du
Mapping (`ple`) — rubriques `PL` du compte de résultat (`TA…TO`, `RA…RS`)
et rubriques `BILAN` (`AD…BZ` à l'actif, `CA…DZ` au passif) — et **non plus
sur les numéros de compte**. Un numéro de compte n'intervient que pour les
exceptions ci-dessous, toutes issues d'une définition métier.

Conséquence : une écriture **sans rubrique** n'entre dans aucun indicateur.
Elle se corrige dans le Mapping (Comptabilité › Tables de dimension), puis
**« Réappliquer le mapping »**. Le contrôle E5 de *Charges et rentabilité*
(§22) la fait apparaître.

### Exceptions (numéros de compte conservés)

| # | Comptes | Usage | Raison |
|---|---|---|---|
| E1 | **418**, **419** | Exclus des créances, encaissements, Top 10 clients et créances | Factures à établir, clients créditeurs |
| E2 | **408**, **409** | Exclus des dettes et décaissements fournisseurs | Factures non parvenues, fournisseurs débiteurs |
| E3 | **4495** | Créances clients, Top 10 clients, CA total des analyses ; reclassé en `BJ` au bilan | Subventions à recevoir, rangées en DK par le Mapping |
| E4 | **414**, **4431 à 4435** | DSO | Définition du DSO ; la TVA collectée n'a pas de rubrique propre |
| E5 | Classes **6, 7, 8** | Contrôle indépendant du résultat | Détecter les écritures de gestion sans rubrique |

> ⚠️ Pour les clients, l'exclusion E1 porte **à la fois sur `compte` et sur
> `n_tiers`** : certains grands livres portent le code 418/419 côté tiers.

### Récapitulatif des KPI par rubrique

| Onglet | KPI / graphique | Formulation par rubrique | Exception |
|---|---|---|---|
| Synthèse | Chiffre d'affaires (assujetti) | `TA + TB + TC + TD` (anciennement comptes 70) | — |
| Synthèse | Chiffre d'affaires (non assujetti) | Solde `BI` hors journaux de trésorerie | E1, E3 |
| Synthèse | Masse salariale ; Masse salariale / CA | valeur absolue de `RK` ; `RK` / CA | — |
| Synthèse | Rés. exploitation ; Rés. net ; Marge commerciale | `XE` ; `XI` ; `XA = TA + RA + RB` | — |
| Synthèse | Trésorerie | `BSA + BSB − BSB1 + BSC + BSD − BSD1 + BSE − BSE1 + BSF + BSG − DRA − DRB − DRC − DQ` | — |
| Synthèse | Charges vs Produits | Rubriques `RA à RS` / `TA à TO` (anciennement classes 6/7/8) | — |
| Chiffre d'affaires | CA N / N-1, évolution | `TA à TD` (anciennement comptes 70) | — |
| Chiffre d'affaires | Subventions ; Produits par nature | `TG` ; `TA, TB, TC, TD, TG` | — |
| Chiffre d'affaires | Top 10 clients (assujetti) | CA `TA à TD + TG`, tiers lu sur les lignes `BI` de la pièce | E1, E3 |
| Chiffre d'affaires | Top 10 clients (non assujetti) | Créances TTC par tiers (solde `BI`), comme le KPI | E1, E3 |
| Résultats | SIG et tunnel | `XA, XC, XD, XE, XF, XH, XI` | — |
| Résultats | Charges et rentabilité | `XB`, catégories `RA à RS`, autres produits `TE à TO`, `XI` | E5 |
| Recouvrement | Créances, Encaissements, Taux, Top 10 | Solde `BI` hors / sur journaux de trésorerie | E1, E3 |
| Recouvrement | DSO | Créances = `BI` − 414 ; CA TTC = `XB` + TVA collectée | E4 |
| Règlement fournisseurs | Dettes, Décaissements, Taux | Solde `DJ` hors / sur journaux de trésorerie | E2 |
| Dettes court terme | Fournisseurs, Personnel, Sociales, Fiscales, HAO | `DJ`, `DK1`, `DK2`, `DK3`, `DH` | — |
| Trésorerie | Caisse, Banque, Régies, Étab. fin., Instruments, Autres passif | `BSA` ; `BSB − BSB1 − DRA − DRB` ; `BSC` ; `BSD − BSD1` ; `BSE − BSE1` ; `DRC + DQ` | — |
| Dettes financières | Dettes financières, Emprunts, Crédit-bail | `DA + DB` ; `DA` ; `DB` | — |
| Ratios | FRNG, BFR global, BFR d'exploitation, BFR HAO | `DF − AZ` ; expl. + HAO ; `(BB−BB1) + (BH−BH1) + (BI−BI1) + (BJ−BJ1) − DI − DJ − DK − DM − DN` ; `(BA − BA1) − DH` | — |
| États financiers | Actif : Amort. et dépréc. | Rubriques d'actif suffixées `AE1`, `AE2`, `BB1`, `BI1`, `BSB1`… (anciennement comptes 28/29/39/49/59) | E3 (4495 → `BJ`) |
| Transverse | Journaux de trésorerie (repli) | Journaux qui mouvementent `BSA à BSG`, `DRA`, `DRB` (anciennement comptes 52/57) | — |
| Transverse | Contrôles QC | Mêmes définitions que les écrans | E1, E3 |
| Comptabilité | Tiers d'une écriture saisie | Rubriques `BI`, `DI`, `DJ`, `BH` (anciennement comptes 40/41) | — |

### Rubriques d'amortissement et de dépréciation

Reconnues à leur **rubrique**, et non plus aux comptes 28/29/39/49/59 : code
d'actif suivi d'un chiffre — `AE1` (amortissements de AE), `AE2`
(dépréciations de AE), `BB1`, `BH1`, `BI1`, `BJ1`, `BQ2`, `BR2`, `BSB1`,
`BSD1`, `BSE1`…

```sql
match(rubrique, '^[AB][A-Z]+[0-9]$')
```

> `src/lib/reporting/etats-financiers.ts` — `estAmortSql()`

### Rubriques de tiers

Un compte porte un tiers selon sa **rubrique de bilan** (et non plus selon le
préfixe 40 / 41) :

| Rubrique | Comptes concernés | Type de tiers |
|---|---|---|
| `BI` | Clients | Client |
| `DI` | Clients créditeurs (avances reçues) | Client |
| `DJ` | Fournisseurs | Fournisseur |
| `BH` | Fournisseurs débiteurs (avances versées) | Fournisseur |

> `src/lib/comptable/saisie-refs.ts` — `exigeTiers()`, `typeTiersRubrique()`

### Où sont les définitions

| Fichier | Contenu |
|---|---|
| `lib/reporting/etats-financiers.ts` | `XB_RUBRIQUES`, `CA_RUBRIQUES`, rubriques de charges / produits, amortissements |
| `lib/reporting/creances.ts` | Périmètres BI et DJ, exceptions E1 à E3 |
| `lib/reporting/tresorerie.ts` | Rubriques de trésorerie |
| `lib/reporting/ratios-bilantiels.ts` | Ratios, DSO (E4) |
| `lib/reporting/analyse-charges.ts` | Charges et rentabilité |
| `lib/clickhouse/ple.ts` | Application du Mapping aux écritures saisies |

---

## 3. Référentiels (tables de dimension)

Quatre référentiels : **Plan comptable**, **Mapping**, **Plan tiers**, **Codes
journaux**.

### Plan tiers — compte centralisateur

La colonne **Compte centralisateur** du Plan tiers est **calculée** : ce sont
les comptes de rubrique `BI`, `DI`, `DJ` ou `BH` (401…, 411…) sur lesquels
le tiers est mouvementé dans le grand livre, avec l'intitulé du plan comptable
(« 411100 — Collectif Client Ménages » ; plusieurs comptes séparés par « ; »).
Elle se recherche, se filtre et se trie comme les autres colonnes, mais n'est
ni modifiable, ni saisie à l'ajout d'un tiers, ni exportée au format de
dépôt. Un tiers jamais mouvementé n'a pas encore de compte centralisateur.

> `src/lib/clickhouse/dimensions-table.ts` — `jointureCompteCentralisateur()`

### Intitulés

`plan_compte` fait autorité sur l'intitulé d'un compte ; à défaut, intitulé du
grand livre, puis **troncature** (`411101` → `41110` → `4111` → `411`).

### Mise à jour par fichier — onglet Import

Un fichier unique par référentiel, traité par Airflow (DAG
`etl_dimensions_clickhouse`), comme l'import complet : dépôt → déclenchement →
suivi écrit par Airflow dans `dimension_updates`.

| Règle | Détail |
|---|---|
| Clé nouvelle | Ligne **ajoutée** |
| Clé existante | Ligne **mise à jour** |
| Ligne absente du fichier | **Conservée** — aucune suppression |
| Intitulés recopiés | Reportés dans `grand_livre` (comptes, tiers) |
| Mapping | Le grand livre est **reclassé** après la mise à jour |

Format du fichier **Mapping** (Excel, 1re ligne = en-têtes) :
`racine, rubrique, nb_racine, type_rubrique, solde_filter, exclusions`.

### Consultation, modification, ajout — Comptabilité › Tables de dimension

| Action | Règles |
|---|---|
| Consulter | Recherche, filtres par champ (multisélection), tri, pagination, export Excel au format de dépôt |
| Modifier | Champs non clés uniquement (intitulé, type, nature ; rubrique et exclusions du mapping) |
| Ajouter | Clé saisie, refusée si elle existe déjà ; mapping : type `PL`/`BILAN`, sens du solde vide/`debit`/`credit`, longueur de racine = longueur de la racine, rubrique en majuscules |
| Supprimer | **Impossible** |

Toute modification ou ajout est reporté sur le grand livre et sur la copie
d'intitulé des écritures saisies. Une modification du **mapping** n'agit sur
les écritures déjà chargées qu'après **« Réappliquer le mapping »**
(reclassement par Airflow).

**Clé** : compte · n° de tiers · code journal · pour le mapping, (racine,
type, longueur de racine, sens du solde).

> `src/lib/comptable/dimensions.ts`, `src/lib/clickhouse/dimensions-table.ts`

---

## 4. Modes de calcul & granularités

| Mode (`periodType`) | Libellé UI | Fenêtre | Usage |
|---|---|---|---|
| `ytd` | Cumulé / Année | Jan → Déc | Comparaisons annuelles |
| `ytd-day` | Cumulé / Mois | Jan → mois sélectionné, détail journalier | Vue fine intra-mois |
| `year` | Périodique / Année | Jan → Déc, non cumulé | Évolution mensuelle |
| `month` | Périodique / Mois | Mois sélectionné seul | Analyse ponctuelle |

**Onglets à mode verrouillé sur Cumulé** (un encours se lit à une date) :
Recouvrement Clients, Règlement Fournisseurs, Dettes court terme, Trésorerie,
Dettes Financières, Ratios bilantiels, Bilan d'activité.

**Comparaison N / N-1** : la **même fenêtre** est appliquée à chaque exercice.

**Filtres partagés** : année, mode, granularité et mois sont communs aux
onglets. À la première ouverture d'un client, l'année se cale sur l'exercice
le plus récent ; ensuite, **l'année choisie est conservée** d'un onglet à
l'autre et lors de la bascule « Prendre en compte les saisies ».

**Cohérence du filtre** : le calcul suit toujours ce qu'affiche la barre de
filtres. Granularité « Année » → l'année entière (périodique) ou janvier →
décembre (cumulé) ; granularité « Mois » → le mois choisi (périodique) ou
janvier → ce mois (cumulé). Au premier affichage d'un client, la granularité
est déduite du mode mémorisé (Périodique ou Cumulé portent sur l'année).

---

## 5. Rubriques OHADA — charges (RA à RS)

| REF | Libellé | Sens |
|---|---|---|
| `RA` | Achats de marchandises | − |
| `RB` | Variation de stocks de marchandises | −/+ |
| `RC` | Achats de matières premières et fournitures liées | − |
| `RD` | Variation de stocks de matières premières | −/+ |
| `RE` | Autres achats | − |
| `RF` | Variation de stocks d'autres approvisionnements | −/+ |
| `RG` | Transports | − |
| `RH` | Services extérieurs | − |
| `RI` | Impôts et taxes | − |
| `RJ` | Autres charges | − |
| `RK` | Charges de personnel | − |
| `RL` | Dotations aux amortissements, provisions et dépréciations | − |
| `RM` | Frais financiers et charges assimilées | − |
| `RN` | Dotations aux provisions et dépréciations financières | − |
| `RO` | Valeurs comptables des cessions d'immobilisations | − |
| `RP` | Autres charges HAO | − |
| `RQ` | Participation des travailleurs | − |
| `RS` | Impôts sur le résultat | − |

**Calcul** : `sum(credit - debit)` par rubrique → les charges ressortent
**négatives**, conformément au modèle officiel.

---

## 6. Rubriques OHADA — produits (TA à TO)

| REF | Libellé | Repère |
|---|---|---|
| `TA` | Ventes de marchandises | A |
| `TB` | Ventes de produits fabriqués | B |
| `TC` | Travaux, services vendus | C |
| `TD` | Produits accessoires | D |
| `TE` | Production stockée (ou déstockage) | |
| `TF` | Production immobilisée | |
| `TG` | Subventions d'exploitation | |
| `TH` | Autres produits | |
| `TI` | Transferts de charges d'exploitation | |
| `TJ` | Reprises d'amortissements, provisions et dépréciations | |
| `TK` | Revenus financiers et assimilés | |
| `TL` | Reprises de provisions et dépréciations financières | |
| `TM` | Transferts de charges financières | |
| `TN` | Produits des cessions d'immobilisations | |
| `TO` | Autres produits HAO | |

---

## 7. Soldes Intermédiaires de Gestion (SIG)

| Solde | Libellé | Formule |
|---|---|---|
| `XA` | Marge commerciale | `TA + RA + RB` |
| `XB` | **Chiffre d'affaires** | `TA + TB + TC + TD` |
| `XC` | Valeur ajoutée | `XA + TB + TC + TD + (TE…TI) + (RC…RJ)` |
| `XD` | Excédent brut d'exploitation | `XC + RK` |
| `XE` | Résultat d'exploitation | `XD + TJ + RL` |
| `XF` | Résultat financier | `TK + TL + TM + RM + RN` |
| `XG` | Résultat des activités ordinaires | `XE + XF` |
| `XH` | Résultat hors activités ordinaires | `TN + TO + RO + RP` |
| `XI` | **Résultat net** | `XG + XH + RQ + RS` |

> `calculerSIG()` dans `reporting/route.ts` ; `computeResultatTotals()` dans
> `lib/reporting/etats-financiers.ts` — **formules identiques**.

---

## 8. Chiffre d'affaires

### 8.1 Le CA au sens du modèle officiel (États Financiers)

```
XB = TA + TB + TC + TD
```

Strictement les quatre natures : **cette ligne ne bouge pas**. C'est aussi la
définition du **KPI Chiffre d'affaires**, de sa **courbe d'évolution**, du SIG,
de *Charges et rentabilité* et du DSO (`XB_RUBRIQUES`). Les comptes 70 ne sont
plus lus directement.

### 8.2 Le périmètre des ANALYSES de CA

Le Top 10 clients et son CA total retiennent les rubriques `CA_RUBRIQUES`
(`TA, TB, TC, TD, TG`) et les **subventions à recevoir** (compte 4495) :

```sql
(rubrique IN ('TA','TB','TC','TD','TG') OR startsWith(compte, '4495'))
```

> ⚠️ **Sens du montant.** Le compte **4495 est un compte d'actif, débiteur** :
> son montant est lu en `débit − crédit`, les produits en `crédit − débit`.

```sql
if(startsWith(compte,'4495'), debit - credit, credit - debit)
```

> `src/lib/reporting/chiffre-affaires.ts` — `CA_PERIMETRE_SQL`, `CA_MONTANT_SQL`

### 8.3 KPI du CA et des subventions

| Métrique | Formule |
|---|---|
| Chiffre d'affaires N / N-1 — assujetti TVA | `XB = TA + TB + TC + TD` (KPI et courbe) |
| Chiffre d'affaires N / N-1 — non assujetti | Créances Clients TTC : solde `BI` hors journaux de trésorerie (E1, E3) |
| Subventions d'exploitation N / N-1 | Rubrique `TG` |

### 8.4 Produits par Nature

Décomposition **par compte** des rubriques `TA, TB, TC, TD, TG`, N vs N-1.
L'intitulé du compte vient du plan comptable.

### 8.5 Top 10 clients

| Régime | Méthode |
|---|---|
| Assujetti TVA | Ventes `TA…TD + TG` rattachées au tiers **par n° de pièce**, le tiers étant lu sur les lignes `BI` hors 418/419 (`DISTINCT` anti fan-out) ; les subventions 4495 entrent au classement avec **leur propre tiers** |
| Non assujetti | Créances Clients TTC par tiers : solde `BI` (+ 4495) hors journaux de trésorerie — **même définition que le KPI** |

**Filtre** : `HAVING ca_client > 0`.

---

## 9. Charges vs Produits

| Métrique | Formule | Rubriques |
|---|---|---|
| Charges | `Σ(débit − crédit)` | `RA … RS` |
| Produits | `Σ(crédit − débit)` | `TA … TO` |
| Résultat | Produits − Charges | `= XI` |

Anciennement les classes de comptes 6, 81, 83, 85, 87, 89 et 7, 82, 84, 86, 88.
Le préfixe de deux lettres absorbe d'éventuelles subdivisions (`RK1`…).

---

## 10. Journaux de trésorerie

Le recouvrement et le règlement fournisseurs séparent les mouvements selon le
**type du journal** :

| Journaux | Ce qu'ils portent |
|---|---|
| **Hors trésorerie** (ventes, achats, OD, à-nouveaux…) | Ce qui **naît** : créance, dette |
| **Trésorerie** | Ce qui **se règle** : encaissement, décaissement |

Un journal est de trésorerie si, dans l'ordre :

1. la table `code_journal` lui donne le **type « Trésorerie »** (casse et accent
   indifférents) ;
2. c'est un journal de trésorerie de la saisie : **`CAIS`**, **`BQ`** ;
3. **repli** — si le référentiel n'en déclare aucun : journaux qui mouvementent
   les **rubriques de trésorerie** `BSA … BSG`, `DRA`, `DRB`.

> `src/lib/clickhouse/plan-comptable.ts` — `journauxTresorerie()` ;
> `src/lib/reporting/creances.ts` — `JOURNAL_TRESORERIE_SQL`

---

## 11. Trésorerie

Onglet **entièrement calculé par rubrique**, mode verrouillé sur Cumulé.

### Rubriques

| Côté | Rubriques |
|---|---|
| Actif | `BSA` caisse · `BSB` banques · `BSC` régies d'avance · `BSD` établissements financiers · `BSE` instruments de trésorerie · `BSF` monnaie électronique · `BSG` accréditifs |
| Dépréciations | `BSB1`, `BSD1`, `BSE1` |
| Passif (concours bancaires) | `DRA`, `DRB`, `DRC`, `DQ` |

### Convention des soldes

| Rubrique | Solde |
|---|---|
| Actif | `débit − crédit` |
| Dépréciation (`BSB1`, `BSD1`, `BSE1`) | `crédit − débit` |
| Passif (`D…`) | `crédit − débit` — un découvert est positif |

### Indicateurs

| KPI | Formule | Affiché |
|---|---|---|
| **Total Trésorerie** | `BSA + BSB − BSB1 + BSC + BSD − BSD1 + BSE − BSE1 + BSF + BSG − DRA − DRB − DRC − DQ` | oui |
| Caisse | `BSA` | oui |
| Banque | `BSB − BSB1 − DRA − DRB` | oui |
| Régies d'avance | `BSC` | oui |
| Établissements financiers | `BSD − BSD1` | oui |
| Instruments de trésorerie | `BSE − BSE1` | oui |
| **Autres Trésorerie Passif** | `DRC + DQ` | oui |
| Instruments de monnaie électronique | `BSF` | masqué (configurable) |
| Accréditifs | `BSG` | masqué (configurable) |

### Trésorerie par comptes

Histogramme et tableau par compte sur **toutes les rubriques du Total**,
valeur `débit − crédit` : concours bancaires et dépréciations y apparaissent en
négatif, et la ligne **Total Trésorerie du tableau égale l'indicateur**.

### Trésorerie de la Synthèse

L'indicateur « Trésorerie » et la courbe « Évolution de la Trésorerie » de la
Synthèse reprennent le **Total Trésorerie** (et non plus les comptes 52/57).

> `src/lib/reporting/tresorerie.ts`, `…/reporting/tresorerie/route.ts`

---

## 12. Recouvrement Clients

### Périmètre

```sql
((rubrique = 'BI'
  AND NOT startsWith(compte,'418') AND NOT startsWith(compte,'419')
  AND NOT startsWith(n_tiers,'418') AND NOT startsWith(n_tiers,'419'))
 OR startsWith(compte,'4495'))
```

Rubrique **BI** (Clients) hors 418/419. Le compte **4495** (subventions à
recevoir) est une créance et est traité comme telle.

### Métriques

| Métrique | Clé JSON | Journaux | Formule |
|---|---|---|---|
| **Créances Clients TTC** | `caTTCTotal` | hors trésorerie | `Σ(débit − crédit)` |
| **Encaissements Clients TTC** | `caEncaisseTTC` | trésorerie uniquement | `Σ(crédit − débit)` |
| Taux de recouvrement | `tauxRecouvrement` | — | `encaissements / créances × 100` |
| Solde créances | `soldeCreances` | — | `créances − encaissements` |

Le **solde** des comptes est retenu : un avoir vient en déduction des
créances, un remboursement en déduction des encaissements.

### Top 10 créances

- Par client : créances, encaissements et solde selon les mêmes définitions.
- `HAVING solde > 0`, tri par solde décroissant.
- `%` = part du solde dans le total de **toutes** les créances positives.
- Une créance sans tiers est regroupée sous son compte.

### Délai moyen de paiement clients (DSO)

```
DSO = (créances clients moyennes TTC / CA TTC) × nombre de jours
créances clients TTC   = BI − solde des comptes 414
créances moyennes      = (créances au 01/01 + créances à la date de fin) / 2
CA TTC                 = TA + TB + TC + TD + Σ crédit 4431…4435
nombre de jours        = du 01/01 à la fin du mois sélectionné (inclus)
```

KPI et courbe d'évolution N vs N-1, toujours en cumulé. Le compte 414 et la TVA
collectée (4431 à 4435) sont l'exception **E4** (§2).

> `src/lib/reporting/creances.ts` — `perimetreCreancesSql()`,
> `creancesTTCSql()`, `encaissementsTTCSql()`

---

## 13. Règlement Fournisseurs

### Périmètre

```sql
(rubrique = 'DJ' AND NOT startsWith(compte,'408') AND NOT startsWith(compte,'409'))
```

### Métriques

| Métrique | Clé JSON | Journaux | Formule |
|---|---|---|---|
| **Dettes Fournisseurs TTC** | `dettesFournisseursTTC` | hors trésorerie | `Σ(crédit − débit)` |
| **Décaissement Fournisseurs TTC** | `decaissementFournisseursTTC` | trésorerie uniquement | `Σ(débit − crédit)` |
| Taux de décaissement | `tauxRemboursement` | — | `décaissements / dettes × 100` |

Graphiques : *Évolution du Taux de Décaissement Fournisseurs* (cumulé et
périodique) et *Dettes Fournisseurs TTC vs Décaissement Fournisseurs TTC*.

### Top 10 par fournisseur

- `HAVING (dette − remboursé) > 0`, tri par solde décroissant.
- `%` = part du solde dans le total → **le total fait 100 %**.

> `src/lib/reporting/creances.ts` — `perimetreDettesFournisseursSql()`,
> `dettesFournisseursTTCSql()`, `decaissementsFournisseursTTCSql()`

---

## 14. Dettes court terme

Vue dédiée au **passif circulant**.

| KPI | Rubrique |
|---|---|
| **Total Dettes Court Terme** | Somme des cinq composantes |
| Dettes fournisseurs | `DJ` |
| Dettes sociales | `DK2` |
| Dettes personnel | `DK1` |
| Dettes fiscales | `DK3` |
| Dettes HAO | `DH` |

Contient le tableau **Analyse des Dettes par Type — Top 10**.

---

## 15. Dettes Financières

| KPI | Formule |
|---|---|
| **Dettes financières** | `DA + DB` |
| Emprunts | `DA` |
| Crédit-bail | `DB` |

Solde passif `crédit − débit`, cumulé depuis le 1er janvier. Graphique :
*Évolution des dettes financières* (histogramme empilé Emprunts + Crédit-bail).

---

## 16. Ratios bilantiels

Encours cumulés au mois sélectionné, N vs N-1. Actif en solde net
`Σ(débit − crédit)` (dépréciations `…1` incluses) ; passif en `Σ(crédit − débit)`.

| KPI | Formule |
|---|---|
| **Fonds de Roulement Net Global** | `DF − AZ` (AZ net d'amortissements) |
| **Besoin en Fonds de Roulement** | BFR d'exploitation + BFR HAO |
| BFR d'exploitation | `(BB−BB1) + (BH−BH1) + (BI−BI1) + (BJ−BJ1) − DI − DJ − DK − DM − DN` |
| BFR Hors Activités Ordinaires | `(BA − BA1) − DH` |

Le résultat net de l'exercice (`XI`) alimente `CJ`, donc `DF`. Grille de KPI
2 × 2. Graphiques : *Évolution du FRNG* et *Évolution du BFR* (une donnée au
choix : global, exploitation ou HAO, en N et N-1).

> `src/lib/reporting/ratios-bilantiels.ts`

---

## 17. États Financiers — Bilan

Modèle **SYSCOHADA Système Normal**, conforme aux formulaires DGI. Trois
sous-onglets : **Bilan**, **Compte de Résultat** (§18) et **Compte
d'exploitation** (§18).

### Colonnes

| Colonne | Exercice | Formule |
|---|---|---|
| BRUT | N | `Σ(débit − crédit)` hors rubriques d'amortissement (§2) |
| AMORT et DEPREC. | N | `Σ(crédit − débit)` des rubriques d'amortissement (`AE1`, `BB1`…) |
| NET | N | `BRUT − AMORT` |
| NET | N-1 | idem |

Côté **Passif** : `NET = Σ(crédit − débit)`.

### Fenêtre et exercices

- Le **Bilan** est une photo à une date : il part **toujours du 1er janvier**,
  quel que soit le mode. Le **Compte de résultat** suit le mode choisi
  (périodique : le mois seul ; cumulé : janvier → mois).
- L'en-tête d'un exercice affiche la **date de fin de la fenêtre filtrée**,
  bornée à la clôture réelle (ex. « EXERCICE au 30/04/2026 »).
- Deux exercices affichés au maximum (N et N-1), navigation par flèches
  au-delà. Un exercice **sans aucune écriture** sur la fenêtre n'est pas
  affiché.

### Normalisation des codes

| Code stocké | REF du modèle |
|---|---|
| `AM1`, `AN1` | `AM`, `AN` |
| `DK1`, `DK2`, `DK3` | `DK` |
| `BSA`, `BSB` | `BS` |

Le code est réduit **par la droite** jusqu'à un REF connu.

### Résultat net (`CJ`) et subventions

`CJ` est alimenté par `XI` (résultat **cumulé** depuis janvier). Le compte
**4495** est reclassé en **`BJ` (Autres créances)** (E3).

### Export PDF / Excel

Bouton **Télécharger** : PDF et/ou Excel, même présentation que l'écran —
en-tête sur deux niveaux, quadrillage, totaux en gras sur fond gris, zéros
masqués hors total. Contenu : Bilan Actif, Bilan Passif et Compte de résultat
pour les exercices affichés (A4 paysage), puis le **Compte d'exploitation**
de janvier au mois du filtre + total (**A3 paysage** au-delà de 8 colonnes de
montants, A4 sinon). Excel en 4 onglets. Montants en
**FCFA**, milliers séparés par une espace, pagination « Page x / n ».

---

## 18. États Financiers — Compte de résultat et Compte d'exploitation

### Compte de Résultat

42 lignes, `TA → XI`, avec repères A/B/C/D et sens structurels (+, −, −/+).
Les soldes intermédiaires `XA…XI` suivent la §7. Colonnes NET de l'exercice
N et de l'exercice N-1, même fenêtre que le Bilan (§17).

### Compte d'exploitation

Troisième sous-onglet : les mêmes 42 lignes, **mois par mois**.

| Colonne | Calcul |
|---|---|
| REF, LIBELLES | Figées pendant le défilement horizontal |
| Janvier … mois du filtre (ex. 7 colonnes pour juillet) | **Net périodique** : `Σ(crédit − débit)` des mouvements du seul mois, par rubrique |
| TOTAL — cumul janvier → mois du filtre | Somme des mois affichés (« CUMUL JANV. - JUIL. ») |

- Les sous-totaux `XA…XI` sont recalculés pour chaque mois avec les formules
  de la §7 ; elles sont linéaires, donc le total d'un sous-total égale la
  somme de ses mois.
- Exercice = l'**année du filtre** ; les colonnes vont de janvier au **mois
  du filtre** (décembre en granularité Année). Le mode de calcul ne change
  rien : chaque mois est **indépendant** (net périodique, période 1 sans lien
  avec période 2) et seul le total est cumulé depuis janvier.
- Chargé à la première ouverture du sous-onglet ; inclus dans les exports
  (§17).

> `…/reporting/compte-exploitation/route.ts`,
> `src/components/reporting/client-etats-financiers-tab.tsx`

---

## 19. Comptabilité — écritures saisies

Onglet en deux sous-onglets : **Grand livre** et **Tables de dimension**
(§3). Le filtre haut porte sur l'**exercice** (année), et non sur une période
importée.

### Règles

| Règle | Détail |
|---|---|
| Permission | `saisie:gerer` — **Loader Plus** et **Admin Root** |
| Immuabilité | Les lignes importées n'ont **aucune API d'écriture** |
| Référentiel | Comptes et tiers **existants** uniquement |
| Équilibre | `Σ débit = Σ crédit` **bloquant** |
| Montants | Positifs ou négatifs ; une ligne porte **soit un débit, soit un crédit**, jamais les deux (la colonne opposée est grisée dès qu'un montant est saisi) |
| Tiers | Comptes dont la **rubrique** est `BI`, `DI`, `DJ` ou `BH` (§2) : le tiers y est **obligatoire** et doit exister (grand livre ou Plan tiers) ; type de tiers déduit de la rubrique. Champ vidé et grisé sur les autres comptes |
| N° facture | Saisi une fois au niveau de l'écriture |
| Rubrique | Calculée par le **Mapping** (`ple`) avec la règle d'Airflow : racine la plus longue, exclusions, sens du solde du compte sur les saisies de l'exercice. Recalculée à chaque synchronisation (suit les modifications du Mapping) ; saisies anciennes sans rubrique reclassées à l'ouverture de l'onglet |

### Grand livre

Lignes **importées et saisies** (colonne **Flags**), filtres multisélection
(date, journal, compte et tiers avec libellés, pièce, facture, rubrique,
flags), recherche, totaux sur l'ensemble filtré, export Excel 23 colonnes +
Flags.

---

## 20. Inclusion / exclusion des saisies dans le reporting

Interrupteur **« Prendre en compte les saisies »** (en-tête client).

| État | Effet |
|---|---|
| **OFF** (défaut) | Saisies masquées |
| ON | Batch `manual_{clientId}_{année}` ajouté à tous les calculs |

Champ Prisma `Client.excludeManualEntries`.

La bascule **recharge les données de l'onglet en cours** sans quitter
l'onglet ni perdre les filtres (pas de rechargement complet de la page, qui
ramenait à la Synthèse).

---

## 21. Tunnel de rentabilité

```
Chiffre d'affaires (XB)
  → Valeur ajoutée (XC)
    → EBE (XD)
      → Résultat d'exploitation (XE)
        → Résultat net (XI)
```

---

## 22. Charges et rentabilité

Carte de l'onglet **Résultats** (spécification Click Insight *Analyse des
charges*, F01 à F14). Elle suit les filtres du reporting et compare N à N-1
sur la même fenêtre.

### Définitions

| Élément | Définition |
|---|---|
| CA | `XB = TA + TB + TC + TD` |
| Coût d'une catégorie | `− Σ montants signés (crédit − débit)` de ses rubriques — jamais de valeur absolue : une reprise est un coût négatif |
| Autres produits hors CA | `TE … TO` (dont `TG`, `TN` cessions, `TO` autres produits HAO), avec leurs signes |
| Résultat net | CA + autres produits − total des charges (= `XI`) |
| Poids | Coût / CA de la même période ; **n.a.** si CA nul |
| Marge nette | Résultat net / CA |
| Écart en points | (poids N − poids N-1) × 100 |
| Impact sur le résultat | Coût N-1 − coût N (une hausse de coût est négative) |
| Pont de résultat | Écart CA + écart autres produits − écart des charges |

### Catégories (ordre fixe, sans tri)

| Catégorie | Rubriques |
|---|---|
| Achats consommés | `RA, RB, RC, RD, RE, RF` |
| Transports | `RG` |
| Services extérieurs | `RH` |
| Impôts et taxes | `RI` |
| Autres charges d'exploitation | `RJ` |
| Personnel | `RK` |
| Amortissements, provisions et dépréciations | `RL` |
| Charges financières | `RM` |
| Amortissements, provisions et dépréciations financières | `RN` |
| Charges HAO | `RO, RP` |
| Participation des travailleurs | `RQ` |
| Impôt sur le résultat | `RS` |

### Restitution

- **Cascade** : CA (bleu) → charges (orange ; reprise en vert) → **Autres
  produits** (bleu, couleur du CA) → Résultat net (rose, rouge s'il est
  négatif). Une catégorie à **0 %** (moins de 0,005 % du CA) et des autres
  produits nuls **ne figurent pas** au classement ; le CA et le résultat net
  restent toujours affichés.
- **Lignes nulles** : le tableau des poids écarte une catégorie nulle en N et
  en N-1 ; le pont de résultat écarte un facteur nul ; le détail écarte une
  rubrique sans montant ni compte.
- **Détail au clic** : catégorie → rubriques → comptes → écritures (300
  premières).
- **Poids de chaque charge dans le chiffre d'affaires** : montants et poids N
  et N-1, écart en points, impact sur le résultat.
- **Écart de résultat entre les deux situations** et commentaire automatique.

### Alertes et contrôle

| Situation | Affichage |
|---|---|
| Dates de situation différentes (fin du dernier mois mouvementé) | « Périodes non comparables », aucune annualisation |
| CA nul / négatif | Ratios **n.a.** / ratios signés et avertissement |
| Exercice de référence sans écriture | Colonnes **n.d.** |
| Contrôle E5 : CA + autres produits − charges − solde des comptes 6, 7, 8 ≠ 0 | Écart de réconciliation signalé (attendu : 0) |

> `src/lib/reporting/analyse-charges.ts`, `…/reporting/charges/route.ts`,
> `src/components/reporting/client-analyse-charges.tsx`

---

## 23. KPI configurables

**Tous les onglets à KPI** proposent **« Configurer les KPIs »** : afficher /
masquer, réordonner par glisser-déposer, mémorisé par onglet et par client.

**Disposition commune** : 3 cartes par ligne (Ratios bilantiels : 2 × 2),
libellé, formule, valeur, rappel N-1, variation.

### KPI par onglet

| Onglet | KPI (identifiant) | Mémorisation (`localStorage`) |
|---|---|---|
| Synthèse | `ca`, `ms` (masse salariale), `rex`, `rn`, `treso`, `marge`, `ratiomsca` | `kpi-config-{clientId}` |
| Chiffre d'affaires | `ca`, `caN1`, `subventions`, `subventionsN1` | `kpi-config-chiffre-affaires-{clientId}` |
| Résultats | `marge`, `va`, `ebe`, `rex`, `rf`, `rn`, `rhao` (masqué par défaut) | `kpi-config-resultat-v2-{clientId}` |
| Recouvrement Clients | `taux`, `creances`, `encaisse`, `dso` | `kpi-config-recouvrement-{clientId}` |
| Règlement Fournisseurs | `dettesFournisseursTTC`, `decaissementFournisseursTTC`, `taux` | `kpi-config-dettes-{clientId}` |
| Dettes court terme | `total`, `dettesFournisseurs`, `dettesSociales`, `dettesPersonnel`, `dettesFiscales`, `dettesHAO` | `kpi-config-dettes-ct-{clientId}` |
| Trésorerie | `total`, `caisse`, `banque`, `regies`, `etablissementsFinanciers`, `instrumentsTresorerie`, `autresTresoreriePassif`, `monnaieElectronique` et `accreditifs` (masqués par défaut) | `kpi-config-tresorerie-{clientId}` |
| Dettes Financières | `dettesFinancieres`, `emprunts`, `creditBail` | `kpi-config-dettes-financieres-{clientId}` |
| Ratios bilantiels | `frng`, `bfrGlobal`, `bfrExploitation`, `bfrHao` | `kpi-config-ratios-{clientId}` |

> `src/components/reporting/kpi-grid.tsx`

---

## 24. Variations N vs N-1 & devise

```
variation = (N − N-1) / |N-1| × 100        (N-1 = 0 et N ≠ 0 → 100 %)
```

**Devise** : FCFA, définie en un seul endroit et reprise par l'application et
les exports (`src/lib/devise.ts`). Tableaux de bord en **K FCFA**.

---

## 25. Endpoints API & schémas de réponse

Toutes les routes sont préfixées par `/api/clients/[id]`. En cas d'échec, elles renvoient `{ error }` avec le statut 400, 401, 403, 404, 409, 413, 500 ou 502 selon le cas.

### 25.1 `GET /reporting`
Synthèse du reporting (session requise) : KPI N et N-1, courbes, Top 10 clients et CA par nature.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | string AAAA | année courante | Exercice N. N-1 vaut `year` − 1 |
| `periodType` | `year` ou `ytd` ou `month` ou `ytd-day` | `year` | `year` : 12 points mensuels. `ytd` : points mensuels de janvier à `month`. `month` : points journaliers du mois, cumuls partant de 0. `ytd-day` : points journaliers du mois, cumuls partant du cumul de janvier à M-1 |
| `month` | string MM | `null` | Mois de référence, requis pour `month`, `ytd` et `ytd-day`. Sans lui, le comportement est celui de `year` |

```
{
  client: { id, name, assujettiTVA },
  year, yearN1,              // strings
  periodType,
  selectedMonth,             // "MM" ou null
  availableYears,            // string[] décroissant ([year] si aucune période)
  chartData: DataPoint[],    // 12 points, ou janvier → month, ou max(jours du mois N, jours du mois N-1)
  periods: Periode[],        // périodes comptables de l'année N
  totals: { totalCharges, totalProduits, totalTransactions, resultat },   // Σ chartData ; resultat = produits − charges
  indicateurs: {
    anneeN: IndicateursFinanciers,
    anneeN1: IndicateursFinanciers,   // même fenêtre sur N-1
    variations: {
      chiffreAffaires, masseSalariale, ratioMasseSalarialeCA, resultatExploitation, resultatNet,
      soldeTresorerie, margeCommerciale, valeurAjoutee, ebe, resultatFinancier, resultatHAO,
      subventions, caTA, caTB, caTC, caTD,   // % : (N − N1) / |N1| × 100 (100 si N1 = 0 et N ≠ 0)
      tauxRecouvrement                       // écart en POINTS (N − N1), pas un %
    }
  },
  topClients: TopClient[],         // 10 au plus
  caParNature: CAParNatureItem[]
}

DataPoint {
  label,               // "Jan"…"Déc" (mensuel) ou "1"…"31" (journalier)
  period,              // "AAAAMM" ou "AAAAMMJJ"
  periodNumber,        // "MM" ou "JJ"
  charges,             // Σ (débit − crédit) des rubriques de charges R… sur le point
  produits,            // Σ (crédit − débit) des rubriques de produits T…
  resultat,            // produits − charges du point
  cumulativeBalance,   // cumul de resultat (part du cumul janvier → M-1 en ytd-day)
  nbTransactions,      // nombre de lignes du grand livre
  chiffreAffaires, chiffreAffairesN1,                       // CA XB (TA+TB+TC+TD, crédit − débit), cumulé
  chiffreAffairesPeriodique, chiffreAffairesPeriodiqueN1,   // CA XB du seul point
  subventions, subventionsN1,                               // TG cumulé, sans cumul de départ en ytd-day
  subventionsPeriodique, subventionsPeriodiqueN1,           // TG du seul point
  soldeTresorerie, soldeTresorerieN1,                       // cumul (débit − crédit) des rubriques du Total Trésorerie
  margeCommerciale, margeCommercialeN1,                     // XA du seul point (non cumulé)
  tauxRecouvrement, tauxRecouvrementN1,                     // % cumulé : encaissements / créances × 100
  caTTCTotal, caEncaisseTTC                                 // N seulement, cumulés : créances clients TTC, encaissements clients TTC
}

IndicateursFinanciers {   // fenêtre : points de la courbe ; en month/ytd-day, les jours du mois seul
  chiffreAffaires,        // assujetti TVA : dernier point cumulé de chartData ; sinon caTTCTotal
  masseSalariale,         // |RK|
  ratioMasseSalarialeCA,  // masseSalariale / chiffreAffaires × 100
  resultatExploitation,   // XE
  resultatNet,            // XI
  soldeTresorerie,        // Σ (débit − crédit) des rubriques du Total Trésorerie sur la fenêtre
  margeCommerciale,       // XA
  valeurAjoutee,          // XC
  ebe,                    // XD
  resultatFinancier,      // XF
  resultatHAO,            // XH
  tauxRecouvrement,       // % : caEncaisseTTC / caTTCTotal × 100
  caTTCTotal,             // créances clients TTC (BI hors 418/419, hors journaux de trésorerie)
  caEncaisseTTC,          // encaissements clients TTC (mêmes comptes, journaux de trésorerie)
  caTA, caTB, caTC, caTD, // solde crédit − débit de chaque rubrique
  subventions,            // TG
  produitsAdditionnels,   // TE + TF + TG + TH + TI
  totalAchats,            // |RA + RB + RC + … + RJ|
  impotResultat           // |RS|
}

TopClient {   // fenêtre : month → le mois ; ytd ou ytd-day → janvier → month ; year → l'année ; seuls les montants > 0
  numeroClient, nomClient,
  montantCA,      // assujetti : CA HT (ventes TA–TD et TG rattachées au tiers par pièce, plus 4495) ; sinon créances clients TTC du tiers
  pourcentageCA   // % du CA total de la fenêtre
}

CAParNatureItem {   // comptes des rubriques TA–TD et TG, même fenêtre que TopClient
  compte, intituleCompte,   // intitulé tiré du plan comptable en priorité
  montantN, montantN1,      // crédit − débit (signe inversé pour 4495)
  variation                 // %
}                           // trié par montantN décroissant ; comptes nuls sur N et N-1 exclus

Periode {
  id, batch_id, periodStart, periodEnd, status, excelFileUrl,
  charges, produits, nb_transactions   // sur tout le batch, mêmes conventions que DataPoint
}
```

### 25.2 `GET /reporting/recouvrement`
Onglet Recouvrement : créances et encaissements clients mois par mois, plus le Top 10 des créances.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `endPeriod` | AAAA-MM | mois courant | Fin de la fenêtre. chartData et totals vont de janvier à `endPeriod`, dans l'année de fin |
| `startPeriod` | AAAA-MM | janvier de l'année de fin | Début de la fenêtre, pour `topCreances` uniquement |

```
{
  client: { id, name },
  endPeriod,            // "AAAA-MM"
  endYear, endMonth,    // nombres
  chartData: [{
    label,                                  // "Jan 2025"
    period,                                 // "AAAAMM"
    yearMonth,                              // "AAAA-MM"
    caTTCTotal,                             // créances clients TTC du mois (BI hors 418/419, hors journaux de trésorerie)
    caEncaisseTTC,                          // encaissements clients TTC du mois (journaux de trésorerie)
    tauxRecouvrement,                       // % du mois
    cumulativeCaTTC, cumulativeCaEncaisse,  // cumuls depuis janvier
    tauxRecouvrementCumule                  // %
  }],
  totals: { caTTCTotal, caEncaisseTTC, tauxRecouvrement, soldeCreances },   // janvier → endPeriod ; soldeCreances = caTTCTotal − caEncaisseTTC
  periodRange: { start, end },   // chacun { year, month, label } : premier et dernier mois de chartData
  topCreances: [{                // 10 au plus, fenêtre startPeriod → endPeriod, soldes > 0
    numeroClient,                // n_tiers, ou le compte si la ligne n'a pas de tiers
    nomClient,
    caTTCTotal, caEncaisseTTC,
    soldeCreance,                // caTTCTotal − caEncaisseTTC
    pourcentageTotal             // % du total des soldes positifs de TOUS les clients
  }],
  totalCreances                  // Σ soldeCreance du Top 10
}
```

### 25.3 `GET /reporting/dettes`
Onglet Dettes : règlement fournisseurs, soldes des dettes et Top 10.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `endPeriod` | AAAA-MM | mois courant | Fin de la fenêtre. chartData et KPI vont de janvier à `endPeriod` |
| `startPeriod` | AAAA-MM | janvier de l'année de fin | Début de la fenêtre des Top 10. Égal à `endPeriod`, il désigne un seul mois |
| `mode` | `cumule` ou `periodique` | `cumule` | Renvoyé tel quel pour l'interface. Les deux séries sont toujours calculées |
| `granularity` | `day` | mensuel | Points journaliers si `day` et si `startPeriod` = `endPeriod` |
| `dailyBaseline` | `true` | `false` | En journalier, les cumuls partent du cumul de janvier à M-1 au lieu de 0 |

```
{
  client: { id, name },
  endPeriod, endYear, endMonth,
  mode,           // "cumule" ou "periodique"
  granularity,    // "day" ou "month" (granularité appliquée)
  singleMonth,    // true si startPeriod = endPeriod ou si startPeriod est absent
  kpis: {
    dettesFournisseursTTC,        // dette née : DJ hors 408/409, hors journaux de trésorerie ; cumul de la courbe
    decaissementFournisseursTTC,  // décaissements : mêmes comptes, journaux de trésorerie ; cumul de la courbe
    dettesFournisseurs,           // solde crédit − débit de DJ, janvier → endMonth
    dettesPersonnel,              // DK1, idem
    dettesSociales,               // DK2
    dettesFiscales,               // DK3
    dettesHAO,                    // DH
    tauxRemboursement             // % : décaissements / dette née
  },
  totals: { detteNeeTotal, rembourseTotal, tauxRemboursement, soldeDettes },   // = flux TTC des kpis ; soldeDettes = née − remboursée
  chartData: [{
    label,                                            // "Jan 2025" ou "05 Mar"
    period,                                           // "AAAAMM" ou "AAAAMMJJ"
    yearMonth,                                        // "AAAA-MM" ou "AAAA-MM-JJ"
    detteFournisseurNee, detteFournisseurRemboursee,  // Σ crédit et Σ débit bruts de DJ (tous comptes, tous journaux)
    detteNeeTotal, rembourseTotal,                    // flux du règlement fournisseurs sur le point (DJ hors 408/409)
    tauxRemboursement,                                // % du point
    cumulDetteNeeTotal, cumulRembourseTotal,          // cumuls (partant de janvier → M-1 si dailyBaseline)
    tauxRemboursementCumule                           // %
  }],
  topByType: [{ label, montantDette, montantRembourse, solde, pourcentage }],
      // par rubrique DJ, DK1, DK2, DK3, DH ; montantDette = Σ crédit, montantRembourse = Σ débit, solde > 0
  topByFournisseur: [{ numeroFournisseur, label, montantDette, montantRembourse, solde, pourcentage }]
      // DJ par tiers ; label = intitulé du tiers
}   // Top 10 : fenêtre startPeriod → endPeriod ; pourcentage = part du solde dans Σ des soldes du Top 10 (total 100 %)
```

### 25.4 `GET /reporting/tresorerie`
Onglet Trésorerie : indicateurs calculés par rubrique et détail par compte, N comparé à N-1.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | exercice le plus récent | Exercice N. S'il n'est pas disponible, l'exercice le plus récent est pris |
| `periodType` | `ytd` ou `ytd-day` ou `year` ou `month` | `ytd` | Fenêtre : janvier → `month` (ytd, ytd-day), janvier → décembre (year), ou le mois seul. Fenêtre identique sur N et N-1 |
| `month` | MM | `12` | Mois de fin, ou mois seul |

```
{
  client: { id, name },
  yearN, yearN1,         // nombres
  availableYears,        // number[] décroissant
  periodeLabel,          // "Janvier - mars", "Janvier - Décembre" ou "mars"
  manualIncluded,        // false si les saisies sont exclues
  kpis: {
    total, caisse, banque, regies, etablissementsFinanciers, instrumentsTresorerie,
    autresTresoreriePassif, monnaieElectronique, accreditifs
      // chacun { valeurN, valeurN1, variation } ; variation en %
      // actif BS… en débit − crédit ; dépréciations (…1) et passif DRA, DRB, DRC, DQ en crédit − débit, combinés selon la formule
      // total = BSA + BSB − BSB1 + BSC + BSD − BSD1 + BSE − BSE1 + BSF + BSG − DRA − DRB − DRC − DQ
      // banque = BSB − BSB1 − DRA − DRB ; autresTresoreriePassif = DRC + DQ (montant positif)
  },
  comptes: [{ compte, intituleCompte, montantN, montantN1, variation }]
      // comptes des rubriques du Total Trésorerie ; montant = débit − crédit ; tri par |montantN| décroissant ; comptes nuls sur N et N-1 exclus
}
```

### 25.5 `GET /reporting/ratios`
Onglet Ratios bilantiels : FRNG, BFR, dettes financières et DSO, en encours cumulés depuis le 1er janvier, N comparé à N-1.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | exercice le plus récent | Exercice N, avec repli sur l'exercice le plus récent |
| `month` | MM (borné à 1–12) | `12` | Mois de fin : chartData va de janvier à `month`, les KPI sont pris à la fin de `month` |

```
{
  client: { id, name },
  yearN, yearN1, availableYears, manualIncluded,
  jours,              // jours écoulés du 01/01 à la fin de month (année N)
  kpis: {
    frng, bfrGlobal, bfrExploitation, bfrHao, dettesFinancieres, emprunts, creditBail, dso
      // chacun { valeurN, valeurN1, variation } ; encours à fin month ; variation en % ; dso en jours
  },
  dsoDetail: { creancesTTC, caTTC },   // N à fin month : créances = BI − 414 ; CA TTC = rubriques CA du DSO + TVA collectée
  chartData: [{        // un point par mois, janvier → month, cumulé depuis janvier
    label,             // "Jan"…
    frng, frngN1,                            // DF − AZ
    bfrGlobal, bfrGlobalN1,                  // bfrExploitation + bfrHao
    bfrExploitation, bfrExploitationN1,
    bfrHao, bfrHaoN1,                        // BA − DH
    dettesFinancieres, dettesFinancieresN1,
    emprunts, empruntsN1,                    // DA
    creditBail, creditBailN1,
    dso, dsoN1                               // jours : moyenne (créances début, créances fin) / CA TTC × jours écoulés
  }]
}
```

### 25.6 `GET /reporting/etats-financiers`
Sous-onglets Bilan et Compte de résultat : exercices comparés (N, N-1…), colonnes BRUT / AMORT / NET à l'actif.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | tous les exercices | Exercice N : les exercices suivants sont ignorés |
| `periodType` | `year` ou `month` ou `ytd` ou `ytd-day` | `ytd` | Bilan toujours janvier → mois de fin. Compte de résultat : le mois seul en `month`, janvier → mois sinon. `year` force décembre |
| `month` | MM | `12` | Mois de fin de la fenêtre |

```
{
  client: { id, name },
  exercices: [{ year, label }],   // du plus récent au plus ancien, sans écriture → écarté ; label "JJ/MM/AAAA" (fin de fenêtre bornée à la clôture)
  availableYears,                 // number[] décroissant
  manualIncluded,
  periodeLabel,                   // "Janvier - avril", "Janvier - Décembre" ou "avril"
  actif: [{ ref, libelle, total, bruts, amorts, nets }],   // un montant par exercice ; brut (débit − crédit), amort (crédit − débit)
  passif: [{ ref, libelle, total, nets }],                 // crédit − débit ; CJ += XI cumulé
  resultat: [{ ref, libelle, total, sens, repere, montants }]   // crédit − débit ; sens "+" ou "-" ou "-/+" ou null
}
```

### 25.7 `GET /reporting/charges`
Onglet Résultats (Charges et rentabilité) : montants par rubrique et par compte sur N et N-1, ou écritures d'un compte avec `compte=`.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | exercice le plus récent | Exercice N, avec repli sur le plus récent. N-1 = N − 1 |
| `periodType` | `year` ou `ytd` ou `ytd-day` ou `month` | `year` | Fenêtre : janvier → décembre, janvier → `month`, ou le mois seul |
| `month` | MM | `12` | Mois de fin, ou mois seul |
| `compte` | string | — | Si renseigné : mode écritures de ce compte, sur N et sur la même fenêtre |

Mode par défaut :
```
{
  client: { id, name },
  availableYears, manualIncluded,
  periodeLabel,           // "janvier - août" ou "août"
  n: PeriodeCharges,
  n1: PeriodeCharges      // N-1, même fenêtre
}

PeriodeCharges {
  year,
  disponible,             // false si aucune écriture sur la fenêtre
  debut, fin,             // "JJ/MM/AAAA" ; fin = fin du dernier mois mouvementé de la fenêtre
  nbMois,                 // mois couverts jusqu'au dernier mois mouvementé
  rubriques: { <ref>: montant },                        // crédit − débit (les charges sont négatives)
  comptes: { <ref>: [{ compte, intitule, montant }] },  // même signe ; tri par |montant| décroissant
  resultatComptes         // Σ crédit − débit des comptes 6, 7 et 8 (contrôle E5 de XI)
}
```
Mode `compte=` :
```
{
  total,       // nombre total d'écritures
  limite,      // 300
  ecritures: [{ date, journal, piece, tiers, debit, credit }]   // date "JJ/MM/AAAA" ; tiers = intitulé, sinon n° ; tri par date puis pièce
}
```

### 25.8 `GET /reporting/qc`
Contrôle qualité du reporting par requêtes indépendantes, sur la fenêtre de janvier à `endMonth`.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | année courante | Exercice contrôlé |
| `endMonth` | MM | `12` | Mois de fin de la fenêtre |

```
{
  client: { id, name, assujettiTVA },
  period: { year, endMonth, startYM, endYM },   // strings ; startYM et endYM au format "AAAAMM"
  checks: [{ id, label, severity, status, expected, actual, detail? }],
      // severity "critique" ou "moyen" ou "mineur" ; status "pass" ou "warn" ou "fail"
      // id : C2-taux-recouvrement, C3-top-creances-parts, C4-creances-418-419,
      //      A1-ca-attribue (assujetti) ou A1-top-clients-parts (non assujetti), A10-exercice-unique
  summary: { total, pass, warn, fail, ok },     // ok = aucun fail
  note?      // seulement sans batch : client { id, name } et checks vide
}
```

### 25.9 `GET` et `POST /dimensions`
État des référentiels et dépôt d'un fichier de dimension (permission Fichiers VOIR pour GET, CHARGER pour POST).

GET : aucun paramètre.
```
{
  canUpload,      // droit Fichiers CHARGER
  tables: [{ fileType, label, lignes, derniereMiseAJour, enCours }],
      // fileType : PLAN_COMPTES, PLE, PLAN_TIERS, CODE_JOURNAL
      // lignes = count FINAL (null si la table est absente)
      // derniereMiseAJour = processedAt du dernier COMPLETED, ou null
  updates: [{ id, fileType, fileName, fileSize, reclassement, status, progress, dagRunId,
              rowsInserted, rowsUpdated, errorMessage, createdAt, processedAt, uploadedBy }]
      // 50 derniers ; reclassement = true si aucun fichier déposé ; uploadedBy = "Prénom Nom", sinon l'email
}
```
POST (multipart/form-data) :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `fileType` | `PLAN_COMPTES` ou `PLE` ou `PLAN_TIERS` ou `CODE_JOURNAL` | — | Référentiel visé |
| `file` | fichier | — | Déposé sur S3, au même format que pour l'import complet |

```
201 { update }   // DimensionUpdate PENDING : id, clientId, fileType, fileName, s3Key, fileSize, status, progress,
                 // dagRunId, rowsInserted, rowsUpdated, errorMessage, uploadedById, createdAt, processedAt
                 // 409 si une mise à jour de ce référentiel est déjà en cours ; 413 si le fichier est trop gros
```

### 25.10 `POST /dimensions/trigger`
Lance le DAG Airflow `etl_dimensions_clickhouse` pour un dépôt en PENDING ou FAILED (permission Fichiers CHARGER).

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `updateId` | string (body JSON) | — | Identifiant de la ligne `dimension_updates` à traiter |

```
{ message, update, dagRunId }   // message "Traitement lancé" ; update passe en PROCESSING (progress 5)
                                // 409 si déjà en cours ou déjà traité ; 502 si Airflow ne démarre pas (le dépôt reste PENDING)
```

### 25.11 `POST /dimensions/reclassement`
Reclasse le grand livre selon le mapping PLE actuel, via le DAG Airflow (permission Fichiers CHARGER). Pas de body.

```
201 { message, update }   // message "Reclassement lancé" ; update : fileType PLE, fileName "Reclassement du grand livre", s3Key ""
                          // 409 si un traitement du mapping est en cours ; 502 si le DAG ne démarre pas
```

### 25.12 `GET`, `PATCH` et `POST /dimensions/tables/[referentiel]`
Contenu d'un référentiel : lecture paginée et filtrée, export, modification ou ajout d'une ligne. `[referentiel]` vaut `PLAN_COMPTES`, `PLE`, `PLAN_TIERS` ou `CODE_JOURNAL`. Permission VOIR en lecture, CHARGER en écriture.

GET :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `search` | string | `""` | Recherche plein texte |
| `sortBy` | nom de colonne | colonne clé | Colonne de tri |
| `sortDir` | `asc` ou `desc` | `asc` | Sens du tri |
| `page` | entier | `1` | Page de 50 lignes |
| `f.<colonne>` | string, répétable | — | Filtre par colonne : OU entre valeurs d'une colonne, ET entre colonnes |
| `options` | `1` | — | Ajoute `options`, les valeurs proposées par chaque filtre |
| `export` | `1` | — | Toutes les lignes filtrées, sans pagination (100 000 au plus) |

```
{
  lignes,          // [{ <colonne>: string }] ; Plan tiers : + compte_centralisateur (calculé)
  total, page, pageSize, totalPages,   // pageSize 50, ou nombre de lignes en export
  diagnostic?,     // anomalie de schéma expliquée à l'utilisateur
  options?,        // { <colonne>: [{ code, libelle? }] }, 5000 valeurs au plus par colonne
  canEdit          // droit Fichiers CHARGER
}
```
PATCH (body JSON) :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `cles` | { colonne: valeur } | — | Toutes les colonnes clés de la ligne visée |
| `valeurs` | { colonne: valeur } | — | Colonnes éditables uniquement, 255 caractères au plus |

```
{
  ligne,              // ligne après modification, valeurs en texte
  modifiee,           // false si rien n'a changé
  grandLivre,         // string[] : colonnes du grand livre mises à jour
  saisies,            // nombre d'écritures saisies réalignées
  reclassementRequis  // true si le mapping (PLE) a été modifié
}                     // 404 si clé introuvable ; 409 si une mise à jour par fichier est en cours
```
POST (body JSON) :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `valeurs` | { colonne: valeur } | — | Nouvelle ligne. Refusée si la clé existe déjà |

```
201 { ligne, grandLivre, saisies, reclassementRequis }   // reclassementRequis = true pour PLE ; 409 si la ligne existe déjà ou si la table est introuvable
```

### 25.13 `GET`, `POST`, `PUT` et `DELETE /saisie`
Saisie manuelle : vue du grand livre (import et saisies) avec listes de référence, et création, remplacement ou suppression d'écritures. Écriture soumise à la permission Saisie GERER.

GET :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | exercice le plus récent | Exercice affiché |
| `page` | entier | `1` | Page de 25 lignes |
| `search` | string | — | Recherche sur compte, intitulés, tiers, pièce, facture, journal, rubrique, date et montants |
| `sortBy` | `date` ou `compte` ou `tiers` ou `piece` ou `debit` ou `credit` | `date` | Tri |
| `sortDir` | `asc` ou `desc` | `asc` | Sens du tri |
| `dateFrom`, `dateTo` | AAAA-MM-JJ | — | Bornes de date |
| `journal`, `compte`, `piece`, `tiers`, `facture`, `rubrique`, `flag` | string, répétables | — | Filtres du grand livre (`flag` = `Import` ou `Saisie`) |

```
{
  client: { id, name },
  periods: [{ id, year, periodStart, periodEnd }],
  annees,                      // number[] décroissant
  annee,                       // exercice affiché (null si aucune période)
  periodesAnnee: [{ id, periodStart, periodEnd }],
  bornes: { debut, fin },      // dates de l'exercice (null si aucune période)
  uploaded: {
    rows: [{ date_transaction, compte, intitule_compte, n_tiers, intitule_tiers, numero_piece, rubrique,
             debit, credit, code_journal, numero_facture, batch_id, flags }],   // flags "Import" ou "Saisie"
    page, pageSize, total, totalPages,
    totalDebit, totalCredit    // sur toutes les lignes filtrées
  },
  manual,                      // ManualLedgerEntry[] de l'exercice : id, clientId, comptablePeriodId, year, dateTransaction,
                               // codeJournal, compte, intituleCompte, nTiers, intituleTiers, typeTiers, rubrique, bilanRubrique,
                               // numeroPiece, numeroFacture, libelle, debit, credit, createdById, createdAt, updatedAt
  refs: {
    comptes: [{ compte, intitule, rubrique, bilan }],   // compte jamais mouvementé : rubrique issue du Mapping
    tiers: [{ nTiers, intitule, comptes }],   // comptes : string[] rattachés au tiers
    journaux: [{ code, libelle }],
    pieces, factures, rubriques               // string[]
  },
  balance: { debit, credit, delta }           // Σ des saisies ; delta = debit − credit
}
```
POST et PUT (body JSON) :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | entier | — | Exercice de rattachement |
| `dateTransaction` | string date | — | Doit tomber dans l'exercice |
| `codeJournal` | string | — | Code journal connu |
| `libelle` | string (300 car. au plus) | `""` | Libellé de l'écriture |
| `numeroPiece` | string (60 car. au plus) | POST : `SAI-AAAA-xxxxxx` | Obligatoire en PUT : identifie l'écriture à remplacer |
| `numeroFacture` | string (60 car. au plus) | `""` | N° de facture de l'écriture |
| `lignes` | [{ `compte`, `nTiers`?, `typeTiers`?, `debit`, `credit` }] | — | Une ligne au moins. Σ débit = Σ crédit (bloquant). Comptes et tiers doivent exister ; tiers retenu pour les rubriques BI, DI, DJ, BH |

```
POST → 201 { ok, numeroPiece }
PUT  → { ok, numeroPiece }    // remplace toutes les lignes de la pièce
```
DELETE :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | — (obligatoire) | Exercice |
| `scope` | `all` | — | Supprime toutes les saisies de l'exercice |
| `numeroPiece` | string, répétable | — | Écritures à supprimer si `scope` est absent |

```
{ ok, deleted }   // deleted = nombre de lignes supprimées
```

### 25.14 `PATCH` et `DELETE /saisie/[entryId]`
Modification ou suppression d'une seule ligne saisie (permission Saisie GERER).

PATCH (body JSON, tous les champs facultatifs) :

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `dateTransaction` | string date | valeur actuelle | Doit tomber dans la période |
| `compte` | string | valeur actuelle | Compte existant. Les rubriques sont de nouveau héritées |
| `nTiers`, `typeTiers` | string | valeur actuelle | Pris en compte seulement pour les rubriques de tiers (BI, DI, DJ, BH) |
| `numeroFacture`, `libelle` | string | valeur actuelle | Champs d'en-tête de la ligne |
| `debit`, `credit` | nombre ≥ 0 | valeur actuelle | L'un des deux doit être non nul, pas les deux à la fois |

```
PATCH  → { ok, warning? }              // warning si l'écriture n'est plus équilibrée
DELETE → { ok, deleted, warning? }     // deleted = 1
```

### 25.15 `GET /saisie/export`
Export Excel du grand livre de l'exercice (lignes importées et saisies), avec les mêmes filtres que la vue Saisie.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | exercice le plus récent | Exercice exporté |
| `dateFrom`, `dateTo`, `journal`, `compte`, `piece`, `tiers`, `facture`, `rubrique`, `flag` | voir 25.13 | — | Filtres. `flag=Saisie` seul exclut les lignes importées |
| `debug` | `columns` | — | Renvoie les colonnes réelles du grand livre au lieu du fichier |

```
Fichier .xlsx   // feuille "Grand Livre", 23 colonnes (Date GL … Mapping Status, Flags) ;
                // Content-Disposition : attachment ; filename = GRAND_LIVRE_<client>_<année>_saisies.xlsx
debug=columns → { columns, sample }
```

### 25.16 `PATCH /reporting-settings`
Inclut ou exclut les écritures saisies manuellement de tous les calculs du reporting (permission Saisie GERER).

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `excludeManualEntries` | booléen (body JSON) | — | `true` exclut les saisies des calculs du reporting |

```
{ ok, excludeManualEntries }
```

### 25.17 `GET /reporting/compte-exploitation`
Sous-onglet Compte d'exploitation : lignes du compte de résultat de janvier au mois du filtre, plus le total.

| Paramètre | Type | Défaut | Effet |
|---|---|---|---|
| `year` | AAAA | exercice le plus récent | Exercice affiché, sinon le plus récent qui le précède |
| `month` | MM | `12` | Dernier mois affiché |
| `periodType` | `year` ou autre | `ytd` | `year` force décembre |

```
{
  client: { id, name },
  availableYears, manualIncluded,
  year,
  moisFin,                 // 1 à 12
  mois: [{ ym, label }],   // janvier → moisFin : "AAAAMM", "Janvier"…
  lignes: [{ ref, libelle, total, sens, repere, mois, cumul }]
      // mois : un montant par mois affiché, en net périodique (crédit − débit du seul mois) ; sous-totaux XA…XI recalculés par mois
      // cumul : total janvier → moisFin (= somme des mois)
}
```

---

## 26. Composition par onglet UI

| Onglet | Contenu principal |
|---|---|
| Synthèse Financière | KPI configurables, charges/produits, trésorerie |
| Chiffres d'affaires | CA et subventions N/N-1, évolutions, Produits par Nature, Top 10 clients |
| Résultats | SIG, tunnel de rentabilité, Charges et rentabilité |
| Recouvrement Clients | Créances, encaissements, taux, DSO, Top 10 créances |
| Règlement Fournisseurs | Dettes, décaissements, taux de décaissement, Top 10 fournisseurs |
| Dettes court terme | Total + 5 composantes, Top 10 par type |
| Trésorerie | KPI par rubrique, trésorerie par comptes |
| Dettes Financières | Dettes financières, emprunts, crédit-bail |
| Ratios bilantiels | FRNG, BFR (global, exploitation, HAO) |
| États Financiers | Bilan et Compte de résultat (exercices comparés), Compte d'exploitation (12 mois + total), export PDF / Excel |
| Bilan d'activité | Lecture narrative de l'exercice |
| Import | Fichiers comptables, mise à jour des référentiels et historique |
| Comptabilité | Grand livre (saisie) et Tables de dimension |

---

## 27. Schéma ClickHouse `grand_livre`

| Colonne | Type | Remarque |
|---|---|---|
| `batch_id` | String | Préfixe `manual_` ⇒ écriture saisie |
| `date_transaction` | String | Format `JJ/MM/AAAA` |
| `compte`, `intitule_compte` | String | Intitulé parfois vide → plan comptable |
| `n_tiers`, `intitule_tiers`, `type_tiers` | String | |
| `rubrique` | String | Codes bilan ET gestion |
| `code_journal` | String | Type de journal via la table `code_journal` |
| `numero_piece`, `numero_facture`, `libelle` | String | |
| `debit`, `credit`, `solde` | Float64 | |

> Comparaison de périodes : `concat(substring(date_transaction,7,4), substring(date_transaction,4,2))` → `AAAAMM`.

---

## 28. Contrôles qualité (QC)

| Contrôle | Invariant |
|---|---|
| `C2-taux-recouvrement` | Taux ∈ [0 ; 100] |
| `C3-top-creances-parts` | Σ parts du Top 10 ≤ 100 % |
| `C4-creances-418-419` | Aucun tiers 418/419 dans les créances |
| `C5-ca-attribue` | CA attribué aux clients ≤ CA total |

> Les contrôles utilisent **les mêmes définitions** que la production
> (`creancesTTCSql`, `encaissementsTTCSql`, `perimetreClientsSql`,
> `CA_PERIMETRE_SQL`) : rubrique `BI` pour les clients, plus de comptes 41.

---

## 29. Historique des mises à jour

| Date | Évolutions |
|---|---|
| 23/06/2026 | Version d'origine : 17 sections (architecture, SIG, CA, trésorerie par comptes, recouvrement 41*, dettes, endpoints et schémas de réponse). |
| 21/10/2026 | Recouvrement Clients et Règlement Fournisseurs en solde, séparés par type de journal (journaux de trésorerie) ; Trésorerie entièrement par rubrique, KPI « Autres Trésorerie Passif » ; onglets Dettes Financières et Ratios bilantiels, DSO déplacé au Recouvrement ; KPI configurables sur tous les onglets ; référentiels (tables de dimension) consultables, modifiables, mis à jour par fichier via Airflow ; Mapping (`ple`) table à part entière ; Comptabilité en deux sous-onglets ; États Financiers : filtre périodique, dates d'exercice, export PDF / Excel en FCFA. |
| 23/10/2026 | **Règle par rubrique** pour tous les KPI, hors exceptions E1 à E5 (§2) : CA et courbe sur `XB`, Charges vs Produits sur les rubriques R / T, Top 10 clients sur `BI`, amortissements reconnus par rubrique, repli des journaux de trésorerie sur les rubriques, tiers des saisies par rubrique. États Financiers **mois par mois** avec Cumul N et Cumul N-1 (§17). Carte **Charges et rentabilité** (§22). Rubriques des écritures saisies calculées par le Mapping (§19). Année conservée entre onglets, bascule des saisies sans changer d'onglet (§4, §20). Schémas de réponse des API rétablis et mis à jour (§25). Document déplacé dans le dépôt (`docs/`), PDF régénéré par `npm run docs:metrics`. |
| 24/10/2026 | Saisie d'écritures : une ligne porte **soit un débit, soit un crédit** (l'autre colonne est grisée, refus serveur sinon) ; sur un compte client ou fournisseur (rubriques `BI`, `DI`, `DJ`, `BH`), le **tiers est obligatoire** (champ en rouge, refus serveur sinon) ; les tiers du Plan tiers sont acceptés même jamais mouvementés ; points bloquants listés sous le tableau (§19). |
| 26/10/2026 | États Financiers : **Bilan** et **Compte de Résultat** rétablis dans leur présentation d'origine (exercices comparés, BRUT / AMORT / NET, mode périodique ou cumulé) ; la vue mois par mois devient un **3e sous-onglet « Compte d'exploitation »** : 12 mois en net périodique + TOTAL cumulé depuis janvier, REF et libellés figés, inclus dans les exports (Excel 4 onglets, PDF en A3 paysage pour ce tableau) — §17, §18, §25.6, §25.17. |
| 26/10/2026 | Tables de dimension › Plan tiers : nouvelle colonne **Compte centralisateur** — compte collectif (rubrique BI, DI, DJ ou BH : 401…, 411…) sur lequel le tiers est mouvementé dans le grand livre, avec son intitulé du plan comptable (« 411100 — Collectif Client Ménages » ; plusieurs comptes séparés par « ; »). Colonne calculée : recherchable, filtrable, triable, non modifiable, absente du fichier exporté au format de dépôt (§3). |
| 26/10/2026 | Compte d'exploitation **borné au mois du filtre** : colonnes de janvier au mois choisi (décembre en granularité Année), TOTAL = cumul de janvier à ce mois (« CUMUL JANV. - JUIL. ») ; export identique, en A4 jusqu'à 8 colonnes de montants, A3 au-delà (§17, §18, §25.17). |
| 27/10/2026 | Compte d'exploitation : confirmé que le **mode de calcul ne s'applique pas** — chaque mois reste indépendant (mouvements du seul mois), en périodique comme en cumulé, et seule la colonne TOTAL cumule de janvier au mois du filtre ; texte explicatif de l'écran précisé en ce sens (§18). |
| 27/10/2026 | Charges et rentabilité : les lignes à **0 %** ne figurent plus au classement — cascade sans les catégories ni les autres produits nuls (CA et résultat net toujours affichés), tableau des poids sans les catégories nulles en N et en N-1, pont de résultat sans facteur nul, détail sans rubrique vide (§22). |
| 27/10/2026 | **Filtres partagés — correction** : la granularité démarrait toujours sur « Mois » alors que le choix initial (Périodique ou Cumulé) calcule sur l'**année entière** ; le filtre affichait « Mois : Février » sur des chiffres annuels (Compte d'exploitation de janvier à décembre, Compte de résultat sur l'année…). La granularité est désormais déduite du mode initial et un garde-fou maintient le calcul aligné sur la granularité et le mois affichés, dans tous les onglets (§4). |

---

*Document généré à partir du code source — plan comptable SYSCOHADA révisé.*
