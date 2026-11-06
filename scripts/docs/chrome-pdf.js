// ============================================================================
// Impression d'un fichier HTML en PDF avec Chrome (ou Edge) en mode headless.
//
// Navigateur : variable CHROME_PATH, sinon les emplacements usuels de Chrome
// et d'Edge sous Windows, macOS et Linux.
// ============================================================================
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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

/** Imprime le fichier HTML dans le PDF demandé. */
function imprimerPdf(fichierHtml, sortiePdf) {
  execFileSync(
    trouverNavigateur(),
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--virtual-time-budget=5000",
      `--print-to-pdf=${sortiePdf}`,
      `file:///${fichierHtml.replace(/\\/g, "/")}`,
    ],
    { stdio: "ignore" },
  );
}

module.exports = { imprimerPdf };
