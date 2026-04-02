"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  FileText,
  UserCircle,
  Settings,
  LogOut,
} from "lucide-react";

const mainNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Clients",
    href: "/clients",
    icon: Users,
  },
  {
    label: "Fichiers",
    href: "/files",
    icon: FileText,
  },
  {
    label: "Membres",
    href: "/users",
    icon: UserCircle,
  },
];

const bottomNavItems = [
  {
    label: "Param\u00e8tres",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.replace("/auth/signin");
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-[#F5F9FF] flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 pt-6 pb-8">
        <Image
          src="/logo-click-insight-light.png"
          alt="Click Insight"
          width={120}
          height={55}
          className="object-contain"
        />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {mainNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#EBF5FF] text-[#0077C3]"
                      : "text-[#335890] hover:bg-[#EBF5FF]/50 hover:text-[#0077C3]"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 pb-4">
        <ul className="space-y-1">
          {bottomNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#EBF5FF] text-[#0077C3]"
                      : "text-[#335890] hover:bg-[#EBF5FF]/50 hover:text-[#0077C3]"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-[#335890] hover:bg-[#EBF5FF]/50 hover:text-[#0077C3] transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              Se d\u00e9connecter
            </button>
          </li>
        </ul>

        <p className="text-xs text-[#94A3B8] px-4 mt-4">Version V 0.0.1</p>
      </div>
    </aside>
  );
}
