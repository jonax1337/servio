import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/v1"];

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role ?? "USER";

  // Public routes — always allowed
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    // Redirect logged-in users away from the login page
    if (path.startsWith("/login") && isLoggedIn) {
      return NextResponse.redirect(new URL("/", nextUrl));
    }
    return NextResponse.next();
  }

  // Everything else requires auth
  if (!isLoggedIn) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }

  // Plain end users live in the self-service portal, not the agent console.
  // (Account settings is a dialog in the topbar user-menu, available in both.)
  const isPortal = path.startsWith("/portal");
  if (role === "USER" && !isPortal) {
    return NextResponse.redirect(new URL("/portal", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next internals & static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
