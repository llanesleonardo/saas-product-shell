import type { NextResponse } from "next/server";
import type { PlatformDatabaseAdapter, UserRecord } from "@llanesleonardo/saas-platform";
import { ShellError } from "../errors";
import {
  DEFAULT_SESSION_COOKIE,
  DEFAULT_SESSION_DAYS,
  isShellPublicPath,
} from "../cookies";

export {
  DEFAULT_SESSION_COOKIE,
  DEFAULT_SESSION_DAYS,
  isShellPublicPath,
};

export type PublicUser = { id: string; email: string; role: UserRecord["role"] };

export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}

export function sessionExpiryIso(days = DEFAULT_SESSION_DAYS): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function applySessionCookie(
  response: NextResponse,
  sessionId: string,
  options?: { cookieName?: string; days?: number },
) {
  const days = options?.days ?? DEFAULT_SESSION_DAYS;
  response.cookies.set(options?.cookieName ?? DEFAULT_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
}

export function clearSessionCookie(
  response: NextResponse,
  options?: { cookieName?: string },
) {
  response.cookies.set(options?.cookieName ?? DEFAULT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function resolveSessionUser(
  db: PlatformDatabaseAdapter,
  sessionId: string | undefined | null,
): Promise<PublicUser | null> {
  if (!sessionId) return null;
  const session = await db.getSessionById(sessionId);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await db.deleteSession(sessionId).catch(() => undefined);
    return null;
  }
  const user = await db.getUserById(session.user_id);
  if (!user) {
    await db.deleteSession(sessionId).catch(() => undefined);
    return null;
  }
  return toPublicUser(user);
}

export async function createSessionForUser(
  db: PlatformDatabaseAdapter,
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null },
  days = DEFAULT_SESSION_DAYS,
): Promise<string> {
  const created = await db.createSession({
    user_id: userId,
    expires_at: sessionExpiryIso(days),
    user_agent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  });
  return created.id;
}

export function clientMetaFromRequest(request: Request): {
  userAgent: string | null;
  ip: string | null;
} {
  const userAgent = request.headers.get("user-agent");
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return { userAgent, ip };
}

export async function requireSessionUser(
  db: PlatformDatabaseAdapter,
  sessionId: string | undefined | null,
): Promise<PublicUser> {
  const user = await resolveSessionUser(db, sessionId);
  if (!user) throw ShellError.unauthorized();
  return user;
}
