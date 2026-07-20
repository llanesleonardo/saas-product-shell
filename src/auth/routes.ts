import { NextResponse } from "next/server";
import type { PlatformDatabaseAdapter } from "@llanesleonardo/saas-platform";
import { jsonError, parseJsonBody, ShellError } from "../errors";
import { hashPassword, timingSafeEqualString, verifyPassword } from "./password";
import {
  applySessionCookie,
  clientMetaFromRequest,
  createSessionForUser,
  DEFAULT_SESSION_COOKIE,
  requireSessionUser,
  type PublicUser,
} from "./session";

export type AuthRouteDeps = {
  getDb: () => PlatformDatabaseAdapter;
  sessionCookieName?: string;
  getSessionId: (request: Request) => string | undefined | null;
};

function cookieName(deps: AuthRouteDeps) {
  return deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE;
}

export function createSetupHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const body = await parseJsonBody<{
        email?: string;
        password?: string;
        setupToken?: string;
      }>(request);
      const email = (body.email ?? "").trim().toLowerCase();
      const password = body.password ?? "";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw ShellError.validation("A valid email is required", ["email"]);
      }
      if (!password || password.length < 8) {
        throw ShellError.validation("Password must be at least 8 characters", ["password"]);
      }

      const expected = process.env.SETUP_TOKEN ?? "";
      if (expected) {
        if (!body.setupToken || !timingSafeEqualString(body.setupToken, expected)) {
          throw ShellError.unauthorized("Invalid setup token.");
        }
      }

      const db = deps.getDb();
      if ((await db.countUsers()) > 0) {
        throw ShellError.validation("Setup already completed. Use /login.", [
          "SETUP_ALREADY_DONE",
        ]);
      }

      const created = await db.createUser({
        email,
        password_hash: hashPassword(password),
        role: "admin",
      });
      const sessionId = await createSessionForUser(db, created.id);
      const response = NextResponse.json({
        success: true,
        user: { id: created.id, email, role: "admin" } satisfies PublicUser,
      });
      applySessionCookie(response, sessionId, { cookieName: cookieName(deps) });
      return response;
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createLoginHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const body = await parseJsonBody<{ email?: string; password?: string }>(request);
      const email = (body.email ?? "").trim().toLowerCase();
      const password = body.password ?? "";
      if (!email || !password) {
        throw ShellError.validation("Email and password are required", ["email", "password"]);
      }
      const db = deps.getDb();
      const user = await db.getUserByEmail(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        throw ShellError.unauthorized("Invalid email or password.");
      }
      const sessionId = await createSessionForUser(
        db,
        user.id,
        clientMetaFromRequest(request),
      );
      const response = NextResponse.json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role },
      });
      applySessionCookie(response, sessionId, { cookieName: cookieName(deps) });
      return response;
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createLogoutHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const sessionId = deps.getSessionId(request);
      if (sessionId) await db.deleteSession(sessionId).catch(() => undefined);
      const response = NextResponse.json({ success: true });
      applySessionCookie(response, "", { cookieName: cookieName(deps), days: 0 });
      response.cookies.set(cookieName(deps), "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createMeHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const user = await requireSessionUser(deps.getDb(), deps.getSessionId(request));
      return NextResponse.json({ user });
    } catch (err) {
      return jsonError(err);
    }
  };
}

/** Public: `{ needsSetup: true }` when no users exist (one super admin). */
export function createSetupStatusHandler(deps: Pick<AuthRouteDeps, "getDb">) {
  return async (): Promise<Response> => {
    try {
      const needsSetup = (await deps.getDb().countUsers()) === 0;
      return NextResponse.json({ needsSetup });
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createPasswordChangeHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await requireSessionUser(db, deps.getSessionId(request));
      const body = await parseJsonBody<{
        currentPassword?: string;
        newPassword?: string;
      }>(request);
      const currentPassword = body.currentPassword ?? "";
      const newPassword = body.newPassword ?? "";
      if (newPassword.length < 8) {
        throw ShellError.validation("New password must be at least 8 characters", [
          "newPassword",
        ]);
      }
      const full = await db.getUserById(user.id);
      if (!full || !verifyPassword(currentPassword, full.password_hash)) {
        throw ShellError.unauthorized("Current password is incorrect.");
      }
      await db.updateUserPassword(user.id, hashPassword(newPassword));
      await db.deleteSessionsForUser(user.id);
      const sessionId = await createSessionForUser(db, user.id);
      const response = NextResponse.json({ success: true });
      applySessionCookie(response, sessionId, { cookieName: cookieName(deps) });
      return response;
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createSessionsListHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await requireSessionUser(db, deps.getSessionId(request));
      const currentId = deps.getSessionId(request) ?? null;
      const sessions = await db.listSessionsForUser(user.id);
      return NextResponse.json({
        provider: "local",
        currentSessionId: currentId,
        sessions: sessions.map((s) => ({
          id: s.id,
          created_at: s.created_at,
          expires_at: s.expires_at,
          last_seen_at: s.last_seen_at ?? null,
          user_agent: s.user_agent ?? null,
          ip: s.ip ?? null,
          current: s.id === currentId,
        })),
      });
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createSessionRevokeHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await requireSessionUser(db, deps.getSessionId(request));
      const body = await parseJsonBody<{ sessionId?: string; others?: boolean }>(request);
      const currentId = deps.getSessionId(request) ?? null;
      if (body.others) {
        const sessions = await db.listSessionsForUser(user.id);
        for (const s of sessions) {
          if (s.id !== currentId) await db.deleteSession(s.id);
        }
        return NextResponse.json({ ok: true });
      }
      if (!body.sessionId) {
        throw ShellError.validation("sessionId or others is required", ["sessionId"]);
      }
      const sessions = await db.listSessionsForUser(user.id);
      if (!sessions.some((s) => s.id === body.sessionId)) {
        throw ShellError.notFound("Session");
      }
      await db.deleteSession(body.sessionId);
      return NextResponse.json({
        ok: true,
        revokedCurrent: body.sessionId === currentId,
      });
    } catch (err) {
      return jsonError(err);
    }
  };
}
