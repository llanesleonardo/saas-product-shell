import { NextResponse } from "next/server";
import type { PlatformDatabaseAdapter } from "@llanesleonardo/saas-platform";
import { jsonError, parseJsonBody, ShellError } from "../errors";
import { requireSessionUser, type AuthRouteDeps } from "../auth/index";
import {
  applyWorkspaceCookie,
  requireWorkspaceAccess,
  slugifyWorkspaceName,
  workspaceCookieName,
} from "./workspace";

export type TenancyRouteDeps = AuthRouteDeps & {
  getWorkspaceId?: (request: Request) => string | undefined | null;
  /**
   * When true (or DEPLOYMENT_MODE=selfhosted), allow many owned workspaces
   * via createWorkspace. SaaS keeps createOwnedWorkspaceIfAllowed cap.
   */
  allowMultipleOwnedWorkspaces?: boolean;
  /**
   * Product hook after create (e.g. claim orphan tenant rows on first
   * selfhosted workspace). Domain-specific — not implemented in shell.
   */
  onWorkspaceCreated?: (info: {
    workspaceId: string;
    userId: string;
    isFirstForUser: boolean;
  }) => void | Promise<void>;
};

function allowMultiOwned(deps: TenancyRouteDeps): boolean {
  if (deps.allowMultipleOwnedWorkspaces === true) return true;
  if (deps.allowMultipleOwnedWorkspaces === false) return false;
  return (process.env.DEPLOYMENT_MODE ?? "").trim().toLowerCase() === "selfhosted";
}

export function createListWorkspacesHandler(deps: TenancyRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await requireSessionUser(db, deps.getSessionId(request));
      const workspaces = await db.listWorkspacesForUser(user.id);
      return NextResponse.json({ workspaces });
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createCreateWorkspaceHandler(deps: TenancyRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await requireSessionUser(db, deps.getSessionId(request));
      const body = await parseJsonBody<{ name?: string; slug?: string }>(request);
      const name = body.name?.trim();
      if (!name) throw ShellError.validation("Workspace name is required", ["name"]);

      let slug = (body.slug?.trim() || slugifyWorkspaceName(name)).toLowerCase();
      slug = slugifyWorkspaceName(slug);
      const existing = await db.getWorkspaceBySlug(slug);
      if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      const before = await db.listWorkspacesForUser(user.id);
      const input = {
        name,
        slug,
        owner_user_id: user.id,
      };
      const result = allowMultiOwned(deps)
        ? await db.createWorkspace(input)
        : await db.createOwnedWorkspaceIfAllowed(input);

      if (deps.onWorkspaceCreated) {
        await deps.onWorkspaceCreated({
          workspaceId: result.id,
          userId: user.id,
          isFirstForUser: before.length === 0,
        });
      }

      const workspace = await db.getWorkspaceById(result.id);
      const response = NextResponse.json({ id: result.id, workspace }, { status: 201 });
      applyWorkspaceCookie(response, result.id, workspaceCookieName());
      return response;
    } catch (err) {
      if (err instanceof Error && err.message === "OWNED_WORKSPACE_CAP") {
        return jsonError(
          ShellError.validation("Owned workspace cap reached", ["OWNED_WORKSPACE_CAP"]),
        );
      }
      return jsonError(err);
    }
  };
}

export function createSwitchWorkspaceHandler(deps: TenancyRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await requireSessionUser(db, deps.getSessionId(request));
      const body = await parseJsonBody<{ workspaceId?: string }>(request);
      if (!body.workspaceId) {
        throw ShellError.validation("workspaceId is required", ["workspaceId"]);
      }
      await requireWorkspaceAccess(db, user.id, body.workspaceId, "viewer");
      const response = NextResponse.json({
        success: true,
        workspaceId: body.workspaceId,
      });
      applyWorkspaceCookie(response, body.workspaceId, workspaceCookieName());
      return response;
    } catch (err) {
      return jsonError(err);
    }
  };
}

export type { PlatformDatabaseAdapter };
