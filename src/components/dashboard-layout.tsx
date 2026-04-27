"use client";

import { usePathname } from "next/navigation";
import { Sidebar, isCollapsedRoute } from "./sidebar";
import Image from "next/image";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const collapsed = isCollapsedRoute(pathname);
  return (
    <div className="min-h-screen bg-white">
      <Sidebar />
      <main
        className={`${
          collapsed ? "ml-[72px]" : "ml-[220px]"
        } relative min-h-screen transition-[margin] duration-200`}
      >
        {/* Background watermark */}
        <div className="fixed right-0 bottom-0 opacity-[0.03] pointer-events-none z-0">
          <Image
            src="/logologo-click-insight-light.png"
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
