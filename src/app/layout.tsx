import type { Metadata } from "next";
import { Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const montserrat = Montserrat_Alternates({ subsets: ["latin"], weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"] });
export const metadata: Metadata = {
  title: "Repfi",
  description: "Reporting financier",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={montserrat.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}



// // docker compose -p airflow-prod --env-file .env.prod up -d --build
// // docker compose -p airflow-preprod --env-file .env.preprod up -d --build