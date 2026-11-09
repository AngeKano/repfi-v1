# Audit Qualité — Reporting financier (KPI, Charts, Bilan, Filtres)

> Audit en lecture seule des calculs, graphiques et filtres du reporting (comptabilité SYSCOHADA, données ClickHouse `grand_livre`). Toutes les références sont au format `fichier:ligne`. Les 3 anomalies critiques ont été recoupées manuellement.

**Périmètre**
- Backend : `src/app/api/clients/[id]/reporting/route.ts` (R), `.../recouvrement/route.ts` (REC), `.../dettes/route.ts` (DET)
- Frontend : `src/components/reporting/client-reporting-chart.tsx`, `client-bilan-tab.tsx`, `client-dettes-tab.tsx`
- État des filtres : `src/app/clients/[id]/client-details-client.tsx`

**Format des dates en base** : `date_transaction = DD/MM/YYYY` → `substring(_,1,2)`=jour, `substring(_,4,2)`=mois, `substring(_,7,4)`=année.

---

## 1. Inventaire

### 1.1 Backend — calculs

**SIG (Soldes Intermédiaires de Gestion)** `calculerSIG` (`R:888-953`) :

| SIG | Formule | Rubriques |
|---|---|---|
| XA Marge commerciale | `TA + RA + RB` | TA, RA, RB |
| XC Valeur ajoutée | `XA + TB+TC+TD + TE..TI + RC..RJ` | TB..TD, TE..TI, RC..RJ |
| XD EBE | `XC + RK` | RK |
| XE Résultat exploitation | `XD + TJ + RL` | TJ, RL |
| XF Résultat financier | `TK+TL+TM + RM+RN` | TK..TM, RM, RN |
| XH Résultat HAO | `TN+TO + RO+RP` | TN, TO, RO, RP |
| XI Résultat net | `XG + XH + RQ + RS` (XG = XE+XF) | RQ, RS |

**KPIs dérivés** `calculerIndicateursPeriode` (`R:955-1035`) : Chiffre d'affaires (`assujetti ? XB = TA+TB+TC+TD : Créances Clients TTC (rubrique BI)`), masse salariale (`|RK|`), trésorerie (Total Trésorerie **par rubrique** : BS… − dépréciations − DRA/DRB/DRC/DQ, `lib/reporting/tresorerie.ts`), taux de recouvrement, créances/encaissements (rubrique **BI** hors 418/419 sur `compte` **et** `n_tiers`, + 4495 ; **solde** des comptes, séparés par type de journal — `lib/reporting/creances.ts`), `produitsAdditionnels` (TE..TI), `totalAchats` (`|RA..RJ|`), `impotResultat` (`|RS|`).

**Top 10** : clients (2 branches assujetti/non-assujetti, `R:644-792`), créances (`REC:154-216`), dettes par type et par fournisseur (`DET:218-335`).

### 1.2 Frontend — KPI & charts (par onglet)

| Onglet | KPI cards | Graphiques |
|---|---|---|
| **Synthèse** | CA, masse salariale, rés. exploitation, rés. net, trésorerie, marge (configurables) | Évolution Trésorerie (cumulé), Charges vs Produits |
| **Chiffres** | CA N, CA N-1 | Évolution CA (N vs N-1), CA par Nature, Top 10 clients |
| **Résultats** | Rés. exploitation/financier/HAO/net (+ VA, EBE masqués) configurables | Tunnel de rentabilité |
| **Recouvrement** | Taux, créances, encaissements (configurables) | Évolution taux, Créances vs Encaissements, Top 10 créances |
| **Dettes** | 5 dettes + taux remboursement (configurables, mode verrouillé cumulé) | Évolution taux remboursement, Dette fourn. vs remboursée, Top 10 (type + fournisseur) |
| **Bilan** | — (rapport narratif) | CA, taux recouvrement, créances/encaissé, trésorerie, tunnel, Top 10 créances — **toujours cumulé** |

---

## 2. Anomalies (analyse préliminaire)

Sévérité : 🔴 Critique · 🟠 Moyen · 🟡 Mineur. Statut : ✅ corrigé · ⬜ à traiter.

| # | Sév. | Statut | Anomalie | Localisation |
|---|---|---|---|---|
| **A1** | 🔴 | ✅ | **Top 10 clients « assujetti TVA »** — la jointure `numero_piece+date_transaction` dupliquait `montant_ht` (fan-out : lignes 411 multiples / TVA / produits), faussant CA et %. **Corrigé** par une CTE `tiers_piece` (`DISTINCT`, comptes 41* uniquement). | `R:690-733` |
| **A2** | 🔴 | ✅ | **Dettes `dailyBaseline` ignoré par l'API** — la baseline cumulée Jan→M-1 était toujours appliquée en granularité jour, y compris en *Périodique + Mois* (baseline devait être 0). **Corrigé** : param lu et baseline conditionnée. | `dettes/route.ts:431-449` |
| **A3** | 🟠 | ✅ | **« Chiffre d'affaires » avait 2 définitions** : KPI assujetti = `XB` (rubriques TA-TD) ≠ courbe = comptes **70**. **Corrigé** : le KPI CA (assujetti) reprend le CA cumulé de la courbe (dernier point) → KPI = Bilan = tendance. **23/10/2026** : la courbe elle-même est désormais calculée sur les **rubriques XB** (TA+TB+TC+TD) et non plus sur les comptes 70 → KPI = courbe = SIG = Charges et rentabilité. | `R:1373,1605` |
| **A4** | 🟠 | ✅ | **« Taux de recouvrement »** : formule **identique partout** (`encaissements / créances`) — vérifié ; les 3 emplacements donnent la même valeur à fenêtre égale (les écarts de fenêtre relèvent de A7/A8). Sa variation N-1 est un **delta en points**, **non affichée** côté UI → clarifiée par commentaire. | `R:989,1310` / `REC:310-340` |
| **A5** | 🟠 | ✅ | **Évolution CA** : `isCumule` excluait `ytd-day`. **Corrigé** : `isCumule = periodType === "ytd" \|\| periodType === "ytd-day"` (aligné sur ChargesVsProduits) → libellé et clés cohérents en mode Cumulé. | `client-reporting-chart.tsx` (EvolutionCA) |
| **A6** | 🟠 | ✅ | **Réconciliation Top10 ↔ totaux**. **Corrigé** : (a) le dénominateur du Top 10 clients non-assujetti reçoit `AND n_tiers != ''` (même périmètre que les lignes) ; (b) le `pourcentageTotal` du Top 10 créances est calculé sur le **total global** de tous les clients (`sum(...) OVER ()`) et non sur la seule somme du Top 10. | `R:778-794`, `REC:176-214` |
| **A7** | 🟠 | ✅ | **Recouvrement « périodique » inaccessible / code mort**. **Corrigé** : état `recouvrementMode` (toujours `cumule`) **supprimé** ; fetch + label de période simplifiés ; sub-label KPI « Sur la période sélectionnée » → « Cumulé : Janvier → mois sélectionné ». | `client-reporting-chart.tsx` |
| **A8** | 🟠 | ✅ | **Bilan : option « Périodique » trompeuse**. **Corrigé** : le sélecteur « Mode calcul » est remplacé par un indicateur **« Cumulé » verrouillé** (le Bilan cumule toujours) ; granularité pilotée par `cumulGranularity`. | `client-bilan-tab.tsx` |
| **A9** | 🟠 | ✅ | **« Solde » créances/dettes = flux net de l'exercice** (Jan→mois). **Décision retenue** : conserver le périmètre exercice (pas de report à-nouveau) et **aligner les libellés** (narration + descriptions → « solde de l'exercice »). Le vrai reste-dû cumulé reste un choix produit non retenu. | `REC:135-151`, `DET:517-525` |
| **A10** | 🟠 | ⬜ | **Risque multi-exercices** dans R : les filtres SQL portent sur le mois sans l'année ; la séparation N / N-1 repose uniquement sur le bornage des `batchIds`. | `R:206,543,659` |
| **A11** | 🟡 | ⬜ | Légende Trésorerie : couleur pastille (`#5FC7B9`) ≠ tracé (`hsl(174,72%,46%)`), et `colorN1` non transmis (pastille N-1 hérite de N). | `client-bilan-tab.tsx:835`, `client-reporting-chart.tsx:1807` |
| **A12** | 🟡 | ⬜ | `formatCompactOnly` dupliqué en 3 versions divergentes, dont un `replace(/ /g, " ")` no-op (bug copier-coller). | dettes:209, chart:1088, bilan:986 |
| **A13** | 🟡 | ⬜ | Unité incohérente : KPI « 120 000K » sans « FCFA », Bilan « K FCFA », axe en M / tooltip en K. | divers |
| **A14** | 🟡 | ⬜ | Doublons : `calculerVariation` réécrit inline (`R:611-616`) ; requête flux charges/produits répétée ×3 (`R:810,857,1691`). | R |
| **A15** | 🟡 | ⬜ | `singleMonth` toujours `true` sans `startPeriod` (flag trompeur) ; Top 10 dettes trié par flux (`montant_dette`) vs Top créances trié par solde. | `DET:428,239` |

---

## 3. Méthodologie de tests qualité

Quatre familles de contrôles, par ordre de rentabilité :

1. **Invariants de réconciliation** (assertions sur n'importe quelle période) :
   - `Σ(Top10.pourcentage) ≤ 100` et `Σ(lignes détaillées) == total` ;
   - `CA_KPI ≈ dernier point cumulé de la courbe CA` (détecte A3) ;
   - identités SIG : `XI == XG + XH + RQ + RS`, `XE == XD + TJ + RL` ;
   - `taux_recouvrement == encaisse / créances` identique aux 3 endroits (détecte A4) ;
   - `créances == solde de la rubrique BI hors journaux de trésorerie` (hors 418/419, **compte ET n_tiers**, + 4495).
2. **Tests unitaires** des fonctions pures : `calculerSIG`, `calculerVariation`, `getYearToDateMonths`, builders de fenêtre de période (valeurs golden).
3. **Cohérence inter-endpoints** : même métrique / même fenêtre ⇒ même valeur entre `/reporting`, `/recouvrement`, `/bilan`.
4. **Tests aux bornes des filtres** : `year / month / ytd / ytd-day`, février bissextile, mois unique, `dailyBaseline` (détecte A2).

---

## 4. Documentation des filtres

### 4.1 Cause racine
`periodType` (4 valeurs : `year / month / ytd / ytd-day`) encode **à la fois le mode (cumulé/périodique) ET la granularité (mois/jour/année)**, et **chaque onglet la réinterprète** : `/reporting` la lit telle quelle ; `dettes` la dérive en `mode`+`granularity` ; `bilan` la neutralise en `ytd`. D'où les divergences de fenêtre pour un même choix UI.

### 4.2 Mapping UI → état → API

| Filtre UI | État | Param API |
|---|---|---|
| Mode calcul (Périodique/Cumulé) | `periodType` (`year/month` vs `ytd/ytd-day`) | reporting `periodType` ; dettes `mode` ; bilan ignoré (force `ytd`) |
| Granularité (Année/Mois/Jour) | `periodType` + `cumulGranularity` | reporting `periodType` ; dettes `granularity`+`dailyBaseline` |
| Année | `year` | `year` ou `startPeriod/endPeriod` |
| Mois | `selectedMonth` | `month` / `endPeriod` |

### 4.3 Matrice « Mois » (divergence majeure)

| Filtre | Synthèse/Chiffres/Résultats | Dettes | Recouvrement | Bilan |
|---|---|---|---|---|
| Périodique + **Mois M** | jour-par-jour intra-M (baseline 0) | jour intra-M (baseline corrigée A2) | Jan→M cumulé | Jan→M cumulé (A8) |
| Cumulé + Mois M (ytd-day) | jour intra-M, baseline Jan→M-1 | jour, baseline Jan→M-1 | Jan→M | Jan→M cumulé |
| Cumulé + Année (ytd) | Jan→Déc mensuel cumulé | Jan→Déc mensuel | Jan→Déc | Jan→Déc cumulé |
| Trésorerie / solde | toujours cumulé | solde clôture cumulé | solde créances cumulé | toujours cumulé |

---

## 5. Système de contrôle qualité — DÉPLOYÉ ✅

Deux composants livrés (sans dépendance externe) :

### 5.1 Invariants purs — `src/lib/reporting/qc-invariants.ts`
Fonctions pures (testables) encodant les règles §3 : `checkAttributedNotExceedTotal` (A1), `checkSharesBounded`, `checkRateBounded`, `checkIdentity`, `checkNoForbiddenPrefix` (418/419), `checkSingleExercise`, `summarize`. Chaque check renvoie `{ id, label, severity, status: pass|warn|fail, expected, actual, ecart?, detail? }`.

### 5.2 Endpoint self-check — `GET /api/clients/[id]/reporting/qc?year=YYYY&endMonth=MM`
Exécute des requêtes ClickHouse **indépendantes** (vérification croisée, pas une copie du code audité) sur Janvier→endMonth, puis applique les invariants. Contrôles actifs :

| ID | Contrôle | Détecte |
|---|---|---|
| C2 | Taux de recouvrement ∈ [0 ; 100] | A4 / saisies anormales |
| C3 | Σ parts Top 10 créances ≤ 100% | A6 |
| C4 | Aucun tiers 418/419 dans les créances | exclusion 418/419 |
| A1 | CA attribué ≤ CA total HT (assujetti) **ou** Σ parts Top clients ≤ 100% (non-assujetti) | **A1 (fan-out)** |
| A10 | Aucun batch ne mélange plusieurs exercices | A10 |

Réponse : `{ client, period, checks: QcCheck[], summary: { total, pass, warn, fail, ok } }`.

**Exemple** : `GET /api/clients/<id>/reporting/qc?year=2024&endMonth=12`
→ `summary.fail === 0` ⇒ reporting réconcilié pour la période.

### 5.3 Reste à faire (optionnel)
- Suite `vitest` sur les fonctions pures (`qc-invariants.ts`) — non configurée dans le repo (`npm i -D vitest` requis).
- Panneau admin appelant l'endpoint pour une supervision visuelle.

---

## 6. Formulation des KPI par rubrique (règle du 23/10/2026)

**Règle** : tout KPI, graphique et contrôle se calcule sur les **rubriques** (mapping `ple` : rubriques PL du compte de résultat, rubriques BILAN de l'actif et du passif), et **non plus sur les numéros de compte**. Un numéro de compte n'apparaît que pour les **exceptions** listées en 6.2, toutes issues d'une définition métier explicite.

Conventions : produits et passif en `crédit − débit`, charges et actif en `débit − crédit`. « Journaux de trésorerie » = critère de **journal** (voir 6.3), pas de compte.

### 6.1 Liste des KPI et graphiques

| Onglet | KPI / graphique | Nouvelle formulation (rubriques) | Exception par compte | Ancienne formulation |
|---|---|---|---|---|
| Synthèse | Chiffre d'affaires (assujetti TVA) | `XB = TA + TB + TC + TD` | — | Comptes **70*** |
| Synthèse | Chiffre d'affaires (non assujetti) | Créances Clients TTC : solde **BI** hors journaux de trésorerie | hors 418/419, + 4495 | Inchangé (déjà BI) |
| Synthèse | Masse salariale | valeur absolue de `RK` | — | Inchangé |
| Synthèse | Masse salariale / CA | valeur absolue de `RK` / CA | — | Inchangé |
| Synthèse | Résultat d'exploitation | `XE = XD + TJ + RL` | — | Inchangé |
| Synthèse | Résultat net | `XI = XG + XH + RQ + RS` | — | Inchangé |
| Synthèse | Marge commerciale | `XA = TA + RA + RB` | — | Inchangé |
| Synthèse | Trésorerie / Évolution trésorerie | `BSA + BSB − BSB1 + BSC + BSD − BSD1 + BSE − BSE1 + BSF + BSG − DRA − DRB − DRC − DQ` | — | Inchangé (déjà rubriques) |
| Synthèse | Graphique Charges vs Produits | Charges = `Σ(débit − crédit)` des rubriques **RA à RS** ; Produits = `Σ(crédit − débit)` des rubriques **TA à TO** | — | Classes **6, 81, 83, 85, 87, 89** / **7, 82, 84, 86, 88** |
| Chiffre d'affaires | CA N / CA N-1, Évolution du CA | `XB = TA + TB + TC + TD` | — | Comptes **70*** |
| Chiffre d'affaires | Subventions d'exploitation | `TG` | — | Inchangé |
| Chiffre d'affaires | Produits par nature | Rubriques `TA, TB, TC, TD, TG` | — | Inchangé |
| Chiffre d'affaires | Top 10 clients (assujetti) | CA HT des rubriques `TA à TD + TG`, tiers retrouvé sur les lignes **BI** de la même pièce | hors 418/419 ; + 4495 (le tiers est sur la ligne) | Tiers retrouvé sur les comptes **41*** |
| Chiffre d'affaires | Top 10 clients (non assujetti) | Créances Clients TTC par tiers (solde **BI** hors journaux de trésorerie) — même définition que le KPI | hors 418/419, + 4495 | **Σ débits 41*** par tiers |
| Résultats | Marge commerciale, Valeur ajoutée, EBE, Rés. exploitation, Rés. financier, Rés. HAO, Rés. net | `XA, XC, XD, XE, XF, XH, XI` (SIG) | — | Inchangé |
| Résultats | Tunnel de rentabilité | SIG ci-dessus, base 100 = CA | — | Inchangé |
| Résultats | Charges et rentabilité | CA `XB` ; 12 catégories `RA…RF, RG, RH, RI, RJ, RK, RL, RM, RN, RO+RP, RQ, RS` ; autres produits `TE à TO` ; résultat `XI` | Contrôle indépendant : solde des comptes **6, 7, 8** | Nouveau |
| Recouvrement | Créances Clients TTC | Solde **BI** hors journaux de trésorerie | hors 418/419 (compte et tiers), + 4495 | Inchangé |
| Recouvrement | Encaissements Clients TTC | Solde **BI** sur journaux de trésorerie | idem | Inchangé |
| Recouvrement | Taux de recouvrement | Encaissements / Créances | idem | Inchangé |
| Recouvrement | Top 10 créances | Créances par tiers, même périmètre | idem | Inchangé |
| Recouvrement | DSO | Créances TTC = `BI − 414` ; CA TTC = `XB` + crédits TVA collectée | **414**, **4431 à 4435** | Inchangé |
| Règlement fournisseurs | Dettes fournisseurs TTC | Solde **DJ** hors journaux de trésorerie | hors 408/409 | Inchangé |
| Règlement fournisseurs | Décaissement fournisseurs TTC | Solde **DJ** sur journaux de trésorerie | hors 408/409 | Inchangé |
| Règlement fournisseurs | Taux de décaissement | Décaissements / Dettes | idem | Inchangé |
| Règlement fournisseurs | Top 10 dettes (type / fournisseur) | Rubriques `DJ, DK1, DK2, DK3, DH` | — | Inchangé |
| Dettes court terme | Fournisseurs, Personnel, Sociales, Fiscales, HAO, Total | `DJ`, `DK1`, `DK2`, `DK3`, `DH`, somme | — | Inchangé |
| Trésorerie | Total, Caisse, Banque, Régies, Établissements financiers, Instruments, Autres trésorerie passif, Monnaie électronique, Accréditifs | `Total` ci-dessus ; `BSA` ; `BSB − BSB1 − DRA − DRB` ; `BSC` ; `BSD − BSD1` ; `BSE − BSE1` ; `DRC + DQ` ; `BSF` ; `BSG` — passif et dépréciations en crédit − débit, dans les indicateurs comme dans le détail par compte (02/11/2026) | — | Inchangé (dépréciations reconnues par rubrique, plus par comptes 59*) |
| Trésorerie | Trésorerie par comptes | Comptes portant les rubriques du Total | — | Inchangé |
| Dettes financières | Dettes financières, Emprunts, Crédit-bail | `DA + DB`, `DA`, `DB` | — | Inchangé |
| Ratios bilantiels | FRNG, BFR global, BFR d'exploitation, BFR HAO | `DF − AZ` ; expl. + HAO ; `(BB−BB1) + (BH−BH1) + (BI−BI1) + (BJ−BJ1) − DI − DJ − DK − DM − DN` ; `(BA − BA1) − DH` | — | Inchangé |
| États financiers | Bilan Actif — BRUT / AMORT. et DÉPREC. / NET | Par rubrique ; AMORT = rubriques d'actif suffixées d'un chiffre (`AE1`, `AE2`, `BB1`, `BI1`, `BQ2`, `BSB1`…) | 4495 reclassé en `BJ` | AMORT = comptes **28, 29, 39, 49, 59** |
| États financiers | Bilan Passif, Compte de résultat | Par rubrique ; `CJ` += `XI` de la période | — | Inchangé |
| Bilan (rapport) | CA, recouvrement, trésorerie, tunnel, Top 10 | Reprend les définitions ci-dessus | idem | Suit les KPI |
| Transverse | Journaux de trésorerie (repli) | Journaux mouvementant `BSA…BSG`, `DRA`, `DRB` | — | Journaux mouvementant **52* / 57*** |
| Transverse | Contrôles QC (Top 10 clients) | Mêmes définitions que la production (BI, créances TTC) | hors 418/419, + 4495 | Comptes **41*** |
| Transverse | Rubrique des écritures saisies | Mapping `ple` (règle Airflow) | — | Héritée du grand livre |
| Comptabilité | Tiers d'une écriture saisie (champ actif, type de tiers) | Rubriques `BI`, `DI` → Client ; `DJ`, `BH` → Fournisseur | — | Comptes **40* / 41*** (401 → Fournisseur, 411 → Client) |

### 6.2 Exceptions conservées (numéros de compte)

| # | Exception | Où | Raison |
|---|---|---|---|
| E1 | Comptes **418 / 419** exclus (sur `compte` **et** `n_tiers`) | Créances, encaissements, Top 10 clients et créances, QC | Définition métier du recouvrement (factures à établir, avances clients) |
| E2 | Comptes **408 / 409** exclus | Dettes et décaissements fournisseurs | Définition métier du règlement fournisseurs |
| E3 | Compte **4495** (subventions à recevoir) | Créances clients, Top 10 clients, CA total des analyses ; reclassé en `BJ` au bilan | Le mapping le range en dettes fiscales (DK) ; demande explicite de l'intégrer |
| E4 | Compte **414** et TVA collectée **4431 à 4435** | DSO | Définition métier du DSO ; la TVA collectée n'a pas de rubrique propre (fondue dans DK) |
| E5 | Comptes **6, 7, 8** | Contrôle indépendant du résultat (Charges et rentabilité) | Le contrôle sert précisément à détecter les écritures de gestion sans rubrique : il ne peut pas reposer sur la rubrique |

### 6.3 Points d'attention

- **Effet sur les montants** : les KPI passés des comptes aux rubriques ne bougent pas si le mapping est complet. Toute écriture de gestion **sans rubrique** sort désormais du CA, des charges et des produits : l'écart apparaît dans le contrôle E5 et doit être corrigé dans le Mapping (Tables de dimension → Mapping, puis « Réappliquer le mapping »).
- **Top 10 clients non assujetti** : il suit maintenant la définition du KPI (solde hors journaux de trésorerie, avoirs déduits) au lieu des seuls débits : les montants par client baissent du montant des avoirs et des écritures de trésorerie.
- **Deux périmètres de CA coexistent**, par choix : `XB` (TA à TD) pour le KPI, la courbe, le SIG, Charges et rentabilité et le DSO ; `CA_RUBRIQUES` (XB + TG, + 4495) pour les analyses Top 10 clients. Les unifier est une modification d'une constante (`lib/reporting/etats-financiers.ts`).
- Définitions uniques : `lib/reporting/etats-financiers.ts` (XB, charges / produits, amortissements), `lib/reporting/creances.ts` (BI, DJ et exceptions E1 à E3), `lib/reporting/tresorerie.ts`, `lib/reporting/ratios-bilantiels.ts` (E4), `lib/reporting/analyse-charges.ts`.

---

## 7. Audit des filtres (02/11/2026)

Objectif : pour une même période, les mêmes résultats ; KPI et graphiques
conformes au filtre ; seules les périodes réellement importées sont
proposées.

### 7.1 Synthèse Financière (et Chiffre d'affaires / Résultats, même API `/reporting`)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| S1 | Année hors reporting acceptée : année courante par défaut, calage une seule fois par session (registre `anneesCalees`) ; l'API renvoyait `availableYears = [year]` sans période | 2026 affiché sans import 2026 ; au retour sur la fiche, l'année repartait sur l'année courante | L'API ne calcule qu'une année importée (sinon la plus récente) ; l'écran se cale à chaque réponse ; plus de repli `[year]` |
| S2 | Mois proposés : toujours janvier → décembre | Mois sans import choisissables, valeurs à 0 | Mois limités à la période saisie à l'import (`moisDisponibles`) ; mois hors reporting → dernier mois couvert |
| S3 | Granularité Année = janvier → décembre même pour un import partiel | « Janvier - Décembre 2026 » pour un import janvier → mars ; N-1 comparé sur 12 mois contre 3 | Fenêtre arrêtée au dernier mois importé, même fenêtre pour N-1 ; libellé « Janvier - Mars 2026 » |
| S4 | Cumulé + Mois M (`ytd-day`) : KPI calculés sur les **jours du mois M seulement** | Libellé « Janvier - M » mais KPI d'un seul mois ; CA (harmonisé sur la courbe) cumulé alors que les résultats ne l'étaient pas | KPI sur janvier → M (mois entiers) |
| S5 | Trésorerie en Périodique + Mois / Cumulé + Mois : somme des mouvements du mois | KPI Trésorerie = variation du mois, pas le solde ; courbe « solde toujours cumulé » partant de 0 | KPI = solde de janvier à la fin de M ; courbe partant du solde de fin de mois précédent |
| S6 | Cumulé + Mois : Charges vs Produits et subventions cumulés à partir de 0 | Courbes cumulées du seul mois sous un libellé « Janvier - M » | Départ au cumul janvier → M-1 (`baselineFlux`, base des subventions) |
| S7 | Mois lu sans tenir compte des à-nouveaux : un RAN daté du 31/12 précédent (accepté à l'import) tombait en **décembre** | Solde d'ouverture absent de janvier à novembre ; écart possible avec l'onglet Trésorerie, qui l'excluait | RAN de décembre compté en janvier (`MOIS_SQL`, `JOUR_SQL`, `YM_SQL`) dans la Synthèse et l'onglet Trésorerie |
| S8 | N-1 sans reporting affiché « 2025 : 0 » et « +100 % » | Comparaison trompeuse | « 2025 : non disponible », sans variation (Synthèse, Résultats, Chiffre d'affaires) |

### 7.2 Recouvrement Clients (API `/reporting/recouvrement`)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| R1 | Filtres propres à l'onglet (`recouvrementYear`, `recouvrementMonth`, `recouvrementGranularity`), initialisés à l'année et au mois courants, puis à « décembre » | En venant de la Synthèse sur « 2025, Mars », l'onglet affichait une autre période : résultats différents pour un même choix | L'onglet suit les filtres partagés (année, mois, granularité) ; mode toujours Cumulé |
| R2 | En-tête secondaire : années codées en dur (année courante + 2 → − 10) ; API sans contrôle de l'année ni du mois (défaut : mois courant) | Années et mois sans import choisissables, valeurs à 0 | Années et mois du reporting importé ; l'API ramène une année hors import sur la plus récente, un mois hors reporting sur le dernier mois couvert |
| R3 | Granularité Année = janvier → décembre même pour un import partiel | « Janvier - Décembre » et courbes plates après le dernier mois importé | Fenêtre arrêtée au dernier mois importé ; courbes limitées aux mois couverts |
| R4 | Lecture de tous les lots par date : un à-nouveau du 31/12 N-1 (lot N) tombait en décembre N-1 | Décembre N-1 compté deux fois (clôture du lot N-1 + à-nouveau du lot N) ; créances d'ouverture absentes de N | À-nouveau de décembre compté en janvier de l'exercice (`YM_SQL`) |
| R5 | Ligne « Total Top 10 » toujours à « 100 % » alors que chaque ligne est une part de **toutes** les créances | Total incohérent avec les lignes au-delà de 10 clients | Part réelle du Top 10 (`partTop10`) |

Le DSO de l'onglet vient de l'API des ratios bilantiels ; sa fenêtre sera
vérifiée avec l'onglet Ratios.

### 7.3 Règlement Fournisseurs (API `/reporting/dettes`)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| F1 | Années de l'onglet codées en dur (année courante + 2 → − 10), 12 mois toujours proposés, API sans contrôle (défaut : mois courant) | Années et mois sans import choisissables ; flèches d'année sur des années vides | Années et mois du reporting importé ; l'API ramène la période sur l'import et l'écran se cale sur la période calculée |
| F2 | Granularité Année = janvier → décembre même pour un import partiel ; libellé « Janvier - Décembre » | Courbes plates après le dernier mois importé | Fenêtre et libellé arrêtés au dernier mois importé |
| F3 | Lecture de tous les lots par date : à-nouveau du 31/12 N-1 en décembre N-1 | Décembre N-1 compté deux fois ; dettes d'ouverture absentes de N | À-nouveau de décembre compté en janvier (`YM_SQL`, `JOUR_SQL`) |
| F4 | Graphique « Dettes Fournisseurs TTC vs Décaissement Fournisseurs TTC » sur les crédits / débits **bruts** de DJ (408/409 et tous journaux compris) | Barres différentes des KPI portant le même nom | Mêmes définitions que les KPI ; légendes renommées comme les KPI |
| F5 | Top 10 fournisseurs : crédits / débits bruts de DJ, fournisseurs sans intitulé exclus, un fournisseur scindé si son intitulé varie, % = part du Top 10 | Classement et montants incohérents avec les KPI | Définitions des KPI, nom résolu par agrégat, compte si pas de tiers, % = part de toutes les dettes fournisseurs |
| F6 | Ligne « Total Top 10 » toujours à « 100 % » (composant partagé avec Dettes court terme) | Total incohérent dès 11 fournisseurs | Somme des parts affichées |

### 7.4 Dettes court terme (API `/reporting/dettes`, KPI d'encours)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| C1 | Flèches d'année en « année ± 1 » sans borne | N'importe quelle année atteignable, valeurs à 0 | Années d'un reporting importé ; flèches désactivées aux bornes |
| C2 | 12 mois toujours proposés ; pas de calage sur la période calculée | Mois sans import choisissables | Mois couverts par l'import ; le filtre se cale sur l'année et le mois renvoyés |
| C3 | Libellé « Janvier - Décembre » codé en dur ; sous-titre « encours au janvier - mars » | Fenêtre annoncée différente de la fenêtre calculée ; un encours se lit à une date | Libellé arrêté au dernier mois importé ; « encours à fin <mois> <année> » |
| C4 | Encours sans l'à-nouveau daté du 31/12 précédent (API partagée) | Dettes d'ouverture absentes | Corrigé avec le Règlement Fournisseurs (`YM_SQL`) |

Vérifié sans écart : le Top 10 par type reprend exactement le solde des KPI
(même fenêtre, `crédit − débit` par rubrique) ; « Dettes fournisseurs » porte
sur toute la rubrique `DJ` (vue bilan, hors exception E2).

### 7.5 Trésorerie (API `/reporting/tresorerie`)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| T1 | Année sans reporting remplacée en silence par la plus récente côté API ; l'écran gardait l'année demandée | « 2026 » affiché au-dessus des chiffres 2025 : même filtre, autres résultats | Le filtre se cale sur l'année et le mois renvoyés (`yearN`, `month`) |
| T2 | Flèches d'année en « année ± 1 » sans borne ; 12 mois proposés | Années et mois sans import atteignables | Années d'un reporting importé, flèches bornées ; mois couverts par l'import |
| T3 | Granularité Année = janvier → décembre ; libellé « Janvier - Décembre » | Fenêtre plus large que l'import | Fenêtre et libellé arrêtés au dernier mois importé |
| T4 | Exercice d'un lot lu dans `year` (saisi à l'import) et non dans la date de début, contrairement aux autres onglets | Écart possible avec la Synthèse sur un lot mal daté | Année de début de période (UTC), comme partout |
| T5 | N-1 sans reporting : « 2025 : 0 » et « +100 % » | Comparaison trompeuse | « non disponible », sans variation (cartes et tableau) |

Déjà traité plus tôt dans la journée : convention de signe du détail par
compte alignée sur les indicateurs (passif en crédit − débit) et à-nouveaux
de décembre comptés en janvier (`YM_SQL`).

### 7.6 Dettes Financières (API `/reporting/ratios`, partagée avec Ratios bilantiels et le DSO)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| DF1 | Encours lus sur le lot de N dans la fenêtre janvier → décembre par date : un à-nouveau daté du 31/12 N-1 en était **exclu** | Soldes d'ouverture absents : FRNG, BFR, dettes financières et DSO faux dès janvier | À-nouveau de décembre compté en janvier (`YM_SQL`, `MOIS_SQL`) — pas de double compte, seul le lot de N est lu |
| DF2 | Créances d'ouverture du DSO lues sur la seule date du 01/01 | Créances d'ouverture à 0 si les à-nouveaux sont datés du 31/12 | Journaux d'à-nouveaux (RAN, AN), à défaut écritures du 01/01 |
| DF3 | Année sans reporting remplacée en silence côté API ; flèches « année ± 1 » sans borne ; 12 mois proposés | Filtre sur une année, chiffres d'une autre | Calage du filtre sur `yearN` / `month` ; années et mois du reporting importé |
| DF4 | Fenêtre « Année » janvier → décembre pour un import partiel | Courbe et libellé au-delà de l'import | Arrêt au dernier mois importé ; courbe du premier au dernier mois couvert |
| DF5 | Variation à +100 % quand N-1 = 0 quel que soit le signe ; N-1 sans reporting affiché 0 | Comparaison trompeuse | Variation signée ; « non disponible » sans variation |

L'onglet Ratios bilantiels et le DSO du Recouvrement profitent des corrections
de l'API (DF1, DF2, DF5) ; l'écran des Ratios reste à aligner (audit suivant).

### 7.7 Ratios bilantiels (écran ; API `/reporting/ratios` corrigée en 7.6)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| RB1 | Année remplacée en silence par l'API, l'écran gardant l'année demandée ; flèches « année ± 1 » ; 12 mois proposés | Filtre sur une année, ratios d'une autre | Calage du filtre sur `yearN` / `month` ; années et mois du reporting importé |
| RB2 | Libellé « Janvier - Décembre » et sous-titre « encours cumulés au janvier - … » | Fenêtre annoncée différente de la fenêtre calculée | Libellé arrêté au dernier mois importé ; « encours à fin <mois> <année> » |
| RB3 | Courbes N-1 (FRNG, BFR, et DSO du Recouvrement) tracées même sans reporting N-1 | Courbe plate à 0 comparée à N | Courbe et légende N-1 masquées ; « (N-1 non disponible) » |

Vérifié sans écart : le KPI est la valeur du dernier point de la courbe (même
série, fin du mois de fenêtre).

### 7.8 États financiers (API `/reporting/etats-financiers` et `/reporting/compte-exploitation`)

| # | Faille constatée | Effet visible | Correction |
|---|---|---|---|
| EF1 | Exercice d'un lot lu dans `year` (saisi à l'import) et non dans la date de début, contrairement aux autres onglets | Écart possible avec les autres onglets sur un lot mal daté | Année de début de période (UTC), dans les deux API |
| EF2 | Année sans reporting : exercice N = la plus récente **qui la précède** (aucun exercice si l'année précède tout import) ; l'écran gardait l'année demandée | « 2026 » affiché au-dessus du bilan 2025 ; « Aucune donnée » sur une année ancienne | Année du filtre si importée, sinon la plus récente ; le filtre se cale sur `yearN` / `month` |
| EF3 | 12 mois toujours proposés, mois hors import acceptés | Bilan « au 31/12 » d'un import arrêté en avril, comparé au 31/12 N-1 | Mois couverts par l'import ; mois hors reporting → dernier mois couvert |
| EF4 | Granularité Année = janvier → décembre pour tous les exercices | Import janvier → avril : bilan N au 30/04 contre bilan N-1 au 31/12, compte de résultat sur 4 mois contre 12 ; libellé « Janvier - Décembre » | Fenêtre arrêtée au dernier mois importé, la même pour tous les exercices comparés ; libellé « Janvier - Avril » |
| EF5 | Fenêtre lue par date `AAAAMM` : un à-nouveau daté du 31/12 N-1 (accepté à l'import) en était **exclu** | Bilan sans soldes d'ouverture, donc déséquilibré | À-nouveau de décembre compté en janvier (`YM_SQL`) — pas de double compte, seul le lot de l'exercice est lu |
| EF6 | Exercice N écarté s'il n'avait aucune écriture sur la fenêtre | N-1 présenté en première colonne sous un filtre N | N toujours en première colonne ; seuls les exercices antérieurs vides sont écartés |
| EF7 | Compte d'exploitation de janvier à décembre en granularité Année, quel que soit l'import | Colonnes à 0 pour les mois non importés | Colonnes du premier mois importé (ou d'une saisie antérieure) au dernier mois importé ; total toujours cumulé depuis janvier, égal au Compte de résultat cumulé ; export et libellé « CUMUL » alignés |

Vérifié sans écart : le résultat net du bilan (`CJ`) reste le résultat
cumulé de janvier au mois de fin, en périodique comme en cumulé ; l'export
reprend la période et les exercices affichés.

**Reste à traiter dans les audits suivants** : les autres écrans et API (Charges et
rentabilité, QC) filtrent encore la période par
`concat(substring(date, 7, 4), substring(date, 4, 2))` et ont chacune leur
propre gestion de l'année et du mois ; à aligner sur `src/lib/reporting/periode.ts`
après vérification de leur sélection de lots (un RAN ne doit jamais être
compté deux fois). Limite connue : un exercice décalé (ex. juillet → juin) est
regroupé par numéro de mois.

## Journal des corrections

| Date | Anomalie | Action |
|---|---|---|
| Audit initial | A1 | Fan-out de jointure Top 10 clients assujetti corrigé (CTE `tiers_piece` DISTINCT, comptes 41*). |
| Audit initial | A2 | `dailyBaseline` lu par l'API dettes ; baseline conditionnée (0 en périodique-mois). |
| Système QC | §5 | Module d'invariants purs + endpoint `/reporting/qc` déployés (valide A1, A4, A6, 418/419, A10 sur données réelles). |
| Harmonisation | A3 | KPI CA (assujetti) aligné sur le CA70 cumulé de la courbe (les deux branches du GET). |
| Harmonisation | A4 | Taux de recouvrement : formule unique confirmée ; variation en points documentée (non affichée). |
| UI | Résultats | KPI Résultat HAO masqué par défaut ; grille passée en 3×2 (`grid-cols-3`, 6 KPI cascade SIG) ; clé localStorage `v2`. |
| Harmonisation | A5 | Évolution CA : `ytd-day` désormais traité comme cumulé (libellé + clés). |
| Harmonisation | A6 | Dénominateur Top 10 clients non-assujetti aligné (`n_tiers != ''`) ; % Top 10 créances calculé sur le total global (`OVER ()`). |
| UI / nettoyage | A7 | Recouvrement : suppression de l'état mort `recouvrementMode` ; label KPI/période clarifié (cumulé). |
| UI | A8 | Bilan : mode verrouillé sur « Cumulé » (option Périodique retirée), granularité simplifiée. |
| Labels | A9 | Narration + descriptions « solde » alignées sur le calcul réel (exercice). Décision : périmètre exercice conservé (pas de report à-nouveau). |
| 21/10/2026 | Définitions | Recouvrement Clients : créances = solde BI hors 418/419 **hors journaux de trésorerie**, encaissements = solde des mêmes comptes **sur journaux de trésorerie uniquement** (Synthèse, Recouvrement, QC). Règlement Fournisseurs : dettes = solde DJ hors 408/409 hors trésorerie, décaissements = solde DJ hors 408/409 sur trésorerie. Journal de trésorerie = type « Trésorerie » de `code_journal` + `CAIS`/`BQ` (repli : journaux mouvementant 52*/57*). Définitions uniques : `lib/reporting/creances.ts`. |
| 21/10/2026 | Trésorerie | Calcul entièrement par rubrique (actif BS… et passif DRA/DRB/DRC/DQ) ; nouveau KPI « Autres Trésorerie Passif » (DRC + DQ) ; Banque = BSB − BSB1 − DRA − DRB ; trésorerie de la Synthèse alignée sur le Total Trésorerie (plus de comptes 52/57). |
| 21/10/2026 | États financiers | Vue mois par mois : chaque mois de janvier au mois du filtre est calculé en **périodique** (mouvements du mois, à-nouveau en janvier), suivi du **Cumul N** (somme des mois = janvier → mois) et du **Cumul N-1** (même fenêtre). À l'écran : un mois à la fois (flèches ‹ › dans l'en-tête), REF et libellé figés. Actif : NET par mois, BRUT / AMORT / NET au cumul N, NET au cumul N-1. CJ de chaque période = CJ classé + XI de la même période. Export PDF (A3 paysage au-delà de 8 colonnes) et Excel (volets figés) avec tous les mois. |
| 23/10/2026 | Saisies | Rubrique des écritures saisies calculée par la table **Mapping** (`ple`), même règle qu'Airflow (`PleIndex.classify` : racine la plus longue, exclusions, sens du solde du compte sur le lot) — `lib/clickhouse/ple.ts`. Saisies existantes sans rubrique reclassées à l'ouverture de l'onglet Comptabilité. |
| 23/10/2026 | Résultats | Nouvelle carte « Charges et rentabilité » (spécification Click Insight F01–F14 et document de référence) : cascade CA (XB = TA à TD) → 12 catégories de charges (RA–RS) → autres produits hors CA (TE à TO, dont TG, couleur du CA) → résultat net ; détail catégorie → rubriques → comptes → écritures ; poids de chaque charge dans le CA N / N-1, écart en points et impact sur le résultat ; pont de résultat ; contrôle du résultat contre le solde des comptes 6/7/8 (N et N-1) ; alertes périodes non comparables (date de situation = fin du dernier mois mouvementé), CA nul (n.a.) ou négatif ; commentaire automatique. Calculs : `lib/reporting/analyse-charges.ts` ; API `/reporting/charges`. |
| 23/10/2026 | Rubriques | **Règle générale : KPI par rubrique, plus par numéro de compte** (voir §6). Bascules : CA et courbe du CA → `XB` (TA à TD) au lieu des comptes 70 ; Charges vs Produits → rubriques RA à RS / TA à TO au lieu des classes 6/7/8 ; Top 10 clients → lignes BI au lieu des comptes 41 (non assujetti : Créances Clients TTC par tiers) ; contrôles QC alignés ; amortissements et dépréciations de l'actif reconnus par rubrique (AE1, BB1, BSB1…) au lieu des comptes 28/29/39/49/59 ; repli des journaux de trésorerie sur les rubriques BS… / DRA / DRB au lieu des comptes 52/57 ; libellés « comptes 70 / 41 » des écrans client remplacés. Exceptions conservées E1 à E5 (§6.2). |
| 23/10/2026 | Synthèse | L'année choisie n'est plus écrasée par l'exercice le plus récent au retour sur un onglet de reporting ni à la bascule « Prendre en compte les saisies » (calage une seule fois par client). |
| 23/10/2026 | Saisies | Tiers des écritures saisies déterminés par la **rubrique** (BI, DI → Client ; DJ, BH → Fournisseur) et non plus par les préfixes 40/41 — `lib/comptable/saisie-refs.ts` (`exigeTiers`, `typeTiersRubrique`) ; un compte du plan jamais mouvementé reçoit sa rubrique du Mapping dans la liste de saisie. Catalogue `metrics.md` / `metrics.pdf` mis à jour (§2 règle et exceptions, §17 mois par mois, §22 Charges et rentabilité). |
| 23/10/2026 | Documentation | Catalogue des métriques intégré au dépôt : `docs/metrics.md` (source) et `docs/metrics.pdf` (`npm run docs:metrics`, script `scripts/docs/metrics-pdf.js`). Schémas de réponse des API rétablis et à jour (§25), KPI par onglet (§23), historique des mises à jour (§29). Mis à jour à chaque évolution du reporting, comme ce journal. |
| 24/10/2026 | Saisies | Contrôles de saisie : une ligne porte **soit un débit, soit un crédit** (l'autre colonne est grisée, refus serveur sinon) ; sur un compte client ou fournisseur (rubriques `BI`, `DI`, `DJ`, `BH`), le **tiers est obligatoire** (champ en rouge, refus serveur sinon) ; les tiers du Plan tiers sont acceptés même jamais mouvementés ; points bloquants listés sous le tableau (§19). |
| 26/10/2026 | États financiers | **Bilan** et **Compte de Résultat** rétablis dans leur présentation d'origine (exercices comparés, BRUT / AMORT / NET, mode périodique ou cumulé) ; la vue mois par mois devient un **3e sous-onglet « Compte d'exploitation »** : 12 mois en net périodique + TOTAL cumulé depuis janvier, REF et libellés figés, inclus dans les exports (Excel 4 onglets, PDF en A3 paysage pour ce tableau) — §17, §18, §25.6, §25.17. |
| 26/10/2026 | Référentiels | Plan tiers : nouvelle colonne **Compte centralisateur** — compte collectif (rubrique BI, DI, DJ ou BH : 401…, 411…) sur lequel le tiers est mouvementé dans le grand livre, avec son intitulé du plan comptable (« 411100 — Collectif Client Ménages » ; plusieurs comptes séparés par « ; »). Colonne calculée : recherchable, filtrable, triable, non modifiable, absente du fichier exporté au format de dépôt (§3). |
| 26/10/2026 | États financiers | Compte d'exploitation **borné au mois du filtre** : colonnes de janvier au mois choisi (décembre en granularité Année), TOTAL = cumul de janvier à ce mois (« CUMUL JANV. - JUIL. ») ; export identique, en A4 jusqu'à 8 colonnes de montants, A3 au-delà (§17, §18, §25.17). |
| 27/10/2026 | États financiers | Compte d'exploitation : confirmé que le **mode de calcul ne s'applique pas** — chaque mois reste indépendant (mouvements du seul mois), en périodique comme en cumulé, et seule la colonne TOTAL cumule de janvier au mois du filtre ; texte explicatif de l'écran précisé en ce sens (§18). |
| 27/10/2026 | Résultats | Charges et rentabilité : les lignes à **0 %** ne figurent plus au classement — cascade sans les catégories ni les autres produits nuls (CA et résultat net toujours affichés), tableau des poids sans les catégories nulles en N et en N-1, pont de résultat sans facteur nul, détail sans rubrique vide (§22). |
| 27/10/2026 | Filtres | **Correction** : la granularité démarrait toujours sur « Mois » alors que le choix initial (Périodique ou Cumulé) calcule sur l'**année entière** ; le filtre affichait « Mois : Février » sur des chiffres annuels (Compte d'exploitation de janvier à décembre, Compte de résultat sur l'année…). La granularité est désormais déduite du mode initial et un garde-fou maintient le calcul aligné sur la granularité et le mois affichés, dans tous les onglets (§4). |
| 28/10/2026 | Référentiels | Plan tiers : le **compte centralisateur** est désormais **lu dans la table `plan_tiers`** (nouvelle colonne `compte_collectif`, alimentée par Airflow depuis le compte général de rattachement du fichier Sage .pnc), avec l'intitulé du plan comptable ; le grand livre ne sert plus que de repli quand la colonne est vide (Plan tiers importé en Excel, table pas encore réimportée). Airflow : colonne ajoutée aux tables existantes, un import sans compte collectif n'efface pas la valeur connue (§3). |
| 29/10/2026 | Résultats | Charges et rentabilité : **montant (en K, ÷ 1 000) et pourcentage du CA dans la barre** quand elle est assez large, **infobulle au survol** de chaque barre (libellé, montant K, %), curseur main ; colonne des rubriques retirée de la cascade et colonne « Référence » retirée du tableau des poids ; « n.d. » remplacé par une case vide (§22). |
| 29/10/2026 | Navigation | Fiche client : « Retour aux clients » et la devise remontés en haut de la colonne ; onglets regroupés sous **« Reporting financier »** (Synthèse … Bilan d'activité), puis Membres, Import, Comptabilité, Autres fichiers (§26). |
| 29/10/2026 | Navigation | Fiche client : **« Reporting financier » en accordéon** (en-tête cliquable avec chevron, ouvert par défaut ; replié, l'en-tête reste surligné si un onglet du groupe est affiché) ; libellés sur deux lignes alignés à gauche ; bouton **Rafraîchir** déplacé sous le titre de la page, et il recharge désormais les données de l'onglet en cours (§26). |
| 29/10/2026 | Résultats | Charges et rentabilité : colonne des valeurs à droite de la cascade **retirée** — montant (K) et pourcentage se lisent dans la barre ou dans l'infobulle ; la barre occupe la place libérée (§22). |
| 02/11/2026 | Résultats | Charges et rentabilité : pourcentage du CA **entre parenthèses** dans les barres et l'infobulle — « −11 766K (55,11 %) » (§22). |
| 02/11/2026 | Import | **Import d'une période avec le Grand Livre seul** : Plan comptable, Plan des tiers et Codes journaux deviennent facultatifs (écran de création, « Modifier » et fenêtre d'ajout). Airflow **contrôle le Grand Livre avant toute écriture** : un compte (après conversion PCG → SYSCOHADA), un code journal (RAN compris) ou un n° de tiers absent des référentiels — en base ou dans les fichiers du même import — fait échouer l'import sans rien enregistrer, avec le nombre d'éléments manquants et les 20 premiers par catégorie ; on complète les référentiels puis « Relancer le traitement ». Un nouvel envoi remplace entièrement les fichiers de la période ; l'échec du contrôle n'efface pas les données d'une période déjà importée. « Modifier » corrigé (il attendait encore les 5 anciens fichiers) et soumis au droit Charger des fichiers (§3, §25.18 à §25.20). |
| 02/11/2026 | Filtres | **Audit des filtres — États financiers** (Bilan, Compte de résultat, Compte d'exploitation) : exercice d'un lot lu à la date de début de période (et non au champ `year`) ; année sans reporting ramenée sur la plus récente et filtre calé sur la période calculée (une année antérieure à tout import ne donnait plus aucun exercice) ; mois limités au reporting importé ; granularité Année arrêtée au dernier mois importé, même fenêtre pour tous les exercices comparés (le bilan N au 30/04 était comparé au bilan N-1 au 31/12, le compte de résultat sur 4 mois contre 12) ; à-nouveau daté du 31/12 précédent compté en janvier (il était exclu : bilan sans soldes d'ouverture) ; exercice N toujours en première colonne ; Compte d'exploitation du premier mois importé au mois du filtre (plus de colonnes à 0 hors import), total toujours cumulé depuis janvier (§4, §17, §18, §25.6, §25.17). |
| 02/11/2026 | Import | **Import — contrôle des référentiels limité aux référentiels non joints** : un référentiel joint à l'import (plan comptable, codes journaux, plan tiers) fait foi et n'est plus contrôlé, comme avant ; un import complet (4 fichiers) n'est jamais bloqué par le contrôle. Seuls les référentiels absents de l'import, pris dans Click Insight, sont contrôlés (Grand Livre seul, ou incomplet). Cause : un import complet refusé pour « 4 codes journaux inconnus : CAI, BQU, PAI, VTE » alors qu'un fichier de codes journaux était joint — le format Sage .pnm porte le code journal sur 3 caractères (§3). |
| 02/11/2026 | Filtres | **Audit des filtres — Ratios bilantiels** : écran aligné sur la période calculée (l'API remplaçait en silence une année sans reporting), flèches et mois limités à l'import, libellé et sous-titre « encours à fin <mois> » ; courbes et légendes N-1 (FRNG, BFR, DSO du Recouvrement) masquées sans reporting N-1, au lieu d'une courbe plate à 0 ; corrections de l'API (à-nouveaux, variation signée) héritées de l'audit Dettes Financières (§16 ; audit §7.7). |
| 02/11/2026 | Filtres | **Audit des filtres — Dettes Financières** (API des ratios, partagée avec Ratios bilantiels et le DSO du Recouvrement) : à-nouveau daté du 31/12 précédent désormais compté dans les encours (il était exclu de la fenêtre janvier → décembre : soldes d'ouverture manquants pour FRNG, BFR, dettes financières, DSO) ; créances d'ouverture du DSO lues sur les journaux d'à-nouveaux (et plus seulement à la date du 01/01) ; année sans reporting : le filtre se cale sur l'année calculée (l'API la remplaçait en silence) ; flèches et mois limités à l'import, fenêtre « Année » arrêtée au dernier mois importé ; variation signée quand N-1 = 0 ; N-1 sans reporting « non disponible » (§15, §16, §25.5 ; audit §7.6). |
| 02/11/2026 | Filtres | **Audit des filtres — Trésorerie** : l'API remplaçait en silence une année sans reporting par la plus récente pendant que l'écran affichait l'année demandée (« 2026 » au-dessus des chiffres 2025) : le filtre se cale désormais sur l'année calculée ; flèches d'année bornées aux années importées, mois limités à l'import, fenêtre « Année » arrêtée au dernier mois importé ; exercice d'un lot = année de début de période (comme les autres onglets) ; N-1 sans reporting : « non disponible », sans variation (cartes et tableau) (§11, §25.4 ; audit §7.5). |
| 02/11/2026 | Filtres | **Audit des filtres — Dettes court terme** : flèches d'année limitées aux années d'un reporting importé (elles allaient à n'importe quelle année), mois limités à l'import, calage du filtre sur la période calculée, libellé arrêté au dernier mois importé (« Janvier - Décembre » codé en dur), sous-titre « encours à fin <mois> » ; à-nouveaux de décembre comptés en janvier (API partagée avec Règlement Fournisseurs) (§14 ; audit §7.4). |
| 02/11/2026 | Filtres | **Audit des filtres — Règlement Fournisseurs** : années de l'onglet = reporting importé (liste codée en dur auparavant), mois limités à l'import, calage du filtre sur la période calculée, fenêtre « Année » arrêtée au dernier mois importé ; à-nouveau du 31/12 précédent compté en janvier (doublait décembre N-1) ; graphique « Dettes Fournisseurs TTC vs Décaissement Fournisseurs TTC » sur les définitions des KPI (il montrait les crédits / débits bruts de DJ, 408/409 et tous journaux compris) ; Top 10 fournisseurs sur ces mêmes définitions, fournisseurs sans intitulé inclus, un seul rang par fournisseur, % = part de toutes les dettes fournisseurs ; ligne « Total Top 10 » = somme des parts (§13, §25.3 ; audit §7.3). |
| 02/11/2026 | Filtres | **Audit des filtres — Recouvrement Clients** : l'onglet utilise désormais les **filtres partagés** (année, mois, granularité ; mode toujours Cumulé) au lieu de ses propres sélecteurs (année et mois courants par défaut, liste d'années codée en dur) ; années et mois limités au reporting importé, fenêtre « Année » arrêtée au dernier mois importé ; à-nouveau daté du 31/12 précédent compté en janvier (lu sur tous les lots, il doublait décembre N-1 et manquait en N) ; ligne « Total Top 10 » : part réelle du Top 10 au lieu de « 100 % » (§12, §25.2 ; audit §7.2). |
| 02/11/2026 | Filtres | **Audit des filtres — Synthèse Financière** (et Chiffre d'affaires / Résultats, même API) : années et mois limités au reporting importé (plus d'année ni de mois sans import ; l'écran se cale sur l'année la plus récente et le dernier mois couvert, la fenêtre « Année » s'arrête au dernier mois importé, même fenêtre pour N-1) ; Cumulé + Mois = janvier → mois pour les KPI (ils ne portaient que sur le mois) ; Trésorerie toujours un solde de janvier à la fin de la période (le périodique mensuel n'en donnait que le mouvement) ; courbes cumulées en Cumulé + Mois parties du cumul janvier → mois précédent (Charges vs Produits, subventions) ; à-nouveaux datés du 31/12 précédent comptés en janvier (Synthèse et Trésorerie) ; N-1 sans reporting affiché « non disponible », sans variation (§4, §25.1 ; audit §7). |
| 02/11/2026 | Trésorerie | **Trésorerie — détail par compte aligné sur les indicateurs** : un compte de passif (rubrique D…, solde normal créditeur) ou de dépréciation est lu en **crédit − débit**, soit (débit − crédit) × −1, dans « Trésorerie par comptes » comme dans les indicateurs ; 565000 (DQ, débiteur de 1) vaut −1 dans le tableau comme dans « Autres Trésorerie Passif » (il valait 1 dans le tableau). Ces comptes sont repérés « en moins » et déduits ; la ligne Total Trésorerie reprend l'indicateur. Indicateurs inchangés. **Variations** : quand N-1 = 0, ±100 % selon le signe de N (de 0 à −1 n'affiche plus « +100 % ») — tous les KPI, Produits par Nature, Trésorerie (§11, §24). |
| 02/11/2026 | Référentiels | Tables de dimension › Mapping : la colonne **Rubrique par défaut** est placée **avant** la colonne Rubrique (Racine, Rubrique par défaut, Rubrique, Type…) (§3). |
| 02/11/2026 | Comptabilité | Comptabilité (grand livre) et Tables de dimension : la pagination indique les lignes affichées, « Lignes 51 à 75 sur 1 636 », au lieu de « 1636 lignes · 25/page » (total sans séparateur de milliers) (§19). |
| 02/11/2026 | Résultats | Résultats : chaque carte KPI affiche sa **formule en rubriques** sous le libellé, comme les autres onglets — Excédent Brut d'Exploitation « XD = XC + RK (Valeur ajoutée − Charges de personnel) », ainsi que Marge commerciale, Valeur ajoutée, Résultat d'exploitation, financier, net et HAO (§7, §23). |
| 02/11/2026 | Application | Nom de l'application : **REPFI remplacé par Click Insight** dans tous les textes visibles (titre de l'onglet du navigateur, e-mail de demande de démo, noms des fichiers de la présentation, titre de ce catalogue). Les identifiants techniques (bases `repfi_*`, clés de stockage, DAG Airflow) ne changent pas. |
| 02/11/2026 | Navigation | Fiche client : **Rafraîchir** passe en tête de la colonne de gauche ; **Retour aux clients** et la **devise** (FCFA, unité K FCFA) passent sous le titre de la page, à la place de Rafraîchir (§26). |
| 02/11/2026 | Affichage | **Graphiques masquables** : chaque graphique des onglets de reporting (hors KPI) s'affiche ou se masque depuis le menu **« Graphiques »**, à côté de « Configurer les KPIs » (Bilan d'activité : au bout de la barre de filtres) — une case par graphique, « Tout afficher », nombre de graphiques masqués sur le bouton ; mémorisé par onglet et par client dans le navigateur (§23). |
| 02/11/2026 | Référentiels | Tables de dimension › Mapping : nouvelle colonne **Rubrique par défaut**, en lecture seule — rubrique attribuée à la **création** de la ligne (mapping par défaut SYSCOHADA pour un nouveau client, rubrique saisie ou du fichier pour une ligne ajoutée), **jamais modifiée** ensuite, même quand la rubrique change (saisie ou fichier). Colonne `ple.rubrique_defaut` ajoutée par Airflow aux tables existantes et renseignée depuis le mapping par défaut (sinon rubrique actuelle) ; recherchable, filtrable, triable, absente du fichier exporté (§3). |
| 02/11/2026 | Filtres | **Filtres partagés — correction** : en mode Périodique, le choix de granularité (Mois / Année) était aussitôt annulé par le garde-fou du 27/10, qui alignait le calcul sur l'ancienne granularité ; les filtres restaient bloqués (sur l'année le plus souvent). Tout changement de mode ou de granularité met désormais à jour les deux ensemble, dans tous les onglets (§4). |
| 04/11/2026 | Affichage | **Séparateur de milliers visible partout** : les formats **K et M sont conservés** (« 12 222K », « 1 234M »), seul le séparateur change. `toLocaleString("fr-FR")` séparait par une espace fine (U+202F), presque invisible, et les axes des graphiques n'en avaient aucun (« 12222K ») : tous les affichages passent par `src/lib/nombres.ts` (espace insécable U+00A0) — KPI, tableaux, infobulles, axes, Bilan d'activité, Charges et rentabilité, États financiers, Comptabilité (y compris les champs Débit / Crédit hors frappe), compteurs de lignes, tailles de fichier, présentation, messages d'erreur de l'import. Export Excel du grand livre : Débit, Crédit et Solde au format `#,##0.00`, valeurs inchangées (§24). |
| 04/11/2026 | Trésorerie | Trésorerie › Trésorerie par comptes : badge **« en moins »** retiré, ainsi que la mention « (comptes « en moins » déduits) » de la ligne Total. Le calcul ne change pas (§11). |
| 06/11/2026 | Accès | **Accès au reporting par membre** : dans l'onglet **Membres** du dossier, un administrateur définit quels KPI, graphiques, tableaux et commentaires (80 éléments, 11 onglets) un collaborateur ne voit pas, dans une fenêtre, sans changer de page. Par défaut tout est visible. Un élément masqué disparaît de l'écran, des menus de configuration et des exports, et son montant n'est plus envoyé par l'API (§23). L'**ancienne page d'assignation est supprimée** : assigner et retirer se font dans le même onglet. **Matrice des droits** : nouveau droit « Définir les KPI et métriques visibles par membre » (administrateurs) ; les droits existants ne changent pas, mais plusieurs n'étaient pas appliqués et le sont désormais : Voir le reporting (LOADER n'y a plus accès, écran et API), Exporter un rapport (Télécharger des États financiers réservé à ADMIN_ROOT et ADMIN_PARTENAIRE), Voir les fichiers et Exporter les fichiers finaux (VIEWER ne lit plus le grand livre), Voir les membres. Document **« Accès »** : `docs/acces.pdf`, généré depuis le code par `npm run docs:acces`. Nouvelle table `member_reporting_access` (§25.21, §25.22). |
| 06/11/2026 | Accès | **Droits de la matrice jusque-là non référencés : application** (matrice inchangée). **Contrôle ajouté** : `FICHIERS_ACTIONS.SUPPRIMER` sur `DELETE /api/files/comptable/periods/[periodsId]`, `/api/files/normal/[fileId]` et `/api/folders/[folderId]`, qui ne vérifiaient que la session, avec le nouveau `requireClientAccess` (assignation au dossier pour les rôles sans `VOIR_TOUS`) ; `MEMBRES_ACTIONS.ACTIVER` sur le passage d'inactif à actif de `PATCH /api/users/[id]`, et `POST /api/users` crée un membre inactif si le créateur n'a pas ce droit ; `FICHIERS_ACTIONS.VOIR_HISTORIQUE` sur la liste `updates` de `GET /api/clients/[id]/dimensions` ; `ENTREPRISE_ACTIONS.VOIR_INFOS` sur le bloc `company` de `GET /api/auth/session`, Paramètres › Comptes et la carte du tableau de bord ; `ENTREPRISE_ACTIONS.CREER_COMPTE` sur `POST /api/auth/register/company` et `/register/user`, ouvertes à tous (`/register/user` acceptait n'importe quelle entreprise et n'importe quel rôle, ADMIN_ROOT compris). **Fonctionnalité absente, aucun contrôle** : `ABONNEMENT_ACTIONS.*`, `CLIENTS_ACTIONS.ACTIVER`, `ENTREPRISE_ACTIONS.MODIFIER_INFOS`, `REPORTING_ACTIONS.CREER / MODIFIER / SUPPRIMER`. **Volontairement non contrôlé** : `POST /api/auth/signup`, public par nature, et le choix du pack qu'il porte. **Vérifié** sur une base PostgreSQL locale jetable : 78 cas HTTP (6 rôles, anonyme, dossier non assigné, autre entreprise) et écrans ; branches qu'aucun rôle n'atteint aujourd'hui testées en retirant temporairement les droits. **Relevé, non corrigé** : `checkUserAccess` (`/api/users/[id]`) et `checkClientAccess` (`/api/clients/[id]`) ne vérifient pas l'entreprise de la cible ; les autres routes de fichiers, de dossiers, de référentiels et de saisie ne vérifient pas l'assignation au dossier ; l'onglet « Autres Fichiers », grisé, planterait s'il était réactivé (`FilesTabs` hors de `<Tabs>`) ; `handleDeletePeriod` de `client-reporting-chart.tsx` n'est relié à aucun bouton ; la page `/register/user` appelle des routes inexistantes. |
| 09/11/2026 | Accès | **Attribution des dossiers et page Membres en fenêtres** : « Voir tous les clients » est réservé aux administrateurs (ADMIN_ROOT, ADMIN_CF, ADMIN_PARTENAIRE) ; **LOADER_PLUS et VIEWER** ne voient plus, comme LOADER, que les dossiers qui leur sont **attribués, aucun par défaut**. Dans l'onglet Membres d'un dossier, les administrateurs figurent **d'office** (« Retirer » grisé) ; un administrateur ne s'assigne pas (400). Page **Membres** : création, consultation, modification et désactivation dans des **fenêtres**, avec le choix du rôle et des dossiers attribués ; les pages `/users/new` et `/users/[id]` sont supprimées ; la page est réservée au droit « Voir les membres ». API `/users` : `clientIds` à la création et en modification (remplace la liste ; ajout : Assigner un membre, retrait : Retirer un membre) ; un membre d'une autre entreprise est désormais introuvable. Document « Accès » : nouvelle section « Attribution des dossiers » (§23, §25.21, §25.23). |
| 09/11/2026 | Affichage | **Un seul bouton « Configurer l'affichage »** par onglet, à la place de « Configurer les KPIs » et du menu « Graphiques » : il met KPI et graphiques en mode configuration. Les KPI se masquent et s'échangent entre eux (glisser-déposer), les **graphiques aussi, entre graphiques** (glisser-déposer ou flèches ↑ ↓), avec un bouton Masquer / Afficher sur chacun ; un graphique masqué reste visible en configuration pour pouvoir le rétablir. Le bouton indique le nombre d'éléments masqués. Bilan d'activité : graphiques masquables, sans déplacement (liés au texte de leur section). **Trésorerie par comptes** : chaque compte en **débit − crédit**, sa contribution au Total (un découvert ou une dépréciation est négatif) ; la somme de la colonne est le Total Trésorerie (§11, §23, §25.4). |
| 09/11/2026 | Accès | **Isolation des dossiers et attribution sur les routes de fichiers : correction** (`matrix.ts` et `actions.ts` inchangés). **Reproduit sur une base jetable avant correction** (sur `4300c48` ; ces routes n'ont pas changé depuis) : 41 cas HTTP en échec, dont un ADMIN_ROOT de l'entreprise A qui modifie et **supprime** un dossier de B, et, pour les membres, change le mot de passe d'un membre de B (corrigé depuis par l'attribution des dossiers, ligne précédente). **Isolation** : `checkClientAccess` filtre sur le `companyId` de la session ; un dossier d'une autre entreprise donne 404, comme un identifiant inexistant. **Attribution** : `requireClientAccess` ajouté sur `files/comptable/upload`, `update`, `trigger-etl` (POST, GET), `status/[batchId]`, `periods` (GET), `files/download/[periodId]`, `download/comptable`, `download/normal/[fileId]`, `files/normal` (GET), `normal/upload`, `normal/download/[fileId]`, `folders` (POST, GET), `folders/[folderId]` (PATCH), `clients/[id]/dimensions` (GET, POST), `dimensions/reclassement`, `dimensions/trigger`, `dimensions/tables/[referentiel]` (GET, PATCH, POST), `saisie` (GET, POST, PUT, DELETE), `saisie/[entryId]` (PATCH, DELETE), `saisie/export`, `reporting-settings`. **Listes sans `clientId`** (`periods`, `trigger-etl` GET, `folders` GET) : nouveau `filtreDossiersAccessibles`, sinon toute l'entreprise était renvoyée. **Contournement fermé** : `POST /api/folders` acceptait le `parentId` d'un autre dossier, même d'une autre entreprise, et renvoyait ce parent ; il doit désormais appartenir au même dossier client (404). **Aucune route de la liste écartée** ; les `DELETE` de période, de fichier et de dossier, déjà contrôlés, ne changent pas. **Code conservé** : les routes qui répondaient déjà 403 pour une autre entreprise (`update`, `trigger-etl`, `status`, `dimensions/trigger`, `saisie`, `saisie/export`, `periods/[periodsId]`) le gardent. **Vérifié** sur la matrice de ce jour : 153 cas HTTP sans échec (autre entreprise, non attribué, attribué, administrateur voyant tous les dossiers, LOADER, LOADER_PLUS, VIEWER ; branches de saisie et `reporting-settings` par LOADER_PLUS, seul rôle à avoir `SAISIE_ACTIONS.GERER` sans voir tous les dossiers) ; `tsc --noEmit` sans erreur. S3, ClickHouse et Airflow étant absents, le cas « attribué » de plusieurs routes vérifie que le contrôle est franchi (400, 500 ou 502 ensuite), pas le traitement complet. **Relevé, non corrigé** : VIEWER, sans `FICHIERS_ACTIONS.VOIR` ni `CHARGER`, obtient 200 ou 201 sur ses dossiers attribués avec `GET` et `POST /api/folders`, `PATCH /api/folders/[folderId]`, `comptable/status/[batchId]`, et franchit le contrôle de `download/normal/[fileId]` et `normal/download/[fileId]` : ces routes ne vérifient aucun droit de la matrice ; les pages `clients/[id]/declaration/create`, `update` et `status/[batchId]` vérifient l'entreprise mais pas l'attribution (leurs API refusent désormais) ; un ADMIN_CF peut remplacer le mot de passe d'un autre ADMIN_CF (`PATCH /api/users/[id]` laisse passer une cible de même rôle). |
| 09/11/2026 | Accès | **Droits de la matrice sur les routes de fichiers qui n'en vérifiaient aucun, et attribution sur les pages d'import : correction** du relevé de la ligne précédente (`matrix.ts` et `actions.ts` inchangés). **Droit retenu, d'après `docs/acces.pdf`** : `FICHIERS_ACTIONS.VOIR` (« Voir fichiers chargés ») sur `GET /api/folders`, `GET /api/files/comptable/status/[batchId]` (même droit que la page de statut qui l'appelle), `GET /api/files/download/normal/[fileId]` et `GET /api/files/normal/download/[fileId]` (télécharger un fichier importé, c'est le consulter : la page `/files` et l'onglet qui les appellent exigent ce droit) ; `FICHIERS_ACTIONS.CHARGER` (« Charger des fichiers ») sur `POST /api/folders` et `PATCH /api/folders/[folderId]`, l'organisation de l'espace de dépôt, la suppression restant sous `SUPPRIMER`. `requirePermission` remplace le seul contrôle de session ; le contrôle d'entreprise et `requireClientAccess` suivent, inchangés. **Effet de bord** : ADMIN_CF et ADMIN_PARTENAIRE (`VOIR` sans `CHARGER`) ne créent ni ne renomment plus de sous-dossier ; leur seul écran, l'onglet « Autres fichiers » (`FilesTabs`), est désactivé (`DISABLED_TAB_IDS`) et affiche ces boutons sans condition : à masquer par une prop `canUploadFiles` quand l'onglet sera rétabli. **Pages** `clients/[id]/declaration/create`, `update` et `status/[batchId]` : `filtreDossiersAccessibles` ajouté à la lecture du dossier, un dossier non attribué renvoie à `/clients` comme `clients/[id]/page.tsx`. **Écran du VIEWER** : inchangé et cohérent, la fiche du dossier ne lui propose ni Import, ni Comptabilité, ni Autres fichiers (`canViewFiles`), `/files` et la page de statut le renvoient. **Reproduit sur une base jetable avant correction** : 15 cas HTTP en échec sur 67 (VIEWER : 200 ou 201 sur les six routes ; ADMIN_CF : 201 et 200 sur la création et le renommage ; LOADER et LOADER_PLUS non attribués : pages d'import affichées). **Vérifié après** : 67 cas sans échec (anonyme, VIEWER attribué, LOADER et LOADER_PLUS attribués et non attribués, ADMIN_CF, ADMIN_ROOT, autre entreprise), et non-régression de l'isolation et de l'attribution : 153 cas sans échec ; `tsc --noEmit` sans erreur. S3 étant absent, le cas « attribué » des téléchargements vérifie que le contrôle est franchi (500 ensuite), pas le téléchargement. |
| 09/11/2026 | Accès | **Modification d'un membre de même rôle : correction** du relevé de la ligne « Isolation des dossiers » (`matrix.ts` et `actions.ts` inchangés ; refus entre pairs confirmé par l'utilisateur). **Reproduit sur une base jetable avant correction** : un ADMIN_CF remplace le mot de passe et le prénom d'un autre ADMIN_CF de son entreprise (200), de même entre deux ADMIN_ROOT et entre deux ADMIN_PARTENAIRE, alors que le message de la route annonce un refus pour un rôle « supérieur ou égal ». **Cause** : `targetRole !== sessionRole && !canManageRole(...)` exemptait tout le rôle de l'utilisateur connecté pour lui laisser modifier son propre profil, et donc aussi ses pairs ; la page Membres reprenait la même règle (`roleMembre === acteur`) et affichait « Modifier » sur un pair. **Correction** : l'exemption ne vaut plus que pour soi-même (`isSelf`) dans `src/app/api/users/[id]/route.ts` ; `peutModifier` de `src/app/users/page.tsx` suit la même règle. **Effet** : dans une entreprise qui a deux administrateurs de même rôle, l'un ne corrige plus le profil de l'autre ; il faut un rôle supérieur. **Vérifié** : 21 cas sans échec (4 échecs avant correction) : pair refusé (403, rien de modifié) pour ADMIN_ROOT, ADMIN_CF et ADMIN_PARTENAIRE ; soi-même accepté (200, mot de passe remplacé) pour ces trois rôles et pour LOADER_PLUS, LOADER et VIEWER, qui n'ont pas « Modifier un membre » ; rôle inférieur accepté ; rôle supérieur refusé ; VIEWER sur un autre VIEWER refusé ; autre entreprise 404 ; page Membres d'un ADMIN_CF : « Modifier » absent sur l'autre ADMIN_CF et sur l'ADMIN_ROOT, présent sur soi et sur un ADMIN_PARTENAIRE. `tsc --noEmit` sans erreur. |
