"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  User,
  Laptop,
  Check,
  ArrowRight,
  TrendingUp,
  FileText,
  Presentation,
} from "lucide-react";
import { useDeckExport, useIsExportClone } from "./deck-export";
import { BRAND, DOMAIN, DEMO_URL, SITE_URL, PALETTE } from "./brand";
import {
  valueProps,
  processSteps,
  balanceItems,
  decisions,
  security,
  contact,
} from "./slides";
import {
  Logo,
  CircleIcon,
  CheckItem,
  DotGrid,
  Particles,
  HeroChart,
  stagger,
  riseIn,
  fromRight,
  scaleIn,
} from "./primitives";
import { DashboardMock, LineSpark, BarsSpark } from "./charts";
import {
  MacBook,
  SyntheseView,
  AppKpiCard,
  KPI_CARDS,
  METRICS,
} from "./app-charts";
import { useEffect, useState } from "react";

/* ============================================================
   Cadres
============================================================ */
const PAD_V = "clamp(2.75rem, 5.5vh, 5rem)";
const PAD_H = "clamp(2.5rem, 5.5vw, 6rem)";
const FRAME_PAD = {
  padding: `${PAD_V} ${PAD_H} clamp(5rem, 9vh, 7rem)`,
} as const;
const LOGO_POS = { top: PAD_V, left: PAD_H } as const;

function NavyFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="navy-radial relative h-full w-full overflow-hidden">
      <Particles />
      <motion.div
        className="absolute z-20"
        style={LOGO_POS}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Logo theme="dark" size={56} />
      </motion.div>
      <div
        className="relative z-10 flex h-full w-full flex-col"
        style={FRAME_PAD}
      >
        {children}
      </div>
    </div>
  );
}

function LightFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="light-radial relative h-full w-full overflow-hidden">
      <DotGrid />
      <motion.div
        className="absolute z-20"
        style={LOGO_POS}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Logo theme="light" size={52} />
      </motion.div>
      <div
        className="relative z-10 flex h-full w-full flex-col"
        style={FRAME_PAD}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   Typographie partagée
============================================================ */
function Title({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: "dark" | "light";
}) {
  return (
    <motion.h2
      variants={riseIn}
      className="font-extrabold leading-[1.08] tracking-tight"
      style={{
        color: theme === "dark" ? "#fff" : PALETTE.ink,
        fontSize: "clamp(2.1rem, 4.3vw, 3.5rem)",
      }}
    >
      {children}
    </motion.h2>
  );
}

function Lead({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: "dark" | "light";
}) {
  return (
    <motion.p
      variants={riseIn}
      className="leading-relaxed"
      style={{
        color: theme === "dark" ? PALETTE.ice : PALETTE.inkSoft,
        fontSize: "clamp(1.05rem, 1.65vw, 1.45rem)",
        marginTop: "clamp(1.2rem, 2vh, 1.8rem)",
      }}
    >
      {children}
    </motion.p>
  );
}

// Surbrillance des mots-clés.
const hi = { color: PALETTE.blueBright };
// Espacement bloc texte -> liste / contenu suivant.
const blockGap = { marginTop: "clamp(1.6rem, 2.8vh, 2.4rem)" };

/* ============================ SLIDE 1 — Couverture ============================ */
export function SlideCover() {
  return (
    <NavyFrame>
      <HeroChart className="pointer-events-none absolute right-8 top-1/2 h-[54%] w-[42%] -translate-y-1/2" />
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex h-full flex-col"
      >
        <div className="flex-1" />

        <div className="max-w-[50%]">
          <Title theme="dark">
            Le Reporting Financier
            <br />
            <span style={hi}>au service de la performance</span>
          </Title>
          <Lead theme="dark">
            <span className="font-semibold text-white">
              Suivez, Analysez, Décidez.
            </span>
            <br />
            Pilotez votre activité en toute confiance.
          </Lead>
        </div>

        <div className="flex-1" />

        <motion.div
          variants={riseIn}
          className="flex items-center gap-2 text-base"
          style={{ color: PALETTE.muted }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: PALETTE.blueBright }}
          />
          {SITE_URL}
        </motion.div>
      </motion.div>
    </NavyFrame>
  );
}

/* ===================== SLIDE 2 — Proposition de valeur ===================== */
export function SlideValue() {
  return (
    <LightFrame>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid h-full grid-cols-12 items-center gap-12"
      >
        <div className="col-span-6 flex min-w-0 flex-col">
          <Title theme="light">
            Transformez vos données comptables en{" "}
            <span style={hi}>décisions éclairées</span>
          </Title>
          <Lead theme="light">
            {BRAND} convertit vos données comptables en indicateurs clés de
            performance pour vous aider à piloter votre activité au quotidien et
            prendre des décisions avisées.
          </Lead>

          <motion.div
            variants={stagger}
            className="flex flex-wrap gap-x-8 gap-y-6"
            style={blockGap}
          >
            {valueProps.map((vp) => (
              <motion.div
                key={vp.label}
                variants={riseIn}
                className="flex w-24 flex-col items-center gap-y-6 text-center"
              >
                <CircleIcon name={vp.icon} size={58} variant="softLight" />
                <span
                  className="mt-2.5 text-sm font-semibold"
                  style={{ color: PALETTE.ink }}
                >
                  {vp.label}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div
          variants={fromRight}
          className="col-span-6 flex min-w-0 items-center"
        >
          <MacBook>
            <SyntheseView />
          </MacBook>
        </motion.div>
      </motion.div>
    </LightFrame>
  );
}

/* ===================== SLIDE 3 — Processus 4 étapes ===================== */
export function SlideProcess() {
  return (
    <NavyFrame>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex h-full flex-col justify-center"
      >
        <Title theme="dark">Un processus simple et automatisé</Title>
        <Lead theme="dark">
          4 fichiers comptables à importer, un reporting complet à exploiter.
        </Lead>

        <motion.div
          variants={stagger}
          className="grid grid-cols-4 gap-8"
          style={blockGap}
        >
          {processSteps.map((st, i) => (
            <motion.div
              key={st.num}
              variants={riseIn}
              whileHover={{ y: -6 }}
              className="relative flex flex-col rounded-2xl border p-4 gap-y-3"
              style={{
                borderColor: PALETTE.panelBorder,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div className="flex items-center gap-3 ">
                <CircleIcon name={st.icon} size={44} />
                <span
                  className="text-5xl font-extrabold leading-none"
                  style={{ color: PALETTE.blueBright }}
                >
                  {st.num}
                </span>
              </div>
              <h3 className="text-xl font-bold leading-tight text-white">
                {st.title}
              </h3>
              <p className="text-[15px]" style={{ color: PALETTE.ice }}>
                {st.desc}
              </p>

              {i < processSteps.length - 1 && (
                <motion.span
                  className="absolute z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{
                    top: 46,
                    right: -24,
                    background: PALETTE.navy,
                    border: `1px solid ${PALETTE.panelBorder}`,
                  }}
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                >
                  <ArrowRight size={16} color={PALETTE.blueBright} />
                </motion.span>
              )}
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          variants={riseIn}
          className="text-center text-lg font-bold"
          style={{ ...blockGap, color: PALETTE.blueBright }}
        >
          Données fiables en entrée, insights puissants en sortie.
        </motion.p>
      </motion.div>
    </NavyFrame>
  );
}

/* ===================== SLIDE 4 — Indicateurs clés ===================== */
export function SlideIndicators() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Card switch automatique (délai court), suspendu au survol.
  // Dépend de `active` : chaque sélection manuelle relance le minuteur,
  // pour que le clic « tienne » avant de reprendre le défilement.
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      setActive((i) => (i + 1) % METRICS.length);
    }, 3200);
    return () => clearTimeout(t);
  }, [paused, active]);

  const Chart = METRICS[active].Chart;

  return (
    <LightFrame>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid h-full grid-cols-12 items-center gap-10"
      >
        <div className="col-span-5 flex min-w-0 flex-col">
          <Title theme="light">
            Des indicateurs clés pour{" "}
            <span style={hi}>piloter votre activité</span>
          </Title>
          <motion.div
            variants={stagger}
            className="flex flex-col gap-2"
            style={blockGap}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            {METRICS.map((m, i) => {
              const on = i === active;
              return (
                <motion.button
                  key={m.id}
                  variants={riseIn}
                  onClick={() => setActive(i)}
                  className="group flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors"
                  style={{
                    borderColor: on ? PALETTE.blue : PALETTE.lightBorder,
                    background: on ? "rgba(47,115,215,0.08)" : "transparent",
                  }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: on
                        ? `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`
                        : "rgba(20,50,110,0.06)",
                      color: on ? "#fff" : PALETTE.inkSoft,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[15px] font-semibold"
                    style={{ color: on ? PALETTE.ink : PALETTE.inkSoft }}
                  >
                    {m.label}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        <motion.div
          variants={fromRight}
          className="col-span-7 min-w-0"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="relative h-[58vh] max-h-[460px] w-full">
            <motion.div
              key={METRICS[active].id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="absolute inset-0"
            >
              <Chart />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </LightFrame>
  );
}

/* ===================== SLIDE 5 — Zoom KPIs ===================== */
export function SlideKpis() {
  return (
    <NavyFrame>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex h-full flex-col justify-center"
      >
        <Title theme="dark">Zoom sur quelques indicateurs</Title>
        <Lead theme="dark">
          Les KPIs clés de votre activité, présentés comme dans l&apos;app.
        </Lead>

        <motion.div
          variants={stagger}
          className="grid grid-cols-4 gap-4"
          style={blockGap}
        >
          {KPI_CARDS.map((k) => (
            <motion.div key={k.label} variants={riseIn}>
              <AppKpiCard data={k} />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </NavyFrame>
  );
}

/* ===================== SLIDE 6 — Bilan complet ===================== */
// Mock illustration mimant le rapport narratif réel produit par l'onglet
// "Bilan d'activité" (src/components/reporting/client-bilan-tab.tsx) :
// titre + sous-titre période + sections numérotées (h2 bleu souligné) +
// paragraphes commentés + carte graphique par section. La 3ᵉ section est
// volontairement coupée par un fade pour suggérer le scroll.
function BilanActiviteReport() {
  const sectionTitle: React.CSSProperties = {
    color: "#0077C3",
    fontWeight: 700,
    fontSize: "0.95rem",
    paddingBottom: "0.4rem",
    borderBottom: "1px solid #D0E3F5",
    marginBottom: "0.6rem",
  };
  const paraPrimary: React.CSSProperties = {
    color: "#0B1F44",
    fontSize: "0.7rem",
    lineHeight: 1.55,
  };
  const paraSoft: React.CSSProperties = {
    color: "#5B6B85",
    fontSize: "0.65rem",
    lineHeight: 1.5,
    fontStyle: "italic",
  };
  const chartCard: React.CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(20,50,110,0.10)",
    borderRadius: 12,
    padding: "10px 12px",
  };
  const bold = { color: "#00122E", fontWeight: 700 };

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-2xl"
      style={{
        borderColor: "rgba(20,50,110,0.10)",
        background: "#ffffff",
        maxHeight: "75vh",
      }}
    >
      {/* Barre de fenêtre */}
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: "rgba(20,50,110,0.10)", background: "#F7FAFE" }}
      >
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: "#FF5F57" }}
        />
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: "#FEBC2E" }}
        />
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: "#28C840" }}
        />
        <span
          className="ml-3 text-sm font-semibold"
          style={{ color: PALETTE.ink }}
        >
          Bilan d&apos;activité
        </span>
      </div>

      {/* Corps du rapport */}
      <div className="relative">
        <div className="space-y-4 px-6 py-5">
          {/* En-tête narratif */}
          <div>
            <h3
              className="font-extrabold leading-tight"
              style={{ color: PALETTE.ink, fontSize: "1.05rem" }}
            >
              Bilan d&apos;activité périodique
            </h3>
            <p style={paraSoft}>
              Période : Janvier – Décembre 2025 — comparaison avec 2024.
            </p>
          </div>

          {/* Section 1 — Chiffre d'affaires */}
          <section>
            <div style={sectionTitle}>1. Chiffre d&apos;affaires</div>
            <p style={paraPrimary}>
              Sur la période, vous avez réalisé un chiffre d&apos;affaires de{" "}
              <span style={bold}>2 450 K FCFA</span> qui traduit une évolution
              de <span style={{ ...bold, color: PALETTE.up }}>+18,6 %</span> par
              rapport à l&apos;année précédente.
            </p>
            <div style={chartCard} className="mt-2">
              <div className="h-14">
                <LineSpark
                  data={[30, 38, 33, 47, 52, 61, 73]}
                  color={PALETTE.blue}
                  area
                />
              </div>
            </div>
          </section>

          {/* Section 2 — Recouvrement */}
          <section>
            <div style={sectionTitle}>2. Recouvrement</div>
            <p style={paraPrimary}>
              Vous avez pu encaisser <span style={bold}>92,4 %</span> des
              montants facturés à vos clients sur cette période.
            </p>
            <div style={chartCard} className="mt-2">
              <div className="h-14">
                <BarsSpark
                  data={[40, 58, 48, 66, 72, 60]}
                  color={PALETTE.blue}
                />
              </div>
            </div>
          </section>

          {/* Section 3 — partiellement visible, coupée par le fade */}
          <section>
            <div style={sectionTitle}>3. Trésorerie</div>
            <p style={paraPrimary}>
              Au terme de cette période, vous disposez de{" "}
              <span style={bold}>1 150 K FCFA</span> en banque et en caisse…
            </p>
          </section>
        </div>

        {/* Fade-out bas pour suggérer le scroll vers la section 4 (Résultat). */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0) 0%, #ffffff 90%)",
          }}
        />
      </div>
    </div>
  );
}

export function SlideBalance() {
  return (
    <LightFrame>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid h-full grid-cols-12 items-center gap-12"
      >
        <div className="col-span-5 flex min-w-0 flex-col">
          <Title theme="light">
            Un bilan complet de votre <span style={hi}>activité</span>
          </Title>
          <Lead theme="light">
            Bénéficiez d&apos;une vision globale pour analyser vos performances
            et anticiper l&apos;avenir :
          </Lead>
          <motion.div
            variants={stagger}
            className="flex flex-col gap-4"
            style={blockGap}
          >
            {balanceItems.map((it) => (
              <CheckItem key={it}>{it}</CheckItem>
            ))}
          </motion.div>
        </div>

        <motion.div variants={fromRight} className="col-span-7 min-w-0">
          <BilanActiviteReport />
        </motion.div>
      </motion.div>
    </LightFrame>
  );
}

/* ===================== SLIDE 7 — Aide à la décision ===================== */
export function SlideDecide() {
  return (
    <NavyFrame>
      <div
        className="pointer-events-none absolute right-[6%] top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(79,155,255,0.35), transparent 65%)",
        }}
      />
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid h-full grid-cols-12 items-center gap-12"
      >
        <div className="col-span-7 flex min-w-0 flex-col">
          <Title theme="dark">
            Prenez des décisions <span style={hi}>éclairées</span>, au bon
            moment
          </Title>
          <Lead theme="dark">
            Avec {BRAND}, passez d&apos;une vision comptable rétrospective à un
            pilotage proactif et stratégique :
          </Lead>
          <motion.div
            variants={stagger}
            className="flex flex-col gap-4"
            style={blockGap}
          >
            {decisions.map((d) => (
              <CheckItem key={d.text} theme="onPhoto">
                {d.text}
              </CheckItem>
            ))}
          </motion.div>
        </div>

        {/* Carte "décideur" flottante */}
        <motion.div
          variants={fromRight}
          className="col-span-5 flex min-w-0 items-center justify-center"
        >
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="glass glow-blue w-full max-w-sm rounded-3xl p-6"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`,
                }}
              >
                <User size={24} color="#fff" />
              </span>
              <div>
                <div className="text-base font-bold text-white">
                  Le dirigeant
                </div>
                <div className="text-sm" style={{ color: PALETTE.muted }}>
                  face à ses indicateurs
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { l: "Trésorerie", v: "1,15 M€" },
                { l: "Marge", v: "+2,1 pts" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div className="text-xl font-extrabold text-white">{s.v}</div>
                  <div className="text-xs" style={{ color: PALETTE.muted }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
            <div
              className="mt-3 flex items-center gap-2 rounded-xl p-3"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <TrendingUp size={18} color={PALETTE.up} />
              <span className="text-sm" style={{ color: PALETTE.ice }}>
                Tendance favorable détectée
              </span>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </NavyFrame>
  );
}

/* ===================== SLIDE 8 — Sécurité ===================== */
export function SlideSecurity() {
  return (
    <LightFrame>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid h-full grid-cols-12 items-center gap-12"
      >
        <div className="col-span-6 flex min-w-0 flex-col">
          <Title theme="light">
            Sécurisé. Fiable. Accessible. <span style={hi}>Partout.</span>
          </Title>
          <Lead theme="light">
            Une solution SaaS conçue pour répondre aux exigences des entreprises
            modernes :
          </Lead>
          <motion.div
            variants={stagger}
            className="flex flex-col gap-4"
            style={blockGap}
          >
            {security.map((s) => (
              <CheckItem key={s.text}>{s.text}</CheckItem>
            ))}
          </motion.div>
        </div>

        {/* Bouclier */}
        <motion.div
          variants={scaleIn}
          className="col-span-6 flex items-center justify-center"
        >
          <motion.div
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <div
              className="absolute inset-0 -z-10 rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(47,115,215,0.35), transparent 70%)",
                transform: "scale(1.6)",
              }}
            />
            <div
              className="flex h-64 w-64 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(160deg, #eaf2fe, #d6e6fb)",
              }}
            >
              <div
                className="flex h-48 w-48 items-center justify-center rounded-full shadow-2xl"
                style={{
                  background: `linear-gradient(160deg, ${PALETTE.blue}, ${PALETTE.indigo})`,
                }}
              >
                <ShieldCheck size={96} color="#fff" strokeWidth={1.8} />
              </div>
            </div>
            {[
              { Icon: User, top: "-6%", left: "78%", d: 0 },
              { Icon: Laptop, top: "62%", left: "-10%", d: 0.6 },
              { Icon: Check, top: "84%", left: "70%", d: 1.1 },
            ].map(({ Icon, top, left, d }, i) => (
              <motion.span
                key={i}
                className="absolute flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg"
                style={{
                  top,
                  left,
                  border: `1px solid ${PALETTE.lightBorder}`,
                }}
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 3 + d,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: d,
                }}
              >
                <Icon size={22} color={PALETTE.blue} />
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
    </LightFrame>
  );
}

/* ===================== SLIDE 9 — CTA ===================== */
export function SlideCta() {
  const { exportDeck, exporting } = useDeckExport();
  const isClone = useIsExportClone();
  return (
    <NavyFrame>
      <HeroChart className="pointer-events-none absolute right-8 top-1/2 h-[54%] w-[42%] -translate-y-1/2" />
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex h-full flex-col"
      >
        <div className="flex-1" />

        <div className="max-w-[52%]">
          <Title theme="dark">
            Transformez vos données comptables en{" "}
            <span style={hi}>avantage concurrentiel</span>.
          </Title>
          <Lead theme="dark">
            {BRAND}, votre copilote pour une gestion performante et durable.
          </Lead>

          <motion.a
            href={DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            variants={riseIn}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex w-fit items-center gap-2 rounded-2xl px-9 py-5 font-bold text-white shadow-xl"
            style={{
              ...blockGap,
              fontSize: "clamp(1.05rem, 1.4vw, 1.3rem)",
              background: `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`,
            }}
          >
            Demandez une démo <ArrowRight size={22} />
          </motion.a>

          <motion.p
            variants={riseIn}
            className="mt-6 text-base"
            style={{ color: PALETTE.muted }}
          >
            et découvrez tout le potentiel de vos données. &nbsp;•&nbsp;{" "}
            {DOMAIN}
          </motion.p>

          {/* Téléchargement de la présentation (masqué dans les captures) */}
          {!isClone && (
            <motion.div
              variants={riseIn}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <span
                className="text-sm font-medium"
                style={{ color: PALETTE.ice }}
              >
                Télécharger la présentation :
              </span>
              <button
                onClick={() => exportDeck("pdf")}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                style={{ borderColor: PALETTE.panelBorder }}
              >
                <FileText size={18} color={PALETTE.blueBright} /> PDF
              </button>
              <button
                onClick={() => exportDeck("pptx")}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                style={{ borderColor: PALETTE.panelBorder }}
              >
                <Presentation size={18} color={PALETTE.blueBright} /> PowerPoint
              </button>
            </motion.div>
          )}
        </div>

        <div className="flex-1" />
      </motion.div>
    </NavyFrame>
  );
}

/* ============================ SLIDE — Contact / Demande de démo ============================ */
// Formulaire de demande de démo intégré dans le deck. Envoie un email via
// /api/demo-request (Resend) à l'adresse interne. Pas de stockage en base.
export function SlideContact() {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [consent, setConsent] = useState(false);
  // Honeypot : champ caché, doit rester vide. Si rempli, on simule un succès
  // silencieux côté API.
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    nom.trim() &&
    prenom.trim() &&
    entreprise.trim() &&
    email.trim() &&
    consent &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          prenom,
          entreprise,
          email,
          telephone: telephone || undefined,
          commentaire: commentaire || undefined,
          consent: true,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error || "Erreur lors de l'envoi. Réessayez.");
        return;
      }
      setSuccess(true);
    } catch {
      setErrorMsg("Erreur réseau. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${PALETTE.panelBorder}`,
    color: "#fff",
    borderRadius: 10,
    padding: "0.7rem 0.9rem",
    fontSize: "0.95rem",
    width: "100%",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    color: PALETTE.ice,
    fontSize: "0.78rem",
    fontWeight: 600,
    marginBottom: "0.35rem",
    display: "block",
  };

  return (
    <NavyFrame>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid h-full grid-cols-1 gap-10 lg:grid-cols-2"
        style={{ alignContent: "center" }}
      >
        {/* Colonne gauche : pitch */}
        <div className="flex flex-col justify-center">
          <Title theme="dark">
            Parlons de votre <span style={hi}>reporting financier</span>.
          </Title>
          <Lead theme="dark">
            Laissez-nous vos coordonnées : un membre de l&apos;équipe {BRAND}
            vous recontacte pour planifier une démo personnalisée.
          </Lead>

          <motion.div
            variants={stagger}
            className="flex flex-col gap-4"
            style={blockGap}
          >
            {contact.map((s) => (
              <CheckItem theme="onPhoto" key={s.text}>
                {s.text}
              </CheckItem>
            ))}
          </motion.div>
        </div>

        {/* Colonne droite : formulaire ou message de succès */}
        <motion.div variants={fromRight}>
          {success ? (
            <div
              className="rounded-2xl p-8"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${PALETTE.panelBorder}`,
              }}
            >
              <div className="flex items-center gap-3">
                <CircleIcon name="Check" size={48} />
                <h3 className="text-2xl font-bold" style={{ color: "#fff" }}>
                  Demande envoyée !
                </h3>
              </div>
              <p
                className="mt-4 text-base leading-relaxed"
                style={{ color: PALETTE.ice }}
              >
                Merci {prenom}. Nous vous recontactons sous 24 h ouvrées à
                l&apos;adresse <strong>{email}</strong> pour planifier votre
                démo.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl p-6"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${PALETTE.panelBorder}`,
              }}
            >
              {/* Honeypot — invisible, accessible aux bots seulement. */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: -10000,
                  top: "auto",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                }}
              >
                <label>
                  Ne pas remplir
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label style={labelStyle}>
                    Nom <span style={{ color: PALETTE.blueBright }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    Prénom <span style={{ color: PALETTE.blueBright }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label style={labelStyle}>
                    Entreprise{" "}
                    <span style={{ color: PALETTE.blueBright }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={entreprise}
                    onChange={(e) => setEntreprise(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    Email <span style={{ color: PALETTE.blueBright }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input
                    type="tel"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label style={labelStyle}>Commentaire</label>
                  <textarea
                    rows={3}
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>
              </div>

              <label
                className="mt-4 flex items-start gap-2 text-xs leading-snug"
                style={{ color: PALETTE.ice }}
              >
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  J&apos;accepte que mes données soient utilisées par {BRAND}{" "}
                  pour me recontacter au sujet de cette demande de démo.
                </span>
              </label>

              {errorMsg && (
                <p
                  className="mt-3 text-sm"
                  style={{ color: "#ff8a8a" }}
                  role="alert"
                >
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-white shadow-lg transition-transform disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`,
                }}
              >
                {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
                {!submitting && <ArrowRight size={18} />}
              </button>
            </form>
          )}
        </motion.div>
      </motion.div>
    </NavyFrame>
  );
}

export const SLIDES = [
  SlideCover,
  SlideValue,
  SlideProcess,
  SlideIndicators,
  SlideKpis,
  SlideBalance,
  SlideDecide,
  SlideSecurity,
  SlideContact,
  SlideCta,
];

export const SLIDE_TITLES = [
  "Couverture",
  "Valeur",
  "Processus",
  "Indicateurs",
  "KPIs",
  "Bilan",
  "Décision",
  "Sécurité",
  "Contact",
  "Démo",
];

// Thème de fond par slide — utilisé pour adapter l'UI de navigation.
export const SLIDE_THEMES: ("dark" | "light")[] = [
  "dark",
  "light",
  "dark",
  "light",
  "dark",
  "light",
  "dark",
  "light",
  "dark",
  "dark",
];
