import { NextResponse } from "next/server";
import type { PlatformDatabaseAdapter } from "@llanesleonardo/saas-platform";
import { jsonError, parseJsonBody, ShellError } from "../errors";
import { requireSessionUser, type AuthRouteDeps } from "../auth/index";
import { getActiveWorkspaceId, requireWorkspaceAccess } from "../tenancy/index";
import {
  type ShellPlanCatalog,
  stripePriceIdForPlan,
} from "./catalog";

export type StripeLike = {
  customers: {
    create: (params: {
      email: string;
      metadata?: Record<string, string>;
    }) => Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create: (params: Record<string, unknown>) => Promise<{ url: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create: (params: {
        customer: string;
        return_url: string;
      }) => Promise<{ url: string }>;
    };
  };
};

export type BillingRouteDeps = AuthRouteDeps & {
  catalog: ShellPlanCatalog;
  getStripe: () => StripeLike;
  isStripeConfigured: () => boolean;
  appUrl: () => string;
  getWorkspaceCookieId?: (request: Request) => string | undefined | null;
  /** Paid plan ids allowed for checkout (default: all with stripePriceEnvKey). */
  checkoutPlanIds?: string[];
  /** Override session resolution (Clerk + cookie). */
  resolveUser?: (
    request: Request,
  ) => Promise<Awaited<ReturnType<typeof requireSessionUser>> | null>;
  successPath?: string;
  cancelPath?: string;
  portalReturnPath?: string;
  /**
   * Enrich Stripe Checkout Session after plan/workspace are resolved
   * (referrals, coupons, extra metadata).
   */
  prepareCheckout?: (ctx: {
    request: Request;
    body: Record<string, unknown>;
    user: Awaited<ReturnType<typeof requireSessionUser>>;
    workspaceId: string;
    planId: string;
  }) => Promise<{
    metadata?: Record<string, string>;
    subscriptionMetadata?: Record<string, string>;
    discounts?: Array<{ coupon: string }>;
    allowPromotionCodes?: boolean;
  } | void>;
};

function workspaceCookie(deps: BillingRouteDeps, request: Request) {
  return deps.getWorkspaceCookieId?.(request) ?? null;
}

/**
 * T-04 — Create Stripe Checkout Session for a paid plan (product supplies Stripe client).
 */
export function createCheckoutHandler(deps: BillingRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!deps.isStripeConfigured()) {
        throw ShellError.validation("Stripe is not configured", ["STRIPE_SECRET_KEY"]);
      }
      const db = deps.getDb();
      const user = deps.resolveUser
        ? await deps.resolveUser(request).then((u) => {
            if (!u) throw ShellError.unauthorized("Sign in required.");
            return u;
          })
        : await requireSessionUser(db, deps.getSessionId(request));
      const body = await parseJsonBody<Record<string, unknown>>(request);
      const paidIds =
        deps.checkoutPlanIds ??
        deps.catalog.plans.filter((p) => p.stripePriceEnvKey).map((p) => p.id);
      const planRaw = typeof body.plan === "string" ? body.plan : undefined;
      const planId = planRaw && paidIds.includes(planRaw) ? planRaw : paidIds[0];
      if (!planId) throw ShellError.validation("No paid plans configured", ["plan"]);

      const priceId = stripePriceIdForPlan(deps.catalog, planId);
      if (!priceId) {
        throw ShellError.validation(`Missing Stripe price for ${planId}`, ["price"]);
      }

      const workspaceId = await getActiveWorkspaceId(
        db,
        user.id,
        workspaceCookie(deps, request),
      );
      if (!workspaceId) {
        throw ShellError.validation("Create a workspace first", ["NO_WORKSPACE"]);
      }
      await requireWorkspaceAccess(db, user.id, workspaceId, "owner");

      const workspace = await db.getWorkspaceById(workspaceId);
      if (!workspace) throw ShellError.notFound("Workspace");

      const extras = await deps.prepareCheckout?.({
        request,
        body,
        user,
        workspaceId,
        planId,
      });

      const stripe = deps.getStripe();
      let customerId = workspace.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { workspaceId },
        });
        customerId = customer.id;
        await db.updateWorkspaceBilling(workspaceId, { stripe_customer_id: customerId });
      }

      const appUrl = deps.appUrl();
      const successPath = deps.successPath ?? "/pricing";
      const cancelPath = deps.cancelPath ?? "/pricing";
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}${successPath}?checkout=success`,
        cancel_url: `${appUrl}${cancelPath}?checkout=cancel`,
        metadata: {
          workspaceId,
          plan: planId,
          ...(extras?.metadata ?? {}),
        },
        subscription_data: {
          metadata: {
            workspaceId,
            plan: planId,
            ...(extras?.subscriptionMetadata ?? {}),
          },
        },
        ...(extras?.discounts
          ? { discounts: extras.discounts }
          : extras?.allowPromotionCodes === false
            ? {}
            : { allow_promotion_codes: extras?.allowPromotionCodes ?? true }),
      });

      return NextResponse.json({ url: session.url });
    } catch (err) {
      return jsonError(err);
    }
  };
}

/**
 * T-04 — Stripe Customer Portal session.
 */
export function createBillingPortalHandler(deps: BillingRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!deps.isStripeConfigured()) {
        throw ShellError.validation("Stripe is not configured", ["STRIPE_SECRET_KEY"]);
      }
      const db = deps.getDb();
      const user = deps.resolveUser
        ? await deps.resolveUser(request).then((u) => {
            if (!u) throw ShellError.unauthorized("Sign in required.");
            return u;
          })
        : await requireSessionUser(db, deps.getSessionId(request));
      const workspaceId = await getActiveWorkspaceId(
        db,
        user.id,
        workspaceCookie(deps, request),
      );
      if (!workspaceId) {
        throw ShellError.validation("Create a workspace first", ["NO_WORKSPACE"]);
      }
      await requireWorkspaceAccess(db, user.id, workspaceId, "owner");
      const workspace = await db.getWorkspaceById(workspaceId);
      if (!workspace?.stripe_customer_id) {
        throw ShellError.validation("No Stripe customer for this workspace", ["customer"]);
      }
      const returnPath = deps.portalReturnPath ?? "/pricing";
      const portal = await deps.getStripe().billingPortal.sessions.create({
        customer: workspace.stripe_customer_id,
        return_url: `${deps.appUrl()}${returnPath}`,
      });
      return NextResponse.json({ url: portal.url });
    } catch (err) {
      return jsonError(err);
    }
  };
}

export type { PlatformDatabaseAdapter };
