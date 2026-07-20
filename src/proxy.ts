import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { PlatformDatabaseAdapter } from "@llanesleonardo/saas-platform";
import {
  DEFAULT_SESSION_COOKIE,
  isShellPublicPath,
} from "./cookies";

export type ShellWorkspaceGateOptions = {
  getDb: () => PlatformDatabaseAdapter | Promise<PlatformDatabaseAdapter>;
  /** Resolve app user id from the session cookie value. */
  resolveUserId: (sessionId: string) => Promise<string | null>;
  onboardingPath?: string;
  /** Exact paths that skip the workspace gate (default includes /onboarding). */
  exemptExact?: string[];
  /** Prefixes that skip the workspace gate (default /api/workspaces, /api/auth, /invite). */
  exemptPrefixes?: string[];
};

export type ShellFirstAdminGateOptions = {
  getDb: () => PlatformDatabaseAdapter | Promise<PlatformDatabaseAdapter>;
  /** First-admin page (default /setup). */
  setupPath?: string;
  /** After first admin exists, /setup redirects here (default /login). */
  loginPath?: string;
};

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
  /**
   * One super admin: empty install → force /setup; after first user, close /setup.
   * (see docs/DUAL-MODE-TENANCY.md).
   */
  requireFirstAdmin?: ShellFirstAdminGateOptions;
  /**
   * Dual-mode standard: after auth, require ≥1 workspace membership
   * (see docs/DUAL-MODE-TENANCY.md).
   */
  requireWorkspace?: ShellWorkspaceGateOptions;
};

function hasClerkSessionHint(request: NextRequest): boolean {
  if (request.cookies.get("__session")?.value) return true;
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("__clerk") || c.name.includes("clerk")) {
      if (c.value) return true;
    }
  }
  return false;
}

function isWorkspaceExempt(pathname: string, gate: ShellWorkspaceGateOptions): boolean {
  const onboarding = gate.onboardingPath ?? "/onboarding";
  const exact = new Set([
    onboarding,
    "/account",
    "/settings/security",
    ...(gate.exemptExact ?? []),
  ]);
  if (exact.has(pathname)) return true;

  const prefixes = [
    "/api/workspaces",
    "/api/auth",
    "/api/account",
    "/invite",
    ...(gate.exemptPrefixes ?? []),
  ];
  for (const prefix of prefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

async function enforceWorkspaceGate(
  request: NextRequest,
  pathname: string,
  sessionId: string | undefined,
  gate: ShellWorkspaceGateOptions,
): Promise<NextResponse | null> {
  if (isWorkspaceExempt(pathname, gate)) return null;
  if (!sessionId) return null;

  const userId = await gate.resolveUserId(sessionId);
  if (!userId) return null;

  const db = await gate.getDb();
  const workspaces = await db.listWorkspacesForUser(userId);
  if (workspaces.length > 0) return null;

  const onboardingPath = gate.onboardingPath ?? "/onboarding";
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Create a workspace first", code: "NO_WORKSPACE" },
      { status: 400 },
    );
  }
  return NextResponse.redirect(new URL(onboardingPath, request.url));
}

async function enforceFirstAdminGate(
  request: NextRequest,
  pathname: string,
  gate: ShellFirstAdminGateOptions,
  publicExact: Set<string>,
  publicPrefixes: string[],
): Promise<NextResponse | null> {
  const setupPath = gate.setupPath ?? "/setup";
  const loginPath = gate.loginPath ?? "/login";
  const db = await gate.getDb();
  const userCount = await db.countUsers();

  const isSetupPath =
    pathname === setupPath ||
    pathname.startsWith("/api/auth/setup");

  if (userCount === 0) {
    if (isSetupPath) return NextResponse.next();
    if (pathname === "/api/auth/setup-status") return NextResponse.next();
    if (publicExact.has(pathname)) return null;
    for (const prefix of publicPrefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return null;
    }
    // Marketing/health stay open; everything else needs first admin.
    if (
      pathname === "/api/health" ||
      pathname === "/api/ready" ||
      pathname === "/api/stripe/webhook"
    ) {
      return null;
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: `Setup required. Create the first admin at ${setupPath}.`,
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      );
    }
    const url = new URL(setupPath, request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === setupPath) {
    return NextResponse.redirect(new URL(loginPath, request.url));
  }
  if (pathname.startsWith("/api/auth/setup")) {
    return NextResponse.json(
      { error: `Setup already completed. Use ${loginPath}.`, code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  return null;
}

/**
 * Next.js 16 `proxy` helper — local session cookie (+ optional Clerk hint),
 * optional first-admin setup gate, and optional dual-mode workspace gate.
 */
export function createShellProxy(options: ShellProxyOptions = {}) {
  const sessionCookie = options.sessionCookieName ?? DEFAULT_SESSION_COOKIE;
  const loginPath = options.loginPath ?? "/login";
  const publicExact = new Set(options.publicExact ?? []);
  const publicPrefixes = options.publicPrefixes ?? [];

  return async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (options.requireFirstAdmin) {
      const setupBlocked = await enforceFirstAdminGate(
        request,
        pathname,
        options.requireFirstAdmin,
        publicExact,
        publicPrefixes,
      );
      if (setupBlocked) return setupBlocked;
    }

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
        return NextResponse.json({ error: "Log in required." }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    if (options.requireWorkspace && session) {
      const blocked = await enforceWorkspaceGate(
        request,
        pathname,
        session,
        options.requireWorkspace,
      );
      if (blocked) return blocked;
    }

    return NextResponse.next();
  };
}
