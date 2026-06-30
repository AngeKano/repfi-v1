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

**KPIs dérivés** `calculerIndicateursPeriode` (`R:955-1035`) : Chiffre d'affaires (`assujetti ? XB : Σdébit 41*`), masse salariale (`|RK|`), trésorerie (`Σ(débit-crédit)` comptes 52+57), taux de recouvrement, créances/encaissements 41* (hors 418/419 sur `compte` **et** `n_tiers`), `produitsAdditionnels` (TE..TI), `totalAchats` (`|RA..RJ|`), `impotResultat` (`|RS|`).

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
| **A3** | 🟠 | ✅ | **« Chiffre d'affaires » avait 2 définitions** : KPI assujetti = `XB` (rubriques TA-TD) ≠ courbe = comptes **70**. **Corrigé** : le KPI CA (assujetti) reprend le CA70 cumulé (dernier point de la courbe) → KPI = Bilan = tendance. `XB` reste interne au SIG. | `R:1373,1605` |
| **A4** | 🟠 | ✅ | **« Taux de recouvrement »** : formule **identique partout** (`encaissements / créances`) — vérifié ; les 3 emplacements donnent la même valeur à fenêtre égale (les écarts de fenêtre relèvent de A7/A8). Sa variation N-1 est un **delta en points**, **non affichée** côté UI → clarifiée par commentaire. | `R:989,1310` / `REC:310-340` |
| **A5** | 🟠 | ✅ | **Évolution CA** : `isCumule` excluait `ytd-day`. **Corrigé** : `isCumule = periodType === "ytd" \|\| periodType === "ytd-day"` (aligné sur ChargesVsProduits) → libellé et clés cohérents en mode Cumulé. | `client-reporting-chart.tsx` (EvolutionCA) |
| **A6** | 🟠 | ✅ | **Réconciliation Top10 ↔ totaux**. **Corrigé** : (a) le dénominateur du Top 10 clients non-assujetti reçoit `AND n_tiers != ''` (même périmètre que les lignes) ; (b) le `pourcentageTotal` du Top 10 créances est calculé sur le **total global** de tous les clients (`sum(...) OVER ()`) et non sur la seule somme du Top 10. | `R:778-794`, `REC:176-214` |
| **A7** | 🟠 | ⬜ | **Recouvrement « périodique » inaccessible** : `recouvrementMode` figé sur `cumule`, sélecteur `disabled` → bloc périodique = code mort ; KPI « Sur la période sélectionnée » trompeur (en réalité Jan→mois). | `client-reporting-chart.tsx:865,954,3014` |
| **A8** | 🟠 | ⬜ | **Bilan : option « Périodique » trompeuse** — le Bilan force toujours `ytd` (cumulé, choix design) mais l'option Périodique reste sélectionnable. | `client-bilan-tab.tsx:295,405` |
| **A9** | 🟠 | ⬜ | **« Solde » créances/dettes = flux net annuel** (Jan→mois de l'année sélectionnée), pas le reste-dû réel (aucun report à-nouveau de l'exercice précédent). | `REC:341`, `DET:517-525` |
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
   - `créances == Σdébit41 − Σcrédit41` (hors 418/419, **compte ET n_tiers**).
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
