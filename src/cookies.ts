/** Cookie names + public path helpers — safe for Next proxy/middleware. */

export const DEFAULT_SESSION_COOKIE = "shell_session";
export const DEFAULT_WORKSPACE_COOKIE = "shell_workspace";
export const DEFAULT_SESSION_DAYS = 14;

export function isShellPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/setup") return true;
  if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) return true;
  if (pathname === "/sign-up" || pathname.startsWith("/sign-up/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/health" || pathname === "/api/ready") return true;
  if (pathname === "/api/stripe/webhook") return true;
  return false;
}
