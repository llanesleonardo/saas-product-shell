import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DEFAULT_SESSION_COOKIE,
  isShellPublicPath,
} from "./cookies";

export type ShellProxyOptions = {
  /** Extra exact public paths (e.g. "/", "/pricing"). */
  publicExact?: string[];
  /** Extra public prefixes (e.g. "/docs"). */
  publicPrefixes?: string[];
  /** Cookie name for local session (default shell_session). */
  sessionCookieName?: string;
  /** Where to send unauthenticated browsers (default /login). */
  loginPath?: string;
  /**
   * When true, also allow through if Clerk session cookie indicators are present
   * (client still validates via resolveClerkAppUser on the server).
   */
  allowClerkCookie?: boolean;
};

function hasClerkSessionHint(request: NextRequest): boolean {
  // Clerk sets __session and/or clerk cookies depending on version.
  if (request.cookies.get("__session")?.value) return true;
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("__clerk") || c.name.includes("clerk")) {
      if (c.value) return true;
    }
  }
  return false;
}

/**
 * Next.js 16 `proxy` helper — local session cookie (+ optional Clerk hint).
 */
export function createShellProxy(options: ShellProxyOptions = {}) {
  const sessionCookie = options.sessionCookieName ?? DEFAULT_SESSION_COOKIE;
  const loginPath = options.loginPath ?? "/login";
  const publicExact = new Set(options.publicExact ?? []);
  const publicPrefixes = options.publicPrefixes ?? [];

  return function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (publicExact.has(pathname) || isShellPublicPath(pathname)) {
      return NextResponse.next();
    }
    for (const prefix of publicPrefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return NextResponse.next();
      }
    }

    const session = request.cookies.get(sessionCookie)?.value;
    const clerkOk = options.allowClerkCookie ? hasClerkSessionHint(request) : false;

    if (!session && !clerkOk) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Sign in required." }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  };
}
