"use client";

/* ============================================================
   Export du deck en PDF / PowerPoint (captures image fidèles).
   - rend toutes les slides hors-écran en 1280×720
   - capture chacune avec html-to-image
   - assemble un PDF (jsPDF) ou un PPTX (pptxgenjs)
   Les boutons de téléchargement sont masqués dans les copies
   captur ées via le contexte « clone ».
============================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ComponentType,
} from "react";

const W = 1280;
const H = 720;

type Fmt = "pdf" | "pptx";

type ExportState = {
  exportDeck: (fmt: Fmt) => void;
  exporting: boolean;
  progress: string;
};

const ExportCtx = createContext<ExportState>({
  exportDeck: () => {},
  exporting: false,
  progress: "",
});
export const useDeckExport = () => useContext(ExportCtx);

// Vrai dans les copies hors-écran : permet à la slide de masquer
// les boutons d'export pour qu'ils n'apparaissent pas sur l'image.
const CloneCtx = createContext(false);
export const useIsExportClone = () => useContext(CloneCtx);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Attend que toutes les images fournies soient chargées et décodées.
// Évite de capturer une slide dont un logo / une capture n'est pas encore
// rendu (glitchs de design incohérent dans le PPTX/PDF).
async function waitForImages(imgs: ArrayLike<Element>) {
  const list = Array.from(imgs).filter(
    (el): el is HTMLImageElement => el instanceof HTMLImageElement,
  );
  await Promise.all(
    list.map(async (img) => {
      try {
        if (!img.complete || img.naturalWidth === 0) {
          await new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          });
        }
        if (img.decode) await img.decode().catch(() => {});
      } catch {
        /* ignore */
      }
    }),
  );
}

export function DeckExportProvider({
  children,
  slides,
  fileBase = "REPFI-presentation",
}: {
  children: React.ReactNode;
  slides: ComponentType[];
  fileBase?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");

  const exportDeck = useCallback(
    async (fmt: Fmt) => {
      setExporting(true);
      setProgress("Préparation…");
      try {
        // Laisse React monter les slides hors-écran, puis attend que les
        // animations d'entrée se terminent et que la police soit prête.
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
        );
        try {
          await (document as Document).fonts.ready;
        } catch {
          /* ignore */
        }
        await sleep(1400);

        const { toPng } = await import("html-to-image");
        const boxes = Array.from(
          document.querySelectorAll<HTMLElement>("[data-export-slide]"),
        );

        // Attend le décodage de TOUTES les images de TOUTES les slides avant
        // de démarrer la capture.
        await waitForImages(
          document.querySelectorAll("[data-export-slide] img"),
        );
        await sleep(500);

        const images: string[] = [];
        for (let i = 0; i < boxes.length; i++) {
          setProgress(`Capture ${i + 1}/${boxes.length}…`);
          // Rendu complet de CETTE slide (images décodées + 2 frames) avant
          // capture — garantit une slide entièrement chargée.
          await waitForImages(boxes[i].querySelectorAll("img"));
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
          );
          // double capture : la 1re « réchauffe » l'embed des polices/images
          await toPng(boxes[i], { width: W, height: H, pixelRatio: 1, cacheBust: true });
          const url = await toPng(boxes[i], {
            width: W,
            height: H,
            pixelRatio: 1.5,
            cacheBust: true,
          });
          images.push(url);
        }

        if (fmt === "pdf") {
          setProgress("Assemblage du PDF…");
          await buildPdf(images, fileBase);
        } else {
          setProgress("Assemblage du PowerPoint…");
          await buildPptx(images, fileBase);
        }
      } catch (err) {
        console.error("Export deck échoué", err);
        alert(
          "L'export a échoué. Réessayez ou vérifiez la console pour le détail.",
        );
      } finally {
        setExporting(false);
        setProgress("");
      }
    },
    [fileBase],
  );

  return (
    <ExportCtx.Provider value={{ exportDeck, exporting, progress }}>
      {children}
      {exporting && <HiddenSlides slides={slides} />}
      {exporting && <Overlay progress={progress} />}
    </ExportCtx.Provider>
  );
}

/* Pile des slides du deck courant, rendues hors-écran à taille fixe. */
function HiddenSlides({ slides }: { slides: ComponentType[] }) {
  return (
    <CloneCtx.Provider value={true}>
      <div
        aria-hidden
        className="repfi-deck"
        style={{
          position: "fixed",
          left: -100000,
          top: 0,
          width: W,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        {slides.map((Slide, i) => (
          <div
            key={i}
            data-export-slide
            style={{ width: W, height: H, overflow: "hidden", background: "#06142E" }}
          >
            <Slide />
          </div>
        ))}
      </div>
    </CloneCtx.Provider>
  );
}

function Overlay({ progress }: { progress: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: "rgba(4,13,32,0.82)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: "50%",
          border: "4px solid rgba(255,255,255,0.18)",
          borderTopColor: "#4F9BFF",
          animation: "repfi-spin 0.8s linear infinite",
        }}
      />
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
        Génération de la présentation
      </div>
      <div style={{ color: "#8AA2C8", fontSize: 14 }}>{progress}</div>
      <style>{`@keyframes repfi-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ---------- assemblage des fichiers ---------- */
async function buildPdf(images: string[], fileBase: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H] });
  images.forEach((img, i) => {
    if (i) pdf.addPage([W, H], "landscape");
    pdf.addImage(img, "PNG", 0, 0, W, H);
  });
  pdf.save(`${fileBase}.pdf`);
}

// pptxgenjs importe `node:fs` et ne peut pas être bundlé pour le navigateur
// (échoue avec webpack ET turbopack). On charge donc son bundle UMD autonome
// depuis /public, qui expose window.PptxGenJS — indépendant du bundler.
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-vendor="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.vendor = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Échec du chargement de ${src}`));
    document.head.appendChild(s);
  });
}

async function buildPptx(images: string[], fileBase: string) {
  await loadScript("/vendor/pptxgen.bundle.js");
  const PptxGenJS = (window as unknown as { PptxGenJS?: new () => PptxInstance })
    .PptxGenJS;
  if (!PptxGenJS) throw new Error("PptxGenJS indisponible");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "REPFI16x9", width: 13.333, height: 7.5 });
  pptx.layout = "REPFI16x9";
  images.forEach((img) => {
    const slide = pptx.addSlide();
    slide.addImage({ data: img, x: 0, y: 0, w: 13.333, h: 7.5 });
  });
  await pptx.writeFile({ fileName: `${fileBase}.pptx` });
}

type PptxInstance = {
  defineLayout: (o: { name: string; width: number; height: number }) => void;
  layout: string;
  addSlide: () => {
    addImage: (o: {
      data: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }) => void;
  };
  writeFile: (o: { fileName: string }) => Promise<string>;
};
