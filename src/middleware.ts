/**
 * Edge/middleware-safe exports — no route factories, sqlite, or Stripe.
 */
export {
  DEFAULT_SESSION_COOKIE,
  DEFAULT_WORKSPACE_COOKIE,
  DEFAULT_SESSION_DAYS,
  isShellPublicPath,
} from "./cookies";

export {
  createShellProxy,
  type ShellProxyOptions,
  type ShellWorkspaceGateOptions,
  type ShellFirstAdminGateOptions,
} from "./proxy";
