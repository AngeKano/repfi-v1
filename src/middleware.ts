import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/dashboard", "/clients", "/settings", "/members", "/reporting"];
const authRoutes = ["/auth/signin", "/auth/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // If user is on an auth page and already logged in, redirect to dashboard
  if (token && authRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // If user tries to access a protected route without a session, redirect to signin
  if (!token && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const signinUrl = new URL("/auth/signin", request.url);
    signinUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signinUrl);
  }

  // For protected routes, add no-cache headers to prevent back button from showing stale pages
  if (token && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/clients/:path*",
    "/settings/:path*",
    "/members/:path*",
    "/reporting/:path*",
    "/auth/signin",
    "/auth/signup",
  ],
};
