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
| Trésorerie | Total, Caisse, Banque, Régies, Établissements financiers, Instruments, Autres trésorerie passif, Monnaie électronique, Accréditifs | `Total` ci-dessus ; `BSA` ; `BSB − BSB1 − DRA − DRB` ; `BSC` ; `BSD − BSD1` ; `BSE − BSE1` ; `DRC + DQ` ; `BSF` ; `BSG` | — | Inchangé (dépréciations reconnues par rubrique, plus par comptes 59*) |
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
