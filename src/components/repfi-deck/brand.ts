// Identité de marque + palette centralisées.
// Changer BRAND / DEMO_URL ici se répercute sur tout le deck.

export const BRAND = "Click Insight";
export const DOMAIN = "repfi.envolperformance.com";
export const DEMO_URL = "https://repfi.envolperformance.com";
export const SITE_URL = "click-insight.com";

export const PALETTE = {
  /* ---- Accents partagés ---- */
  blue: "#2F73D7", // mot mis en valeur / primaire
  blueBright: "#4F9BFF",
  sky: "#38BDF8",
  indigo: "#6366F1",

  /* ---- Thème navy (slides 1,3,5,9) ---- */
  navy: "#06142E",
  navyTop: "#11366f", // point lumineux du dégradé radial
  navyMid: "#0a2150",
  navyDeep: "#040d20",
  panelSolid: "#0E2148",
  panelBorder: "rgba(125,165,235,0.18)",

  /* ---- Thème clair (slides 2,4,6,8) ---- */
  light: "#F2F7FD",
  lightCard: "#FFFFFF",
  lightBorder: "rgba(20,50,110,0.10)",
  ink: "#0B1F44", // texte foncé sur clair
  inkSoft: "#5B6B85", // texte secondaire sur clair

  /* ---- Texte sur navy ---- */
  white: "#FFFFFF",
  ice: "#CFE0FA",
  muted: "#8AA2C8",

  /* ---- Sémantique ---- */
  up: "#22C55E",
  down: "#F87171",
  gold: "#F2C14E",
} as const;

// Palette catégorielle pour les graphiques (donuts, séries...).
export const CHART_COLORS = [
  "#2F73D7",
  "#6366F1",
  "#38BDF8",
  "#F59E0B",
  "#22C55E",
];
