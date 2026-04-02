"use client";

import { Sidebar } from "./sidebar";
import Image from "next/image";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <Sidebar />
      <main className="ml-[220px] relative min-h-screen">
        {/* Background watermark */}
        <div className="fixed right-0 bottom-0 opacity-[0.03] pointer-events-none z-0">
          <Image
            src="/logo-click-insight-fill.png"
            alt=""
            width={500}
            height={500}
            className="object-contain"
          />
        </div>
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
