import { jsonError } from "../errors";
import type { PlatformDatabaseAdapter } from "@llanesleonardo/saas-platform";
import {
  syncWorkspaceFromInvoice,
  syncWorkspaceFromSubscription,
  type StripeClientLike,
  type StripeInvoiceLike,
  type StripeSubscriptionLike,
} from "./sync-workspace";

export type StripeWebhookStripe = StripeClientLike & {
  webhooks: {
    constructEvent: (
      payload: string | Buffer,
      signature: string,
      secret: string,
    ) => { type: string; data: { object: unknown } };
  };
};

export type WebhookHandlerDeps = {
  getDb: () => PlatformDatabaseAdapter;
  getStripe: () => StripeWebhookStripe;
  isStripeConfigured: () => boolean;
  planFromPriceId: (priceId: string | null | undefined) => string;
  isPaidPlan: (plan: string | null | undefined) => boolean;
  defaultPlanId?: string;
  webhookSecret?: () => string | undefined;
  allowUnsigned?: () => boolean;
  onSynced?: SyncParams["onSynced"];
  /** Override default sync implementations (product emails / grace policy). */
  syncSubscription?: typeof syncWorkspaceFromSubscription;
  syncInvoice?: typeof syncWorkspaceFromInvoice;
  /** Product hook after checkout.session.completed (referrals, etc.). */
  onCheckoutSessionCompleted?: (ctx: {
    session: {
      id: string;
      metadata?: Record<string, string> | null;
      subscription?: string | { id: string } | null;
    };
    workspaceId: string | null;
    db: PlatformDatabaseAdapter;
    stripe: StripeWebhookStripe;
  }) => void | Promise<void>;
};

type SyncParams = Parameters<typeof syncWorkspaceFromSubscription>[0];

/**
 * T-04 — Stripe webhook: verify → sync workspace billing (no product emails/referrals).
 */
export function createStripeWebhookHandler(deps: WebhookHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!deps.isStripeConfigured()) {
        return Response.json({ error: "Stripe not configured" }, { status: 501 });
      }

      const stripe = deps.getStripe();
      const secret = deps.webhookSecret?.() ?? process.env.STRIPE_WEBHOOK_SECRET?.trim();
      const rawBody = await request.text();
      let event: { type: string; data: { object: unknown } };

      const allowUnsigned =
        deps.allowUnsigned?.() ?? process.env.STRIPE_ALLOW_UNSIGNED_WEBHOOK === "1";

      if (secret) {
        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return Response.json({ error: "Missing signature" }, { status: 400 });
        }
        event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      } else if (allowUnsigned) {
        event = JSON.parse(rawBody) as { type: string; data: { object: unknown } };
      } else {
        return Response.json(
          { error: "Stripe webhook secret not configured", code: "STRIPE_WEBHOOK_SECRET" },
          { status: 501 },
        );
      }

      const syncSub = deps.syncSubscription ?? syncWorkspaceFromSubscription;
      const syncInv = deps.syncInvoice ?? syncWorkspaceFromInvoice;

      const syncDeps = {
        db: deps.getDb(),
        stripe,
        planFromPriceId: deps.planFromPriceId,
        isPaidPlan: deps.isPaidPlan,
        defaultPlanId: deps.defaultPlanId ?? "free",
        onSynced: deps.onSynced,
      };

      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        await syncSub(syncDeps, {
          sub: event.data.object as StripeSubscriptionLike,
          eventType: event.type,
        });
      }

      if (
        event.type === "invoice.paid" ||
        event.type === "invoice.payment_failed" ||
        event.type === "invoice.payment_action_required"
      ) {
        await syncInv(syncDeps, {
          invoice: event.data.object as StripeInvoiceLike,
          eventType: event.type,
        });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as {
          id: string;
          metadata?: Record<string, string>;
          subscription?: string | { id: string } | null;
        };
        const subRef = session.subscription;
        const subscriptionId =
          typeof subRef === "string" ? subRef : subRef && typeof subRef === "object" ? subRef.id : null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          if (!sub.metadata?.workspaceId && session.metadata?.workspaceId) {
            sub.metadata = {
              ...(sub.metadata ?? {}),
              workspaceId: session.metadata.workspaceId,
            };
          }
          await syncSub(syncDeps, {
            sub,
            eventType: event.type,
          });
        }
        await deps.onCheckoutSessionCompleted?.({
          session,
          workspaceId: session.metadata?.workspaceId ?? null,
          db: deps.getDb(),
          stripe,
        });
      }

      return Response.json({ received: true });
    } catch (err) {
      return jsonError(err);
    }
  };
}
