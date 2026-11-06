// ============================================================================
// Génère docs/acces.pdf, le document « Accès » : les droits de chaque type
// d'utilisateur, en tableaux récapitulatifs.
//
//   npm run docs:acces
//
// Les tableaux sont lus dans le code qui applique les droits (matrice, rôles,
// catalogue des éléments de reporting) : le document ne peut pas s'en écarter.
// À relancer dès qu'un droit, un rôle ou un KPI change.
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ACTION_CATEGORIES,
  ACTION_LABELS,
  REPORTING_ACTIONS,
  type PermissionAction,
} from "../../src/lib/permissions/actions";
import { hasPermission } from "../../src/lib/permissions/matrix";
import { canManageRole, getAllRoles, type RoleIdType } from "../../src/lib/permissions/roles";
import { LIBELLES_TYPES, NB_ELEMENTS, ONGLETS_REPORTING, type TypeElement } from "../../src/lib/reporting/elements";
import { imprimerPdf } from "./chrome-pdf";

const racine = path.resolve(__dirname, "..", "..");
const sortiePdf = path.join(racine, "docs", "acces.pdf");
const sortieHtml = path.join(os.tmpdir(), "click-insight-acces.html");

const INTITULES: Record<RoleIdType, string> = {
  ADMIN_ROOT: "Administrateur Principal",
  ADMIN_CF: "Administrateur Comptable",
  ADMIN_PARTENAIRE: "Administrateur Partenaire",
  LOADER_PLUS: "Assistant Comptable",
  LOADER: "Stagiaire Assistant Comptable",
  VIEWER: "Visiteur",
};

const roles = getAllRoles().sort((a, b) => a.level - b.level);
const OUI = `<span class="oui">✓</span>`;
const NON = `<span class="non">—</span>`;
const echappe = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const enTetesRoles = roles.map((r) => `<th class="role">${r.id.replace(/_/g, "_<wbr>")}</th>`).join("");

const lignesTypes = roles
  .map(
    (r) => `<tr>
      <td class="fort">${r.id}</td>
      <td>${INTITULES[r.id]}</td>
      <td>${echappe(r.description)}</td>
      <td class="centre">${hasPermission(r.id, REPORTING_ACTIONS.VOIR) ? OUI : NON}</td>
      <td class="centre">${hasPermission(r.id, REPORTING_ACTIONS.GERER_VISIBILITE) ? OUI : NON}</td>
    </tr>`,
  )
  .join("");

const lignesMatrice = Object.values(ACTION_CATEGORIES)
  .map(
    (categorie) => `<tbody class="groupe">
      <tr class="categorie"><td colspan="${roles.length + 1}">${echappe(categorie.label)}</td></tr>
      ${(categorie.actions as readonly PermissionAction[])
        .map(
          (action) => `<tr>
            <td>${echappe(ACTION_LABELS[action])}</td>
            ${roles.map((r) => `<td class="centre">${hasPermission(r.id, action) ? OUI : NON}</td>`).join("")}
          </tr>`,
        )
        .join("")}
    </tbody>`,
  )
  .join("");

// Qui peut restreindre qui : un administrateur, sur un rôle de niveau inférieur
// qui a accès au reporting.
const administrateurs = roles.filter((r) => hasPermission(r.id, REPORTING_ACTIONS.GERER_VISIBILITE));
const lignesRestriction = administrateurs
  .map(
    (a) => `<tr>
      <td class="fort">${a.id}</td>
      ${roles
        .map((cible) => {
          if (!hasPermission(cible.id, REPORTING_ACTIONS.VOIR)) return `<td class="centre gris">sans reporting</td>`;
          return `<td class="centre">${canManageRole(a.id, cible.id) ? OUI : NON}</td>`;
        })
        .join("")}
    </tr>`,
  )
  .join("");

const TYPES = Object.keys(LIBELLES_TYPES) as TypeElement[];
// La colonne porte déjà le type : « Commentaire : recouvrement » → « Recouvrement ».
const sansPrefixe = (label: string) => {
  const texte = label.replace(/^Commentaire : /, "");
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};
const lignesCatalogue = ONGLETS_REPORTING.map(
  (o) => `<tr>
    <td class="fort">${echappe(o.label)}<br><span class="gris">${o.elements.length} éléments</span></td>
    ${TYPES.map((type) => {
      const elements = o.elements.filter((e) => e.type === type);
      return `<td>${elements.length ? elements.map((e) => echappe(sansPrefixe(e.label))).join("<br>") : `<span class="gris">—</span>`}</td>`;
    }).join("")}
  </tr>`,
).join("");

const dateDuJour = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Accès</title>
<style>
  @page { size: A4 landscape; margin: 14mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10pt; color: #00122E; margin: 0; }
  header { border-bottom: 2.5pt solid #0077C3; padding-bottom: 8pt; margin-bottom: 14pt; }
  h1 { font-size: 26pt; margin: 0; color: #0077C3; letter-spacing: -0.5pt; }
  .sous-titre { font-size: 11pt; color: #335890; margin: 2pt 0 0; }
  .date { font-size: 8.5pt; color: #64748B; margin: 3pt 0 0; }
  h2 { font-size: 13pt; color: #0077C3; margin: 16pt 0 3pt; break-after: avoid; }
  p { margin: 0 0 7pt; line-height: 1.4; }
  .note { font-size: 9pt; color: #335890; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: #0077C3; color: #fff; font-weight: 600; font-size: 9pt; text-align: left; padding: 5pt 6pt; border: 0.5pt solid #0077C3; }
  th.role { text-align: center; font-size: 8pt; width: 76pt; }
  td { padding: 3.5pt 6pt; border: 0.5pt solid #D0E3F5; vertical-align: top; }
  tbody.groupe { break-inside: auto; }
  .categorie td { background: #EBF5FF; font-weight: 700; color: #00122E; break-after: avoid; }
  .centre { text-align: center; vertical-align: middle; }
  .fort { font-weight: 600; }
  .oui { color: #059669; font-weight: 700; font-size: 11pt; }
  .non { color: #94A3B8; }
  .gris { color: #94A3B8; font-size: 8.5pt; font-weight: 400; }
  .saut { break-before: page; }
  .bloc { break-inside: avoid; }
  ul { margin: 0 0 8pt; padding-left: 14pt; }
  li { margin-bottom: 3pt; line-height: 1.4; }
</style>
</head>
<body>
<header>
  <h1>Accès</h1>
  <p class="sous-titre">Click Insight : droits de chaque type d'utilisateur</p>
  <p class="date">Version du ${dateDuJour}, générée depuis le code de l'application.</p>
</header>

<h2>1. Les types d'utilisateurs</h2>
<table>
  <thead><tr><th style="width:110pt">Rôle</th><th style="width:150pt">Intitulé</th><th>Description</th><th style="width:66pt;text-align:center">Voit le reporting</th><th style="width:76pt;text-align:center">Définit la visibilité</th></tr></thead>
  <tbody>${lignesTypes}</tbody>
</table>

<h2>2. Visibilité des KPI et métriques</h2>
<ul>
  <li><strong>Par défaut, tout est visible.</strong> Un membre qui a accès à un dossier voit tous les KPI, métriques, graphiques et tableaux que son rôle autorise.</li>
  <li><strong>Seuls les administrateurs</strong> peuvent masquer des éléments à un collaborateur, un par un ou par onglet entier, depuis l'onglet <strong>Membres</strong> du dossier (bouton « Visibilité »).</li>
  <li><strong>Par membre et par dossier :</strong> un élément masqué sur un dossier reste visible sur les autres. Retirer un membre du dossier ne remet pas ses restrictions à zéro.</li>
  <li><strong>Effet :</strong> l'élément disparaît de l'écran, des menus de configuration et des exports, et son montant n'est plus envoyé au navigateur. Un onglet dont tous les éléments sont masqués disparaît de la navigation. Le membre est prévenu que des éléments lui sont masqués.</li>
</ul>
<p>Un administrateur ne restreint que les rôles de niveau inférieur au sien : ni lui-même, ni un pair, ni un supérieur.</p>
<table class="bloc">
  <thead><tr><th style="width:110pt">Peut restreindre</th>${enTetesRoles}</tr></thead>
  <tbody>${lignesRestriction}</tbody>
</table>
<p class="note"><strong>Limite :</strong> la visibilité porte sur le reporting. Un membre dont le rôle a accès à la Comptabilité ou aux fichiers importés peut y lire les écritures et en déduire un montant masqué. Pour une confidentialité stricte, attribuez-lui le rôle VIEWER, qui n'y a pas accès.</p>

<h2>3. Droits par rôle</h2>
<p class="note">${OUI} autorisé &nbsp;&nbsp; ${NON} non autorisé. Ces droits s'appliquent à tous les dossiers ; un rôle sans le droit « Voir tous les clients » n'accède qu'aux dossiers où il est assigné.</p>
<table>
  <thead><tr><th>Droit</th>${enTetesRoles}</tr></thead>
  ${lignesMatrice}
</table>

<h2 class="saut">4. Éléments dont la visibilité se définit (${NB_ELEMENTS})</h2>
<table>
  <thead><tr><th style="width:120pt">Onglet</th>${TYPES.map((t) => `<th>${LIBELLES_TYPES[t]}</th>`).join("")}</tr></thead>
  <tbody>${lignesCatalogue}</tbody>
</table>
</body>
</html>`;

fs.writeFileSync(sortieHtml, html, "utf8");
imprimerPdf(sortieHtml, sortiePdf);
console.log(`PDF généré : ${path.relative(racine, sortiePdf)}`);
