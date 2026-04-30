"use client";

import { useState } from "react";
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
import { ConfirmDialog } from "./confirm-dialog";

const mainNavItems = [
  {
    label: "Overview",
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
    label: "Paramètres",
    href: "/settings",
    icon: Settings,
  },
];

// Le sidebar se réduit automatiquement sur les pages détail client `/clients/<id>`.
export function isCollapsedRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/clients\/[^/]+(?:\/.*)?$/.test(pathname) && pathname !== "/clients/new";
}

export function Sidebar() {
  const pathname = usePathname();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const collapsed = isCollapsedRoute(pathname);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.replace("/auth/signin");
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname?.startsWith(href) ?? false;
  };

  return (
    <>
      <aside
        className={`fixed left-0 top-0 bottom-0 ${
          collapsed ? "w-[72px]" : "w-[220px]"
        } bg-[#F5F9FF] flex flex-col z-50 transition-[width] duration-200`}
      >
        {/* Logo */}
        <div className={`pt-6 pb-8 ${collapsed ? "px-2 flex justify-center" : "px-5"}`}>
          <Image
            src="/logo-click-insight-light.png"
            alt="Click Insight"
            width={collapsed ? 40 : 120}
            height={collapsed ? 40 : 55}
            className="object-contain"
          />
        </div>

        {/* Main Navigation */}
        <nav className={`flex-1 ${collapsed ? "px-2" : "px-3"}`}>
          <ul className="space-y-1">
            {mainNavItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center ${
                      collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
                    } rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#EBF5FF] text-[#0077C3]"
                        : "text-[#335890] hover:bg-[#EBF5FF]/50 hover:text-[#0077C3]"
                    }`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom Navigation */}
        <div className={`pb-4 ${collapsed ? "px-2" : "px-3"}`}>
          <ul className="space-y-1">
            {bottomNavItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center ${
                      collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
                    } rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#EBF5FF] text-[#0077C3]"
                        : "text-[#335890] hover:bg-[#EBF5FF]/50 hover:text-[#0077C3]"
                    }`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                title={collapsed ? "Se déconnecter" : undefined}
                className={`flex items-center ${
                  collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
                } rounded-lg text-sm font-medium text-[#335890] hover:bg-[#EBF5FF]/50 hover:text-[#0077C3] transition-colors w-full`}
              >
                <LogOut className="w-5 h-5 shrink-0" />
                {!collapsed && <span>Se déconnecter</span>}
              </button>
            </li>
          </ul>

          {!collapsed && (
            <p className="text-xs text-[#94A3B8] px-4 mt-4">Version V 0.0.1</p>
          )}
        </div>
      </aside>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleSignOut}
        title="Attention"
        message="Êtes-vous sûr de vouloir vous déconnecter ?"
        confirmLabel="Se déconnecter"
        cancelLabel="Annuler"
        variant="warning"
        confirmIcon={<LogOut className="w-4 h-4" />}
      />
    </>
  );
}
