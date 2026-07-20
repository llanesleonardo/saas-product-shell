import { NextResponse } from "next/server";
import { jsonError, parseJsonBody, ShellError } from "../errors";
import {
  clearSessionCookie,
  requireSessionUser,
  verifyPassword,
  type AuthRouteDeps,
} from "../auth/index";
import { clearWorkspaceCookie, workspaceCookieName } from "../tenancy/index";

/** T-05 — change password (alias of auth password handler for account surface). */
export { createPasswordChangeHandler as createAccountPasswordHandler } from "../auth/index";

export function createAccountDeleteHandler(deps: AuthRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await requireSessionUser(db, deps.getSessionId(request));
      const body = await parseJsonBody<{ confirm?: string; password?: string }>(request);
      if (body.confirm !== "DELETE") {
        throw ShellError.validation('Type DELETE to confirm', ["confirm"]);
      }
      const full = await db.getUserById(user.id);
      if (!full) throw ShellError.notFound("User");
      if (full.password_hash && full.password_hash !== "!") {
        if (!body.password || !verifyPassword(body.password, full.password_hash)) {
          throw ShellError.unauthorized("Password required to delete account.");
        }
      }

      const workspaces = await db.listWorkspacesForUser(user.id);
      for (const ws of workspaces) {
        const membership = await db.getWorkspaceMembership(ws.id, user.id);
        if (membership?.role === "owner") {
          const owners = await db.countWorkspaceOwners(ws.id);
          if (owners <= 1) {
            const members = await db.countWorkspaceMembers(ws.id);
            if (members > 1) {
              throw ShellError.validation(
                `Transfer ownership of workspace "${ws.name}" before deleting your account.`,
                ["workspace"],
              );
            }
            await db.deleteWorkspace(ws.id);
          } else {
            await db.removeWorkspaceMember(ws.id, user.id);
          }
        } else if (membership) {
          await db.removeWorkspaceMember(ws.id, user.id);
        }
      }

      await db.deleteSessionsForUser(user.id);
      await db.deleteUser(user.id);

      const response = NextResponse.json({ ok: true });
      clearSessionCookie(response, { cookieName: deps.sessionCookieName });
      clearWorkspaceCookie(response, workspaceCookieName());
      return response;
    } catch (err) {
      return jsonError(err);
    }
  };
}
