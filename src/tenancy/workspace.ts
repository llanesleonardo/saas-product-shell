import type { NextResponse } from "next/server";
import type { PlatformDatabaseAdapter, WorkspaceRole } from "@llanesleonardo/saas-platform";
import { getPlatformConfig } from "@llanesleonardo/saas-platform";
import { ShellError } from "../errors";
import { DEFAULT_WORKSPACE_COOKIE } from "../cookies";

export { DEFAULT_WORKSPACE_COOKIE };

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function workspaceCookieName(): string {
  return getPlatformConfig().workspaceCookieName ?? DEFAULT_WORKSPACE_COOKIE;
}

export function slugifyWorkspaceName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

export function applyWorkspaceCookie(
  response: NextResponse,
  workspaceId: string,
  cookieName = workspaceCookieName(),
) {
  response.cookies.set(cookieName, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function clearWorkspaceCookie(
  response: NextResponse,
  cookieName = workspaceCookieName(),
) {
  response.cookies.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function requireWorkspaceAccess(
  db: PlatformDatabaseAdapter,
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole = "viewer",
): Promise<void> {
  const membership = await db.getWorkspaceMembership(workspaceId, userId);
  if (!membership) throw ShellError.forbidden("Not a member of this workspace.");
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw ShellError.forbidden("Insufficient workspace role.");
  }
}

export async function getActiveWorkspaceId(
  db: PlatformDatabaseAdapter,
  userId: string,
  cookieWorkspaceId: string | undefined | null,
): Promise<string | null> {
  if (cookieWorkspaceId) {
    const membership = await db.getWorkspaceMembership(cookieWorkspaceId, userId);
    if (membership) return cookieWorkspaceId;
  }
  const workspaces = await db.listWorkspacesForUser(userId);
  return workspaces[0]?.id ?? null;
}

export async function requireActiveWorkspace(
  db: PlatformDatabaseAdapter,
  userId: string,
  cookieWorkspaceId: string | undefined | null,
  minRole: WorkspaceRole = "viewer",
): Promise<string> {
  const workspaceId = await getActiveWorkspaceId(db, userId, cookieWorkspaceId);
  if (!workspaceId) {
    throw ShellError.validation("Create a workspace first", ["NO_WORKSPACE"]);
  }
  await requireWorkspaceAccess(db, userId, workspaceId, minRole);
  return workspaceId;
}
