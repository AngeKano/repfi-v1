// Données des 9 slides Click Insight, alignées sur le PPTX de référence.

/* Slide 2 — proposition de valeur */
export const valueProps = [
  { icon: "Settings", label: "Automatisation" },
  { icon: "Cloud", label: "100 % SaaS" },
  { icon: "ShieldCheck", label: "Sécurisé" },
  { icon: "BadgeCheck", label: "Fiable" },
  { icon: "Clock", label: "Gain de temps" },
] as const;

/* Slide 3 — processus en 4 étapes */
export const processSteps = [
  { num: "01", icon: "BookOpen", title: "Grand Livre Général", desc: "Importez votre Grand Livre Général." },
  { num: "02", icon: "ListChecks", title: "Plan des Comptes", desc: "Importez votre Plan des Comptes." },
  { num: "03", icon: "Users", title: "Plan Tiers", desc: "Importez votre Plan Tiers." },
  { num: "04", icon: "Columns3", title: "Codes Journaux", desc: "Importez la liste des Codes Journaux." },
] as const;

/* Slide 4 — indicateurs clés (checklist) */
export const indicators = [
  "Évolution du chiffre d'affaires",
  "Évolution du résultat",
  "Taux de recouvrement client",
  "Taux de décaissement fournisseur",
  "État des créances et dettes",
  "Évolution de la trésorerie",
  "Bilan de l'activité",
] as const;

/* Slide 5 — zoom KPIs */
export type Kpi = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  chart: "line" | "bars" | "gauge" | "area";
  data?: number[];
  pct?: number;
};
export const kpis: Kpi[] = [
  { label: "Évolution du chiffre d'affaires", value: "2,45 M€", delta: "+18,6 %", trend: "up", chart: "line", data: [30, 38, 34, 46, 52, 60, 72] },
  { label: "Évolution du résultat", value: "320 K€", delta: "+24,3 %", trend: "up", chart: "bars", data: [40, 55, 48, 62, 70, 85] },
  { label: "Taux de recouvrement client", value: "92,4 %", delta: "+6,7 pts", trend: "up", chart: "gauge", pct: 92.4 },
  { label: "Taux de décaissement fournisseur", value: "88,1 %", delta: "-3,2 pts", trend: "down", chart: "gauge", pct: 88.1 },
  { label: "Créances clients", value: "1,25 M€", delta: "-8,4 %", trend: "down", chart: "bars", data: [72, 66, 61, 56, 51, 47] },
  { label: "Dettes fournisseurs", value: "980 K€", delta: "+5,1 %", trend: "up", chart: "bars", data: [42, 48, 52, 50, 58, 63] },
  { label: "Trésorerie disponible", value: "1,15 M€", delta: "+15,2 %", trend: "up", chart: "area", data: [35, 42, 40, 52, 58, 66, 78] },
];

/* Slide 6 — bilan complet (checklist) */
export const balanceItems = [
  "Analyse de la rentabilité",
  "Structure financière",
  "Liquidité et trésorerie",
  "Cycle d'exploitation",
  "Comparatifs et tendances",
] as const;

/* Slide 7 — aide à la décision */
export const decisions = [
  { icon: "TrendingUp", text: "Anticipez les tendances" },
  { icon: "Target", text: "Identifiez les leviers de performance" },
  { icon: "Wallet", text: "Sécurisez votre trésorerie" },
  { icon: "Handshake", text: "Optimisez vos relations clients et fournisseurs" },
  { icon: "Compass", text: "Pilotez votre business en toute confiance" },
] as const;

/* Slide 8 — sécurité */
export const security = [
  { icon: "Server", text: "Hébergement sécurisé" },
  { icon: "Lock", text: "Données cryptées" },
  { icon: "RefreshCw", text: "Sauvegardes automatiques" },
  { icon: "Users", text: "Accès multi-utilisateurs" },
  { icon: "Globe", text: "Disponible 24/7, partout dans le monde" },
] as const;
