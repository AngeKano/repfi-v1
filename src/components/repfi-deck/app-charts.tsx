"use client";

/* ============================================================
   Illustrations fidèles de l'app REPFI (reporting clients).
   Recrée les visuels de client-reporting-chart.tsx :
   - cartes KPI (valeur + badge variation + comparatif N-1)
   - 7 graphiques clés (CA, trésorerie, taux, créances, dettes, tunnel)
   - vue « Synthèse Financière » dans un MacBook (slide 2)
   Couleurs reprises 1:1 de l'app pour la cohérence de marque.
============================================================ */

import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import {
  Coins,
  Banknote,
  PieChart,
  Wallet,
  Percent,
  ShoppingCart,
  Receipt,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ---------- palette app (extraite de l'app réelle) ---------- */
export const APP = {
  ink: "#00122E",
  inkSoft: "#335890",
  muted: "#94A3B8",
  border: "#D0E3F5",
  grid: "#EAF0F8",
  chipBg: "#F5F9FF",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  red: "#EF4444",
  redText: "#DC2626",
  redSoft: "#FEE2E2",
  // séries
  blueN: "#2563EB", // année N / créances / dette née
  blueN1: "#93B4F8", // année N-1 / encaissements / dette remboursée
  teal: "#16BDB0", // trésorerie N
  tealSoft: "#74D9CD", // trésorerie N-1 (pointillés)
  violet: "#7C3AED", // taux cumulé
  violetSoft: "#B79DF5", // taux périodique (pointillés)
  orange: "#F97316",
} as const;

/* ---------- format nombres (comme formatCompactOnly) ---------- */
function fmtK(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const f = Math.round(v / 1000)
      .toLocaleString("fr-FR")
      .replace(/ /g, " ");
    return `${f}K`;
  }
  return v.toLocaleString("fr-FR").replace(/ /g, " ");
}

const MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

/* ============================================================
   Géométrie SVG partagée
============================================================ */
const VBW = 640;
const VBH = 290;
const M = { l: 46, r: 14, t: 16, b: 30 };
const PW = VBW - M.l - M.r;
const PH = VBH - M.t - M.b;

const xLine = (i: number, n: number) =>
  M.l + (n <= 1 ? PW / 2 : (i / (n - 1)) * PW);
const yAt = (v: number, max: number) =>
  M.t + PH * (1 - v / Math.max(max, 1e-9));
const bandCenter = (i: number, n: number) => M.l + ((i + 0.5) / n) * PW;

function smoothPath(pts: ReadonlyArray<readonly [number, number]>) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(
      1,
    )} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/* grille horizontale + libellés Y */
function Grid({
  max,
  steps = 4,
  fmt,
}: {
  max: number;
  steps?: number;
  fmt: (v: number) => string;
}) {
  const lines = Array.from({ length: steps + 1 }, (_, i) => (i / steps) * max);
  return (
    <g>
      {lines.map((v, i) => {
        const y = yAt(v, max);
        return (
          <g key={i}>
            <line
              x1={M.l}
              x2={VBW - M.r}
              y1={y}
              y2={y}
              stroke={APP.grid}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={M.l - 8}
              y={y + 3}
              textAnchor="end"
              fontSize={10}
              fill={APP.muted}
            >
              {fmt(v)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ labels }: { labels: string[] }) {
  const n = labels.length;
  return (
    <g>
      {labels.map((l, i) => (
        <text
          key={l + i}
          x={xLine(i, n)}
          y={VBH - 10}
          textAnchor="middle"
          fontSize={9.5}
          fill={APP.muted}
        >
          {l}
        </text>
      ))}
    </g>
  );
}

/* ============================================================
   Carte « app » : fond blanc, titre + sous-titre, légende, contenu
============================================================ */
function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="8">
        <line
          x1="0"
          y1="4"
          x2="22"
          y2="4"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={dashed ? "4 4" : undefined}
        />
      </svg>
      <span className="text-[11px] font-medium" style={{ color: APP.inkSoft }}>
        {label}
      </span>
    </span>
  );
}

export function AppCard({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-full flex-col rounded-xl border bg-white p-4 shadow-sm"
      style={{ borderColor: APP.border }}
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold" style={{ color: APP.ink }}>
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-[11px]" style={{ color: APP.muted }}>
              {subtitle}
            </div>
          )}
        </div>
        {legend && <div className="flex shrink-0 flex-col gap-1">{legend}</div>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/* ============================================================
   Graphe lignes multi-séries (trésorerie, taux)
============================================================ */
type Serie = {
  name: string;
  color: string;
  data: number[];
  dashed?: boolean;
};

function MultiLine({
  series,
  labels,
  max,
  fmtY,
}: {
  series: Serie[];
  labels: string[];
  max: number;
  fmtY: (v: number) => string;
}) {
  const n = labels.length;
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="h-full w-full">
      <Grid max={max} fmt={fmtY} />
      <XLabels labels={labels} />
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => [xLine(i, n), yAt(v, max)] as const);
        return (
          <g key={s.name}>
            <motion.path
              d={smoothPath(pts)}
              fill="none"
              stroke={s.color}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "6 6" : undefined}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                duration: 1.1,
                ease: "easeInOut",
                delay: 0.2 + si * 0.15,
              }}
            />
            {pts.map((p, i) => (
              <motion.circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={s.dashed ? 2.6 : 3.2}
                fill="#fff"
                stroke={s.color}
                strokeWidth={2}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6 + i * 0.04 }}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   Graphe barres groupées (CA, créances, dettes)
============================================================ */
function GroupedBars({
  series,
  labels,
  max,
  fmtY,
}: {
  series: { name: string; color: string; data: number[] }[];
  labels: string[];
  max: number;
  fmtY: (v: number) => string;
}) {
  const n = labels.length;
  const k = series.length;
  const band = PW / n;
  const groupW = band * 0.62;
  const barW = groupW / k;
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="h-full w-full">
      <Grid max={max} fmt={fmtY} />
      <XLabels labels={labels} />
      {labels.map((_, i) => {
        const cx = bandCenter(i, n);
        const startX = cx - groupW / 2;
        return series.map((s, si) => {
          const v = s.data[i];
          const h = (v / max) * PH;
          const x = startX + si * barW;
          const y = M.t + PH - h;
          return (
            <motion.rect
              key={s.name + i}
              x={x + 1}
              width={barW - 2}
              rx={2.5}
              fill={s.color}
              initial={{ height: 0, y: M.t + PH }}
              animate={{ height: h, y }}
              transition={{
                duration: 0.5,
                delay: 0.2 + i * 0.03 + si * 0.05,
                ease: "easeOut",
              }}
            />
          );
        });
      })}
    </svg>
  );
}

/* ============================================================
   Tunnel de rentabilité (barres divergentes rouge/bleu)
============================================================ */
type TunnelRow = { name: string; value: number; pct: number };

function Tunnel({ rows }: { rows: TunnelRow[] }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 py-1">
      {rows.map((r, i) => {
        const w = (Math.abs(r.value) / maxAbs) * 46; // % de la moitié
        const neg = r.value < 0;
        return (
          <div key={r.name} className="flex items-center gap-2">
            <div
              className="w-28 shrink-0 text-right text-[11px] font-medium"
              style={{ color: APP.ink }}
            >
              {r.name}
            </div>
            {/* piste divergente */}
            <div className="relative flex h-7 flex-1 items-center">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-300" />
              <div className="flex h-full w-1/2 items-center justify-end pr-px">
                {neg && (
                  <motion.div
                    className="flex h-full items-center justify-start rounded-l-md pl-2"
                    style={{ background: APP.red }}
                    initial={{ width: 0 }}
                    animate={{ width: `${w}%` }}
                    transition={{ duration: 0.5, delay: 0.15 + i * 0.07 }}
                  >
                    <span className="text-[10px] font-semibold text-white">
                      {fmtK(r.value)}
                    </span>
                  </motion.div>
                )}
              </div>
              <div className="flex h-full w-1/2 items-center justify-start pl-px">
                {!neg && (
                  <motion.div
                    className="flex h-full items-center justify-end rounded-r-md pr-2"
                    style={{ background: APP.blueN }}
                    initial={{ width: 0 }}
                    animate={{ width: `${w}%` }}
                    transition={{ duration: 0.5, delay: 0.15 + i * 0.07 }}
                  >
                    <span className="text-[10px] font-semibold text-white">
                      {fmtK(r.value)}
                    </span>
                  </motion.div>
                )}
              </div>
            </div>
            <div
              className="w-12 shrink-0 text-right text-[11px] font-semibold"
              style={{ color: neg ? APP.redText : APP.inkSoft }}
            >
              {r.pct.toFixed(1)}%
            </div>
          </div>
        );
      })}
      <div
        className="mt-1 flex justify-between px-28 text-[10px]"
        style={{ color: APP.muted }}
      >
        <span>← Négatif</span>
        <span>% du CA</span>
        <span>Positif →</span>
      </div>
    </div>
  );
}

/* ============================================================
   Données fictives (illustration)
============================================================ */
const ca2025 = [1.7, 1.9, 2.0, 1.8, 2.1, 2.0, 2.3, 2.4, 2.2, 2.1, 2.0, 2.9].map(
  (v) => v * 1e6,
);
const ca2024 = [1.3, 1.4, 1.5, 1.4, 1.6, 1.5, 1.6, 1.6, 1.5, 1.5, 1.4, 2.1].map(
  (v) => v * 1e6,
);

const treso2025 = [
  0.1, 0.5, 1.0, 0.9, 1.95, 1.98, 3.6, 4.9, 3.6, 2.95, 2.3, 1.6,
].map((v) => v * 1e6);
const treso2024 = [
  2.35, 1.9, 2.05, 2.4, 2.35, 2.3, 2.9, 2.35, 2.75, 2.05, 1.85, 1.3,
].map((v) => v * 1e6);

const recouvCumule = [22, 35, 44, 52, 58, 63, 69, 74, 79, 84, 89, 92];
const recouvPeriod = [22, 48, 61, 70, 66, 72, 80, 85, 88, 90, 93, 95];

const rembCumule = [18, 30, 39, 47, 54, 60, 66, 72, 77, 82, 86, 88];
const rembPeriod = [18, 42, 55, 64, 60, 68, 75, 80, 84, 87, 90, 92];

const creances = [
  1.8, 1.9, 2.0, 1.85, 2.1, 2.05, 2.2, 2.3, 2.15, 2.1, 2.0, 2.4,
].map((v) => v * 1e6);
const encaiss = [
  1.5, 1.6, 1.7, 1.6, 1.8, 1.75, 1.9, 2.0, 1.85, 1.8, 1.7, 2.0,
].map((v) => v * 1e6);

const detteNee = [
  1.2, 1.3, 1.4, 1.25, 1.5, 1.45, 1.6, 1.55, 1.5, 1.45, 1.4, 1.6,
].map((v) => v * 1e6);
const detteRemb = [
  0.9, 1.0, 1.1, 1.0, 1.2, 1.15, 1.3, 1.25, 1.2, 1.15, 1.1, 1.3,
].map((v) => v * 1e6);

const tunnelRows: TunnelRow[] = [
  { name: "Chiffre d'affaires", value: 25_417_000, pct: 100 },
  { name: "Marge commerciale", value: 18_500_000, pct: 72.8 },
  { name: "Valeur ajoutée", value: 9_200_000, pct: 36.2 },
  { name: "Rés. exploitation", value: 1_830_000, pct: 7.2 },
  { name: "Résultat financier", value: -420_000, pct: -1.7 },
  { name: "Résultat HAO", value: 310_000, pct: 1.2 },
  { name: "Résultat net", value: 1_720_000, pct: 6.8 },
];

const fmtM = (v: number) => `${(v / 1e6).toFixed(0)}M`;
const fmtPct = (v: number) => `${v.toFixed(0)}%`;

/* ============================================================
   Les 7 graphiques exportés
============================================================ */
export function ChartCA() {
  return (
    <AppCard
      title="Évolution du Chiffre d'Affaires"
      subtitle="Comparaison 2025 vs 2024 (périodique) — par mois"
      legend={
        <>
          <LegendItem color={APP.blueN} label="2025" />
          <LegendItem color={APP.blueN1} label="2024" />
        </>
      }
    >
      <GroupedBars
        labels={MONTHS}
        max={3e6}
        fmtY={fmtM}
        series={[
          { name: "2025", color: APP.blueN, data: ca2025 },
          { name: "2024", color: APP.blueN1, data: ca2024 },
        ]}
      />
    </AppCard>
  );
}

export function ChartTresorerie() {
  return (
    <AppCard
      title="Évolution de la Trésorerie"
      subtitle="Solde toujours cumulé — 2025 vs 2024 — par mois"
      legend={
        <>
          <LegendItem color={APP.teal} label="2025" />
          <LegendItem color={APP.tealSoft} label="2024" dashed />
        </>
      }
    >
      <MultiLine
        labels={MONTHS}
        max={6e6}
        fmtY={fmtM}
        series={[
          {
            name: "Trésorerie 2024",
            color: APP.tealSoft,
            data: treso2024,
            dashed: true,
          },
          { name: "Trésorerie 2025", color: APP.teal, data: treso2025 },
        ]}
      />
    </AppCard>
  );
}

export function ChartRecouvrement() {
  return (
    <AppCard
      title="Évolution du Taux de Recouvrement"
      subtitle="(Encaissements Clients TTC / Créances Clients TTC) × 100"
      legend={
        <>
          <LegendItem color={APP.violet} label="Cumulé" />
          <LegendItem color={APP.violetSoft} label="Périodique" dashed />
        </>
      }
    >
      <MultiLine
        labels={MONTHS}
        max={100}
        fmtY={fmtPct}
        series={[
          {
            name: "Périodique",
            color: APP.violetSoft,
            data: recouvPeriod,
            dashed: true,
          },
          { name: "Cumulé", color: APP.violet, data: recouvCumule },
        ]}
      />
    </AppCard>
  );
}

export function ChartRemboursement() {
  return (
    <AppCard
      title="Évolution du Taux de Remboursement des Dettes"
      subtitle="(Remboursements / Dettes nées) × 100 — cumulé et périodique"
      legend={
        <>
          <LegendItem color={APP.violet} label="Cumulé" />
          <LegendItem color={APP.violetSoft} label="Périodique" dashed />
        </>
      }
    >
      <MultiLine
        labels={MONTHS}
        max={100}
        fmtY={fmtPct}
        series={[
          {
            name: "Périodique",
            color: APP.violetSoft,
            data: rembPeriod,
            dashed: true,
          },
          { name: "Cumulé", color: APP.violet, data: rembCumule },
        ]}
      />
    </AppCard>
  );
}

export function ChartCreances() {
  return (
    <AppCard
      title="Créances Clients TTC vs Encaissements Clients TTC"
      subtitle="Comparaison mensuelle des montants"
      legend={
        <>
          <LegendItem color={APP.blueN} label="Créances" />
          <LegendItem color={APP.blueN1} label="Encaissements" />
        </>
      }
    >
      <GroupedBars
        labels={MONTHS}
        max={2.6e6}
        fmtY={fmtM}
        series={[
          { name: "Créances", color: APP.blueN, data: creances },
          { name: "Encaissements", color: APP.blueN1, data: encaiss },
        ]}
      />
    </AppCard>
  );
}

export function ChartDettes() {
  return (
    <AppCard
      title="Dette Fournisseurs vs Dettes Remboursées"
      subtitle="Dettes fournisseurs nées (crédit DJ) vs remboursées (débit DJ)"
      legend={
        <>
          <LegendItem color={APP.blueN} label="Nées" />
          <LegendItem color={APP.blueN1} label="Remboursées" />
        </>
      }
    >
      <GroupedBars
        labels={MONTHS}
        max={1.8e6}
        fmtY={fmtM}
        series={[
          { name: "Nées", color: APP.blueN, data: detteNee },
          { name: "Remboursées", color: APP.blueN1, data: detteRemb },
        ]}
      />
    </AppCard>
  );
}

export function ChartTunnel() {
  return (
    <AppCard
      title="Tunnel de rentabilité"
      subtitle="Décomposition du résultat — Base 100 % = Chiffre d'affaires"
    >
      <Tunnel rows={tunnelRows} />
    </AppCard>
  );
}

/* Registre des métriques (slide 4 — card switch) */
export type Metric = {
  id: string;
  label: string;
  Chart: () => React.ReactElement;
};

export const METRICS: Metric[] = [
  { id: "ca", label: "Évolution du chiffre d'affaires", Chart: ChartCA },
  { id: "treso", label: "Évolution de la trésorerie", Chart: ChartTresorerie },
  { id: "recouv", label: "Taux de recouvrement", Chart: ChartRecouvrement },
  {
    id: "remb",
    label: "Taux de remboursement des dettes",
    Chart: ChartRemboursement,
  },
  { id: "creances", label: "Créances clients", Chart: ChartCreances },
  { id: "dettes", label: "Dettes fournisseurs", Chart: ChartDettes },
  //{ id: "tunnel", label: "Tunnel de rentabilité", Chart: ChartTunnel },
];

/* ============================================================
   Carte KPI « app » (slide 5 + synthèse)
============================================================ */
const KPI_ICONS = {
  coins: Coins,
  banknote: Banknote,
  donut: PieChart,
  wallet: Wallet,
  percent: Percent,
  cart: ShoppingCart,
  receipt: Receipt,
} as const;

export type KpiCardData = {
  label: string;
  value: string;
  prev: string;
  variation: number; // %, signe = sens
  negative?: boolean; // valeur principale négative (rouge)
  icon: keyof typeof KPI_ICONS;
  iconColor: string;
};

function VariationBadge({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium"
        style={{ color: "#6B7280", borderColor: "#E5E7EB" }}
      >
        <Minus size={11} /> 0%
      </span>
    );
  }
  const pos = value > 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color: pos ? APP.green : APP.redText,
        borderColor: pos ? "#BBF7D0" : "#FECACA",
        background: pos ? "#F0FDF4" : "#FEF2F2",
      }}
    >
      {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pos ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

export function AppKpiCard({
  data,
  compact = false,
}: {
  data: KpiCardData;
  compact?: boolean;
}) {
  const Icon = KPI_ICONS[data.icon];
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white shadow-sm ${
        compact ? "p-3" : "p-5"
      }`}
      style={{ borderColor: APP.border }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-medium ${compact ? "text-[12px]" : "text-sm"}`}
          style={{ color: APP.inkSoft }}
        >
          {data.label}
        </span>
        <VariationBadge value={data.variation} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div
            className={`font-bold leading-none ${
              compact ? "text-2xl" : "text-3xl"
            }`}
            style={{ color: data.negative ? APP.redText : APP.ink }}
          >
            {data.value}
          </div>
          <div className="mt-1.5 text-[11px]" style={{ color: APP.muted }}>
            2024 : {data.prev}
          </div>
        </div>
        <Icon
          size={compact ? 26 : 34}
          className="shrink-0"
          style={{ color: data.iconColor }}
          strokeWidth={1.8}
        />
      </div>
    </div>
  );
}

/* 8 KPIs pour la slide 5 (valeurs fictives) */
export const KPI_CARDS: KpiCardData[] = [
  {
    label: "Chiffre d'affaires",
    value: "25 417K",
    prev: "18 425K",
    variation: 38.0,
    icon: "coins",
    iconColor: "#2563EB",
  },
  {
    label: "Masse salariale",
    value: "6 740K",
    prev: "4 005K",
    variation: 68.3,
    icon: "banknote",
    iconColor: "#EA580C",
  },
  {
    label: "Résultat net",
    value: "1 720K",
    prev: "980K",
    variation: 75.5,
    icon: "donut",
    iconColor: "#16A34A",
  },
  {
    label: "Trésorerie",
    value: "1 062K",
    prev: "713K",
    variation: 48.9,
    icon: "wallet",
    iconColor: "#0891B2",
  },
  {
    label: "Taux de recouvrement",
    value: "92,4%",
    prev: "86,1%",
    variation: 7.3,
    icon: "percent",
    iconColor: "#7C3AED",
  },
  {
    label: "Taux de remboursement",
    value: "88,0%",
    prev: "81,5%",
    variation: 8.0,
    icon: "percent",
    iconColor: "#7C3AED",
  },
  {
    label: "Dettes fournisseurs",
    value: "4 980K",
    prev: "5 240K",
    variation: -5.0,
    icon: "receipt",
    iconColor: "#4F46E5",
  },
  {
    label: "Créances clients",
    value: "6 250K",
    prev: "5 100K",
    variation: 22.5,
    icon: "coins",
    iconColor: "#2563EB",
  },
];

/* ============================================================
   Synthèse Financière dans un MacBook (slide 2)
============================================================ */
function FilterPill({
  label,
  value,
  stepper,
}: {
  label: string;
  value: string;
  stepper?: boolean;
}) {
  return (
    <div
      className="flex h-9 items-center gap-2 rounded-lg border px-3"
      style={{ borderColor: APP.border }}
    >
      <span className="text-[11px]" style={{ color: APP.inkSoft }}>
        {label} :
      </span>
      <span className="text-[13px] font-bold" style={{ color: APP.ink }}>
        {value}
      </span>
      {stepper && (
        <span
          className="flex items-center gap-0.5"
          style={{ color: APP.muted }}
        >
          <ChevronLeft size={14} />
          <ChevronRight size={14} />
        </span>
      )}
    </div>
  );
}

const SYNTH_KPIS: KpiCardData[] = [
  {
    label: "Chiffre d'affaires",
    value: "25 417K",
    prev: "18 425K",
    variation: 38.0,
    icon: "coins",
    iconColor: "#2563EB",
  },
  {
    label: "Résultat d'exploitation",
    value: "1 830K",
    prev: "-575K",
    variation: 418.2,
    icon: "donut",
    iconColor: "#D946EF",
  },
  {
    label: "Trésorerie",
    value: "1 062K",
    prev: "713K",
    variation: 48.9,
    icon: "wallet",
    iconColor: "#0891B2",
  },
];

export function SyntheseView() {
  return (
    <div className="flex h-full flex-col gap-3 bg-[#FBFCFE] p-4">
      {/* barre de filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill label="Mode calcul" value="Périodique" />
        <FilterPill label="Année" value="2025" stepper />
        <FilterPill label="Granularité" value="Année" />
        <div
          className="flex h-9 items-center gap-2 rounded-lg px-3"
          style={{ background: APP.chipBg }}
        >
          <CalendarRange size={14} style={{ color: "#0077C3" }} />
          <span
            className="text-[12px] font-semibold"
            style={{ color: APP.ink }}
          >
            Janvier - Décembre 2025
          </span>
        </div>
      </div>

      {/* 3 cartes KPI */}
      <div className="grid grid-cols-3 gap-3">
        {SYNTH_KPIS.map((k) => (
          <AppKpiCard key={k.label} data={k} compact />
        ))}
      </div>

      {/* graphe trésorerie */}
      <div className="min-h-0 flex-1">
        <ChartTresorerie />
      </div>
    </div>
  );
}

/* Rend `children` à une taille de design fixe (w×h) puis le met à
   l'échelle pour remplir la largeur du conteneur — garantit que le
   dashboard tient toujours nettement dans l'écran, sans rognage. */
function FitScale({
  w,
  h,
  children,
}: {
  w: number;
  h: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / w);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        aspectRatio: `${w} / ${h}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          opacity: scale ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* MacBook : écran (synthèse à l'échelle) + socle */
export function MacBook({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full">
      <div
        className="rounded-[16px] border-[8px] bg-[#1c2531] p-1 shadow-2xl"
        style={{ borderColor: "#1c2531" }}
      >
        <div className="overflow-hidden rounded-[8px] bg-white">
          <FitScale w={920} h={600}>
            {children}
          </FitScale>
        </div>
      </div>
      {/* socle / charnière */}
      <div
        className="relative mx-auto"
        style={{ width: "118%", marginLeft: "-9%" }}
      >
        <div className="absolute left-[45%] mx-auto h-1.5 w-[16%] rounded-b-lg bg-[#838c9d]" />
        <div className="h-3 rounded-b-[10px] bg-gradient-to-b from-[#c3cad6] to-[#9aa3b2]" />
      </div>
    </div>
  );
}
