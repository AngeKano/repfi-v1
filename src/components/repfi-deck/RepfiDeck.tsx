"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Home as HomeIcon,
  User,
  Building2,
} from "lucide-react";
import { PALETTE } from "./brand";
import { DECKS, type DeckDef, type DeckMode } from "./slide-components";
import { DeckExportProvider } from "./deck-export";
import { Logo } from "./primitives";

export default function RepfiDeck() {
  // Mode sélectionné depuis l'accueil (ou deep-link ?deck=client|cabinet).
  const [mode, setMode] = useState<DeckMode | null>(() => {
    if (typeof window !== "undefined") {
      const d = new URLSearchParams(window.location.search).get("deck");
      if (d === "client" || d === "cabinet") return d;
    }
    return null;
  });

  if (!mode) return <Home onSelect={setMode} />;

  const deck = DECKS[mode];
  const fileBase =
    mode === "client" ? "REPFI-client-final" : "REPFI-cabinet";

  return (
    // L'export PPTX/PDF utilise `exportSlides` (Contact + Démo fusionnées) ;
    // la présentation en ligne (Deck) garde `deck.slides` (les deux slides).
    <DeckExportProvider slides={deck.exportSlides} fileBase={fileBase}>
      <Deck deck={deck} onHome={() => setMode(null)} />
    </DeckExportProvider>
  );
}

/* ============================ Accueil ============================ */
function Home({ onSelect }: { onSelect: (m: DeckMode) => void }) {
  const cards = [
    {
      mode: "client" as DeckMode,
      icon: User,
      title: "Client final",
      desc: "Pour l'entreprise qui pilote sa propre activité.",
    },
    {
      mode: "cabinet" as DeckMode,
      icon: Building2,
      title: "Cabinet comptable",
      desc: "Pour le cabinet qui pilote ses dossiers clients.",
    },
  ];

  return (
    <main
      className="repfi-deck fixed inset-0 flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: PALETTE.navy }}
    >
      <div className="navy-radial absolute inset-0" />

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10"
      >
        <Logo theme="dark" size={62} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="relative z-10 mt-9 text-center font-extrabold leading-tight tracking-tight text-white"
        style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)" }}
      >
        Choisissez votre <span style={{ color: PALETTE.blueBright }}>présentation</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative z-10 mt-3 max-w-xl text-center"
        style={{ color: PALETTE.ice, fontSize: "clamp(1rem, 1.5vw, 1.2rem)" }}
      >
        Deux parcours, un même produit — sélectionnez l&apos;audience à qui vous
        présentez.
      </motion.p>

      <div className="relative z-10 mt-10 grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        {cards.map((c, i) => (
          <motion.button
            key={c.mode}
            type="button"
            onClick={() => onSelect(c.mode)}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
            whileHover={{ y: -5 }}
            className="glass glow-blue group flex flex-col rounded-3xl p-8 text-left focus:outline-none focus-visible:ring-2"
            style={{ outlineColor: PALETTE.blueBright }}
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`,
              }}
            >
              <c.icon size={26} color="#fff" />
            </span>
            <span className="mt-5 text-xl font-extrabold text-white">
              {c.title}
            </span>
            <span className="mt-1.5 text-sm" style={{ color: PALETTE.ice }}>
              {c.desc}
            </span>
            <span
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold transition-transform group-hover:translate-x-1"
              style={{ color: PALETTE.blueBright }}
            >
              Voir la présentation <ArrowRight size={16} />
            </span>
          </motion.button>
        ))}
      </div>
    </main>
  );
}

/* ============================ Deck ============================ */
function Deck({ deck, onHome }: { deck: DeckDef; onHome: () => void }) {
  const COUNT = deck.slides.length;

  const [[page, dir], setPage] = useState<[number, number]>(() => {
    if (typeof window !== "undefined") {
      const n = parseInt(
        new URLSearchParams(window.location.search).get("slide") || "",
        10,
      );
      if (!Number.isNaN(n) && n >= 1 && n <= COUNT) return [n - 1, 0];
    }
    return [0, 0];
  });
  const [hoverL, setHoverL] = useState(false);
  const [hoverR, setHoverR] = useState(false);

  const paginate = useCallback(
    (next: number) => {
      setPage(([cur]) => {
        const target = cur + next;
        if (target < 0 || target >= COUNT) return [cur, 0];
        return [target, next];
      });
    },
    [COUNT],
  );

  const goTo = useCallback(
    (i: number) => setPage(([cur]) => [i, i > cur ? 1 : -1]),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isEditable) return;

      if (["ArrowRight", "ArrowDown", " ", "Enter", "PageDown"].includes(e.key)) {
        e.preventDefault();
        paginate(1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        paginate(-1);
      } else if (e.key === "Home") goTo(0);
      else if (e.key === "End") goTo(COUNT - 1);
      else if (e.key === "Escape") onHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paginate, goTo, COUNT, onHome]);

  const Slide = deck.slides[page];
  const onLight = deck.themes[page] === "light";
  const fg = onLight ? PALETTE.ink : "#ffffff";
  const fgSoft = onLight ? PALETTE.inkSoft : PALETTE.muted;

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 900 : -900, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -900 : 900, opacity: 0 }),
  };

  return (
    <main
      className="repfi-deck fixed inset-0 overflow-hidden"
      style={{ background: PALETTE.navy }}
    >
      {/* Barre de progression */}
      <div
        className="fixed inset-x-0 top-0 z-50 h-1"
        style={{ background: "rgba(130,150,185,0.18)" }}
      >
        <motion.div
          className="h-full"
          style={{
            background: `linear-gradient(90deg, ${PALETTE.sky}, ${PALETTE.blue}, ${PALETTE.indigo})`,
          }}
          initial={false}
          animate={{ width: `${((page + 1) / COUNT) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Indicateur de page (à gauche — le logo est en haut à droite) */}
      <div
        className="fixed left-6 top-5 z-50 text-base font-bold tabular-nums"
        style={{ color: fgSoft }}
      >
        <span style={{ color: PALETTE.blueBright }}>
          {String(page + 1).padStart(2, "0")}
        </span>
        {" / "}
        {String(COUNT).padStart(2, "0")}
      </div>

      {/* Slide */}
      <AnimatePresence initial={false} custom={dir} mode="wait">
        <motion.div
          key={page}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0"
        >
          <Slide />
        </motion.div>
      </AnimatePresence>

      {/* Minimap + retour accueil */}
      <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
        <div
          className="flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{
            background: onLight
              ? "rgba(244,247,253,0.9)"
              : "rgba(14,33,72,0.85)",
            border: `1px solid ${
              onLight ? PALETTE.lightBorder : "rgba(255,255,255,0.12)"
            }`,
          }}
        >
          <button
            onClick={onHome}
            title="Retour à l'accueil"
            aria-label="Retour à l'accueil"
            className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all duration-300 hover:opacity-80"
            style={{
              background: onLight
                ? "rgba(11,31,68,0.07)"
                : "rgba(255,255,255,0.08)",
              color: fgSoft,
            }}
          >
            <HomeIcon size={13} />
            <span className="hidden sm:inline">{deck.label}</span>
          </button>
          <span
            className="mx-0.5 h-4 w-px"
            style={{
              background: onLight ? PALETTE.lightBorder : "rgba(255,255,255,0.15)",
            }}
          />
          {deck.titles.map((t, i) => {
            const active = i === page;
            return (
              <button
                key={t}
                onClick={() => goTo(i)}
                title={`${i + 1}. ${t}`}
                className="flex h-7 items-center justify-center overflow-hidden rounded-lg text-xs font-bold tabular-nums transition-all duration-300 hover:opacity-80"
                style={{
                  paddingInline: active ? 12 : 0,
                  width: active ? "auto" : 28,
                  background: active
                    ? `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.indigo})`
                    : onLight
                    ? "rgba(11,31,68,0.07)"
                    : "rgba(255,255,255,0.08)",
                  color: active ? "#fff" : fgSoft,
                }}
              >
                {active ? `${String(i + 1).padStart(2, "0")} · ${t}` : i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zone gauche */}
      <div
        className="fixed bottom-0 left-0 top-0 z-40 flex w-24 items-center justify-center"
        onMouseEnter={() => setHoverL(true)}
        onMouseLeave={() => setHoverL(false)}
      >
        <AnimatePresence>
          {hoverL && page > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onClick={() => paginate(-1)}
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                background: onLight
                  ? "rgba(11,31,68,0.08)"
                  : "rgba(255,255,255,0.1)",
                color: fg,
              }}
            >
              <ChevronLeft size={24} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Zone droite */}
      <div
        className="fixed bottom-0 right-0 top-0 z-40 flex w-24 items-center justify-center"
        onMouseEnter={() => setHoverR(true)}
        onMouseLeave={() => setHoverR(false)}
      >
        <AnimatePresence>
          {hoverR && page < COUNT - 1 && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onClick={() => paginate(1)}
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                background: onLight
                  ? "rgba(11,31,68,0.08)"
                  : "rgba(255,255,255,0.1)",
                color: fg,
              }}
            >
              <ChevronRight size={24} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
