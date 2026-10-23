#!/usr/bin/env node
// ============================================================================
// Génère docs/metrics.pdf à partir de docs/metrics.md.
//
//   npm run docs:metrics
//
// 1. Convertit le Markdown en HTML paginé (sous-ensemble couvert : titres,
//    listes, tableaux, citations, blocs de code, règles horizontales, gras,
//    italique, code et liens).
// 2. Imprime le HTML en PDF avec Chrome (ou Edge) en mode headless.
//
// Navigateur : variable CHROME_PATH, sinon les emplacements usuels de Chrome
// et d'Edge sous Windows, macOS et Linux.
// ============================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const racine = path.resolve(__dirname, "..", "..");
const entree = path.join(racine, "docs", "metrics.md");
const sortiePdf = path.join(racine, "docs", "metrics.pdf");
const sortieHtml = path.join(os.tmpdir(), "repfi-metrics.html");

// ---------------------------------------------------------------------------
// Markdown → HTML
// ---------------------------------------------------------------------------
const echappe = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Mise en forme intra-ligne. Le code inline est extrait d'abord afin que son
// contenu ne soit pas réinterprété (un `**` dans du code doit rester littéral).
function inline(txt) {
  const codes = [];
  let t = echappe(txt).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  t = t
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

// Ancre d'un titre, au format GitHub : « 2. Règle de calcul : rubriques »
// → « 2-règle-de-calcul--rubriques ». Les liens de la table des matières
// fonctionnent ainsi aussi bien sur GitHub que dans le PDF.
const ancre = (titre) =>
  titre
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

function versHtml(md) {
  const lignes = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const estSeparateurTableau = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
  const cellules = (l) =>
    l
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, "|").trim());
  let i = 0;

  while (i < lignes.length) {
    const l = lignes[i];

    // Bloc de code
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lignes.length && !/^```/.test(lignes[i])) buf.push(lignes[i++]);
      i++;
      out.push(`<pre><code>${echappe(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // Tableau
    if (/^\s*\|/.test(l) && i + 1 < lignes.length && estSeparateurTableau(lignes[i + 1])) {
      const entetes = cellules(l);
      i += 2;
      const corps = [];
      while (i < lignes.length && /^\s*\|/.test(lignes[i])) corps.push(cellules(lignes[i++]));
      out.push(
        `<table><thead><tr>${entetes.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${corps
            .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`,
      );
      continue;
    }

    // Citation (encadré)
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lignes.length && /^>\s?/.test(lignes[i])) buf.push(lignes[i++].replace(/^>\s?/, ""));
      const paras = buf.join("\n").split(/\n{2,}/).filter((p) => p.trim());
      out.push(`<blockquote>${paras.map((p) => `<p>${inline(p.replace(/\n/g, " "))}</p>`).join("")}</blockquote>`);
      continue;
    }

    // Règle horizontale
    if (/^---+\s*$/.test(l)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Titres
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n} id="${ancre(h[2])}">${inline(h[2])}</h${n}>`);
      i++;
      continue;
    }

    // Listes
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordonnee = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lignes.length && /^\s*([-*]|\d+\.)\s+/.test(lignes[i])) {
        // Une ligne de suite indentée prolonge l'élément précédent.
        let item = lignes[i++].replace(/^\s*([-*]|\d+\.)\s+/, "");
        while (i < lignes.length && /^\s{2,}\S/.test(lignes[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lignes[i]))
          item += " " + lignes[i++].trim();
        items.push(item);
      }
      const t = ordonnee ? "ol" : "ul";
      out.push(`<${t}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${t}>`);
      continue;
    }

    // Paragraphe
    if (l.trim() === "") {
      i++;
      continue;
    }
    const buf = [];
    while (
      i < lignes.length &&
      lignes[i].trim() !== "" &&
      !/^(#{1,4}\s|>|```|---+\s*$|\s*\||\s*([-*]|\d+\.)\s)/.test(lignes[i])
    ) {
      buf.push(lignes[i++]);
    }
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
  }

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>REPFI — Catalogue des métriques</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10.5pt;
         line-height: 1.5; color: #1a1a1a; margin: 0; }
  h1 { font-size: 26pt; text-align: center; font-weight: 700; margin: 0 0 18px;
       line-height: 1.25; }
  h2 { font-size: 15pt; margin: 26px 0 10px; padding-bottom: 5px;
       border-bottom: 2px solid #0077C3; color: #00122E; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 18px 0 7px; color: #00122E; page-break-after: avoid; }
  h4 { font-size: 11pt; margin: 14px 0 6px; color: #335890; }
  p { margin: 7px 0; }
  a { color: #0077C3; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #d8dee6; margin: 20px 0; }
  ul, ol { margin: 7px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9.2pt;
         background: #f2f5f9; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f6f8fa; border: 1px solid #d8dee6; border-left: 3px solid #0077C3;
        padding: 9px 12px; border-radius: 4px; white-space: pre-wrap; }
  pre code { background: none; padding: 0; font-size: 9pt; line-height: 1.45; }
  blockquote { border: 1px solid #9AA9BC; border-left: 4px solid #0077C3;
               background: #f7fafd; margin: 12px 0; padding: 9px 14px;
               page-break-inside: avoid; }
  blockquote p { margin: 5px 0; font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin: 11px 0; font-size: 9.3pt; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  th, td { border: 1px solid #9AA9BC; padding: 5px 8px; text-align: left;
           vertical-align: top; }
  th { background: #ededed; font-weight: 600; color: #1a1a1a; }
  tr:nth-child(even) td { background: #fafbfc; }
</style></head>
<body>
${out.join("\n")}
</body></html>`;
}

// ---------------------------------------------------------------------------
// HTML → PDF (Chrome / Edge headless)
// ---------------------------------------------------------------------------
function trouverNavigateur() {
  const candidats = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const trouve = candidats.find((c) => fs.existsSync(c));
  if (!trouve) {
    throw new Error("Chrome ou Edge introuvable : renseignez la variable CHROME_PATH.");
  }
  return trouve;
}

fs.writeFileSync(sortieHtml, versHtml(fs.readFileSync(entree, "utf8")), "utf8");
execFileSync(
  trouverNavigateur(),
  [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--virtual-time-budget=5000",
    `--print-to-pdf=${sortiePdf}`,
    `file:///${sortieHtml.replace(/\\/g, "/")}`,
  ],
  { stdio: "ignore" },
);
console.log(`PDF généré : ${path.relative(racine, sortiePdf)}`);
