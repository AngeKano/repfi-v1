"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PALETTE } from "./brand";
import { SLIDES, SLIDE_TITLES, SLIDE_THEMES } from "./slide-components";
import { DeckExportProvider } from "./deck-export";

const COUNT = SLIDES.length;

export default function RepfiDeck() {
  return (
    <DeckExportProvider>
      <Deck />
    </DeckExportProvider>
  );
}

function Deck() {
  const [[page, dir], setPage] = useState<[number, number]>(() => {
    if (typeof window !== "undefined") {
      const n = parseInt(new URLSearchParams(window.location.search).get("slide") || "", 10);
      if (!Number.isNaN(n) && n >= 1 && n <= COUNT) return [n - 1, 0];
    }
    return [0, 0];
  });
  const [hoverL, setHoverL] = useState(false);
  const [hoverR, setHoverR] = useState(false);

  const paginate = useCallback((next: number) => {
    setPage(([cur]) => {
      const target = cur + next;
      if (target < 0 || target >= COUNT) return [cur, 0];
      return [target, next];
    });
  }, []);

  const goTo = useCallback((i: number) => setPage(([cur]) => [i, i > cur ? 1 : -1]), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Quand l'utilisateur est en train de saisir dans un champ (formulaire
      // de contact, etc.), on laisse le navigateur traiter Space, Enter,
      // flèches, etc. — sinon Space changerait de slide au lieu d'insérer
      // un espace, et les flèches déplaceraient le curseur de slide au lieu
      // du curseur de texte.
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paginate, goTo]);

  const Slide = SLIDES[page];
  const onLight = SLIDE_THEMES[page] === "light";
  const fg = onLight ? PALETTE.ink : "#ffffff";
  const fgSoft = onLight ? PALETTE.inkSoft : PALETTE.muted;

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 900 : -900, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -900 : 900, opacity: 0 }),
  };

  return (
    <main className="repfi-deck fixed inset-0 overflow-hidden" style={{ background: PALETTE.navy }}>
      {/* Fine barre de progression en haut */}
      <div className="fixed inset-x-0 top-0 z-50 h-1" style={{ background: "rgba(130,150,185,0.18)" }}>
        <motion.div
          className="h-full"
          style={{ background: `linear-gradient(90deg, ${PALETTE.sky}, ${PALETTE.blue}, ${PALETTE.indigo})` }}
          initial={false}
          animate={{ width: `${((page + 1) / COUNT) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Indicateur de page — sans fond, couleur adaptée au thème de la slide */}
      <div className="fixed right-6 top-5 z-50 text-base font-bold tabular-nums" style={{ color: fgSoft }}>
        <span style={{ color: PALETTE.blueBright }}>{String(page + 1).padStart(2, "0")}</span>
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
          transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
          className="absolute inset-0"
        >
          <Slide />
        </motion.div>
      </AnimatePresence>

      {/* Minimap en bas */}
      <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
        <div
          className="flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{
            background: onLight ? "rgba(244,247,253,0.9)" : "rgba(14,33,72,0.85)",
            border: `1px solid ${onLight ? PALETTE.lightBorder : "rgba(255,255,255,0.12)"}`,
          }}
        >
          {SLIDE_TITLES.map((t, i) => {
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
      <div className="fixed bottom-0 left-0 top-0 z-40 flex w-24 items-center justify-center" onMouseEnter={() => setHoverL(true)} onMouseLeave={() => setHoverL(false)}>
        <AnimatePresence>
          {hoverL && page > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onClick={() => paginate(-1)}
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: onLight ? "rgba(11,31,68,0.08)" : "rgba(255,255,255,0.1)", color: fg }}
            >
              <ChevronLeft size={24} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Zone droite */}
      <div className="fixed bottom-0 right-0 top-0 z-40 flex w-24 items-center justify-center" onMouseEnter={() => setHoverR(true)} onMouseLeave={() => setHoverR(false)}>
        <AnimatePresence>
          {hoverR && page < COUNT - 1 && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onClick={() => paginate(1)}
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: onLight ? "rgba(11,31,68,0.08)" : "rgba(255,255,255,0.1)", color: fg }}
            >
              <ChevronRight size={24} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
