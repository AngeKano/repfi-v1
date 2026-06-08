"use client";

import dynamic from "next/dynamic";
import { Poppins } from "next/font/google";

// Police du deck, auto-hébergée par Next (variable CSS utilisée par .repfi-deck).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

// Deck rendu côté client uniquement (animations + deep-link ?slide=N),
// ce qui évite tout décalage d'hydratation SSR.
const RepfiDeck = dynamic(() => import("@/components/repfi-deck/RepfiDeck"), {
  ssr: false,
});

export default function Page() {
  return (
    <div className={poppins.variable}>
      <RepfiDeck />
    </div>
  );
}
