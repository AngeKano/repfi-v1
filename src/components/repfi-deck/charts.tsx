"use client";

import { motion } from "framer-motion";
import { PALETTE, CHART_COLORS } from "./brand";

/* ---------- helpers ---------- */
function toPoints(data: number[], w = 100, h = 40, pad = 4) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((d - min) / range) * (h - 2 * pad);
    return [x, y] as const;
  });
}
function pathFrom(pts: ReadonlyArray<readonly [number, number]>) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
}

/* ---------- sparkline ligne ---------- */
export function LineSpark({ data, color = PALETTE.blueBright, area = false }: { data: number[]; color?: string; area?: boolean }) {
  const pts = toPoints(data);
  const d = pathFrom(pts);
  const areaD = `${d} L ${pts[pts.length - 1][0].toFixed(1)} 40 L ${pts[0][0].toFixed(1)} 40 Z`;
  const gid = `sp-${color.replace("#", "")}`;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <motion.path d={areaD} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} />}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: "easeInOut", delay: 0.3 }}
      />
    </svg>
  );
}

/* ---------- mini barres ---------- */
export function BarsSpark({ data, color = PALETTE.blueBright }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  return (
    <div className="flex h-full w-full items-end gap-[3px]">
      {data.map((v, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-t-[3px]"
          style={{ background: color }}
          initial={{ height: 0 }}
          animate={{ height: `${(v / max) * 100}%` }}
          transition={{ delay: 0.35 + i * 0.06, type: "spring", stiffness: 130, damping: 14 }}
        />
      ))}
    </div>
  );
}

/* ---------- jauge circulaire ---------- */
export function Gauge({ pct, color = PALETTE.blueBright }: { pct: number; color?: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
      <motion.circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
      />
    </svg>
  );
}

/* ---------- donut multi-segments ---------- */
export function Donut({ segments, size = 110, thickness = 16 }: { segments: number[]; size?: number; thickness?: number }) {
  const r = (100 - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(20,50,110,0.08)" strokeWidth={thickness} />
      {segments.map((seg, i) => {
        const frac = seg / total;
        const dash = frac * c;
        const el = (
          <motion.circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${c - dash}`}
            initial={{ strokeDashoffset: c, opacity: 0 }}
            animate={{ strokeDashoffset: -acc, opacity: 1 }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.4 + i * 0.12 }}
          />
        );
        acc += dash;
        return el;
      })}
    </svg>
  );
}

/* ---------- routeur de mini-graphe pour une carte KPI ---------- */
export function KpiSpark({ chart, data, pct, color }: { chart: string; data?: number[]; pct?: number; color: string }) {
  if (chart === "gauge" && pct != null) return <Gauge pct={pct} color={color} />;
  if (chart === "bars" && data) return <BarsSpark data={data} color={color} />;
  if (chart === "area" && data) return <LineSpark data={data} color={color} area />;
  if (data) return <LineSpark data={data} color={color} />;
  return null;
}

/* ============================================================
   Mockup de dashboard (slides 4 & 6) — fenêtre applicative
============================================================ */
type Card = { title: string; kind: "line" | "bars" | "donut" | "kpi" | "synth"; value?: string; delta?: string };

export function DashboardMock({ title, cards }: { title: string; cards: Card[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-2xl" style={{ borderColor: PALETTE.lightBorder }}>
      {/* barre de fenêtre */}
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: PALETTE.lightBorder, background: "#F7FAFE" }}>
        <span className="h-3 w-3 rounded-full" style={{ background: "#FF5F57" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#FEBC2E" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#28C840" }} />
        <span className="ml-3 text-sm font-semibold" style={{ color: PALETTE.ink }}>{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.title}
            className="rounded-xl border p-3"
            style={{ borderColor: PALETTE.lightBorder, background: "#fff" }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.3 + i * 0.1 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: PALETTE.inkSoft }}>{card.title}</span>
              {card.delta && <span className="text-xs font-bold" style={{ color: PALETTE.up }}>{card.delta}</span>}
            </div>
            {card.kind === "kpi" && (
              <div className="text-2xl font-extrabold" style={{ color: PALETTE.ink }}>{card.value}</div>
            )}
            {card.kind === "line" && <div className="h-16"><LineSpark data={[30, 38, 33, 47, 52, 61, 73]} color={PALETTE.blue} area /></div>}
            {card.kind === "bars" && <div className="h-16"><BarsSpark data={[40, 58, 48, 66, 72, 60]} color={PALETTE.blue} /></div>}
            {card.kind === "donut" && (
              <div className="flex items-center justify-center"><Donut segments={[40, 25, 20, 15]} size={70} thickness={12} /></div>
            )}
            {card.kind === "synth" && (
              <div className="space-y-2 pt-1">
                {[["Chiffre d'affaires", 78], ["Résultat net", 64], ["Trésorerie", 72]].map(([l, w]) => (
                  <div key={l as string}>
                    <div className="mb-1 flex justify-between text-[10px]" style={{ color: PALETTE.inkSoft }}>
                      <span>{l}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full" style={{ background: "rgba(20,50,110,0.08)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${PALETTE.blue}, ${PALETTE.indigo})` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${w as number}%` }}
                        transition={{ duration: 0.9, delay: 0.5 + i * 0.1 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
