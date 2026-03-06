import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });
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
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}



// // docker compose -p airflow-prod --env-file .env.prod up -d --build
// // docker compose -p airflow-preprod --env-file .env.preprod up -d --build