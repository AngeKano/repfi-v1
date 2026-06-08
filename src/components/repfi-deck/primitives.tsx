"use client";

import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Check } from "lucide-react";
import { BRAND, PALETTE } from "./brand";

/* ============================================================
   Variantes d'animation partagées
============================================================ */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 90, damping: 16 },
  },
};

export const fromLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 80, damping: 18 },
  },
};

export const fromRight: Variants = {
  hidden: { opacity: 0, x: 44 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 80, damping: 18 },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

/* ============================================================
   Logo Click Insight (image fournie, fond transparent)
   - fond clair : logo seul
   - fond navy  : logo dans une pastille blanche pour la lisibilité
============================================================ */
export function Logo({
  theme = "dark",
  size = 44,
}: {
  theme?: "dark" | "light";
  size?: number;
}) {
  const src =
    theme === "dark"
      ? "/logo-click-insight-white.png"
      : "/logo-click-insight.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={BRAND}
      draggable={false}
      className="block select-none"
      style={{ height: size, width: "auto" }}
    />
  );
}

/* ============================================================
   Badge d'icône dans un cercle
============================================================ */
type IconName = keyof typeof Icons;

export function CircleIcon({
  name,
  size = 52,
  variant = "blue",
}: {
  name: string;
  size?: number;
  variant?: "blue" | "softDark" | "softLight";
}) {
  const Cmp = (Icons[name as IconName] ?? Icons.Circle) as Icons.LucideIcon;
  const bg =
    variant === "blue"
      ? `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`
      : variant === "softLight"
        ? "rgba(47,115,215,0.12)"
        : "rgba(255,255,255,0.06)";
  const color = variant === "softLight" ? PALETTE.blue : "#fff";
  const border =
    variant === "softDark" ? `1px solid ${PALETTE.panelBorder}` : "none";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-2xl shadow-lg"
      style={{ width: size, height: size, background: bg, border }}
    >
      <Cmp size={size * 0.46} color={color} strokeWidth={2.1} />
    </span>
  );
}

/* ============================================================
   Item de checklist (puce ronde + check + texte)
============================================================ */
export function CheckItem({
  children,
  theme = "light",
}: {
  children: React.ReactNode;
  theme?: "light" | "onPhoto";
}) {
  const textColor = theme === "light" ? PALETTE.ink : "#fff";
  return (
    <motion.div variants={riseIn} className="flex items-center gap-3.5">
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`,
        }}
      >
        <Check size={18} color="#fff" strokeWidth={3} />
      </span>
      <span
        className="font-medium"
        style={{ color: textColor, fontSize: "clamp(1rem, 1.45vw, 1.2rem)" }}
      >
        {children}
      </span>
    </motion.div>
  );
}

/* ============================================================
   Fonds décoratifs
============================================================ */

// Grille de points discrète (slides claires).
export function DotGrid({ opacity = 0.1 }: { opacity?: number }) {
  return (
    <div
      className="dot-grid pointer-events-none absolute inset-0"
      style={{ opacity }}
      aria-hidden
    />
  );
}

// Particules flottantes (slides navy).
type P = { id: number; x: number; y: number; s: number; d: number };
export function Particles({ count = 36 }: { count?: number }) {
  const [pts, setPts] = useState<P[]>([]);
  useEffect(() => {
    setPts(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() * 4 + 1.5,
        d: Math.random() * 5,
      })),
    );
  }, [count]);
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {pts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.s,
            height: p.s,
            background: `linear-gradient(135deg, ${PALETTE.sky}, ${PALETTE.indigo})`,
          }}
          animate={{ y: [0, -26, 0], opacity: [0.25, 0.7, 0.25] }}
          transition={{
            duration: 4 + p.d,
            repeat: Infinity,
            ease: "easeInOut",
            delay: p.d,
          }}
        />
      ))}
    </div>
  );
}

// Graphe hero épuré : courbe ascendante lissée + halo + chips KPI flottantes.
// Utilisé sur les slides couverture (1) et CTA (9).
export function HeroChart({ className = "" }: { className?: string }) {
  const line =
    "M30 250 C 90 240, 130 215, 180 220 C 235 225, 270 175, 330 165 C 395 154, 440 110, 500 92 C 545 79, 565 60, 580 52";
  // Courbe secondaire (comparaison) — plus basse et plus plate.
  const line2 =
    "M30 280 C 95 275, 145 262, 200 257 C 260 251, 300 232, 350 224 C 410 214, 455 192, 510 172 C 550 158, 568 150, 580 146";
  const area = `${line} L 580 300 L 30 300 Z`;
  const dots = [
    { x: 180, y: 220, d: 0.2 },
    { x: 330, y: 165, d: 0.5 },
    { x: 500, y: 92, d: 0.8 },
  ];
  return (
    <div className={className} aria-hidden>
      <svg
        viewBox="0 0 600 320"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PALETTE.sky} stopOpacity="0.38" />
            <stop offset="100%" stopColor={PALETTE.sky} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hero-line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={PALETTE.sky} />
            <stop offset="60%" stopColor={PALETTE.blueBright} />
            <stop offset="100%" stopColor={PALETTE.indigo} />
          </linearGradient>
          <filter id="hero-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* lignes de repère */}
        {[90, 160, 230].map((y) => (
          <line
            key={y}
            x1="20"
            x2="585"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="1"
          />
        ))}

        <motion.path
          d={area}
          fill="url(#hero-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
        />
        <motion.path
          d={line2}
          fill="none"
          stroke={PALETTE.indigo}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="6 7"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.9 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke="url(#hero-line)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#hero-glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: "easeInOut", delay: 0.3 }}
        />
        {dots.map((p) => (
          <motion.circle
            key={p.x}
            cx={p.x}
            cy={p.y}
            r="6"
            fill="#fff"
            stroke={PALETTE.blueBright}
            strokeWidth="3"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              delay: 1.2 + p.d,
              type: "spring",
              stiffness: 200,
              damping: 12,
            }}
          />
        ))}
      </svg>

      {/* chips flottantes */}
      <motion.div
        className="glass absolute right-[10%] top-[15%] rounded-2xl px-4 py-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4 }}
      >
        <div className="text-[11px]" style={{ color: PALETTE.muted }}>
          Croissance
        </div>
        <div className="text-xl font-extrabold" style={{ color: "#fff" }}>
          +18,6 % <span style={{ color: PALETTE.up }}>↑</span>
        </div>
      </motion.div>
      <motion.div
        className="glass absolute bottom-[20%] right-[20%] rounded-2xl px-4 py-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.7 }}
      >
        <div className="text-[11px]" style={{ color: PALETTE.muted }}>
          Trésorerie
        </div>
        <div className="text-xl font-extrabold text-white">2,16 M€</div>
      </motion.div>
    </div>
  );
}
