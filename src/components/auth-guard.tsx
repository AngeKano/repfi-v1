"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const protectedRoutes = ["/dashboard", "/clients", "/settings", "/members", "/reporting", "/files", "/users"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

    if (status === "unauthenticated" && isProtected) {
      window.location.replace("/auth/signin");
    }
  }, [status, pathname]);

  return <>{children}</>;
}
