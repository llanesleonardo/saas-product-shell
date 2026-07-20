import type { PlatformDatabaseAdapter } from "@llanesleonardo/saas-platform";
import {
  resolveEntitledPlan,
  subscriptionStatusFromEvent,
} from "./subscription-policy";

/** Minimal Stripe shapes used by sync (avoid hard dep on stripe types at compile). */
export type StripeSubscriptionLike = {
  id: string;
  status: string;
  customer: string | { id: string } | null;
  metadata?: Record<string, string> | null;
  items?: { data: Array<{ price?: { id?: string } | null }> };
  latest_invoice?: string | { created?: number } | null;
};

export type StripeInvoiceLike = {
  id?: string;
  created: number;
  parent?: {
    subscription_details?: {
      subscription?: string | { id: string } | null;
    } | null;
  } | null;
};

export type StripeClientLike = {
  subscriptions: {
    retrieve: (id: string) => Promise<StripeSubscriptionLike>;
  };
  invoices: {
    retrieve: (id: string) => Promise<{ created: number }>;
  };
};

function workspaceIdFromMetadata(
  metadata: Record<string, string> | null | undefined,
): string | null {
  if (!metadata) return null;
  if (metadata.workspaceId) return metadata.workspaceId;
  if (metadata.workspace_id) return metadata.workspace_id;
  return null;
}

export function subscriptionIdFromInvoice(invoice: StripeInvoiceLike): string | null {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const sub = details.subscription;
  if (typeof sub === "string" && sub) return sub;
  if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  return null;
}

async function pastDueAnchorUnix(
  stripe: StripeClientLike,
  sub: StripeSubscriptionLike,
): Promise<number | null> {
  const latest = sub.latest_invoice;
  if (latest && typeof latest === "object" && typeof latest.created === "number") {
    return latest.created;
  }
  if (typeof latest === "string" && latest) {
    try {
      const invoice = await stripe.invoices.retrieve(latest);
      return invoice.created;
    } catch {
      return null;
    }
  }
  return null;
}

export type SyncSubscriptionDeps = {
  db: PlatformDatabaseAdapter;
  stripe: StripeClientLike;
  planFromPriceId: (priceId: string | null | undefined) => string;
  isPaidPlan: (plan: string | null | undefined) => boolean;
  defaultPlanId?: string;
  onSynced?: (info: {
    workspaceId: string;
    plan: string;
    status: string;
    eventType: string;
  }) => void;
};

export async function syncWorkspaceFromSubscription(
  deps: SyncSubscriptionDeps,
  opts: {
    sub: StripeSubscriptionLike;
    eventType: string;
    pastDueAnchorUnix?: number | null;
  },
): Promise<void> {
  const defaultPlanId = deps.defaultPlanId ?? "free";
  const workspaceId = workspaceIdFromMetadata(opts.sub.metadata ?? null);
  if (!workspaceId) return;

  const workspace = await deps.db.getWorkspaceById(workspaceId);
  if (!workspace) return;

  const status = subscriptionStatusFromEvent(opts.eventType, opts.sub.status);
  const priceId = opts.sub.items?.data?.[0]?.price?.id;
  const catalogPlan = deps.planFromPriceId(priceId);
  const anchor =
    opts.pastDueAnchorUnix !== undefined
      ? opts.pastDueAnchorUnix
      : status === "past_due"
        ? await pastDueAnchorUnix(deps.stripe, opts.sub)
        : null;

  const nextPlan = resolveEntitledPlan({
    status,
    catalogPlan,
    currentPlan: workspace.plan,
    defaultPlanId,
    isPaidPlan: deps.isPaidPlan,
    pastDueAnchorUnix: anchor,
  });

  const customerId =
    typeof opts.sub.customer === "string"
      ? opts.sub.customer
      : opts.sub.customer && typeof opts.sub.customer === "object"
        ? opts.sub.customer.id
        : null;

  await deps.db.updateWorkspaceBilling(workspaceId, {
    plan: nextPlan,
    stripe_customer_id: customerId,
    stripe_subscription_id: opts.sub.id,
    subscription_status: status,
  });

  deps.onSynced?.({
    workspaceId,
    plan: nextPlan,
    status,
    eventType: opts.eventType,
  });
}

export async function syncWorkspaceFromInvoice(
  deps: SyncSubscriptionDeps,
  opts: { invoice: StripeInvoiceLike; eventType: string },
): Promise<void> {
  const subscriptionId = subscriptionIdFromInvoice(opts.invoice);
  if (!subscriptionId) return;
  const sub = await deps.stripe.subscriptions.retrieve(subscriptionId);
  const anchor =
    opts.eventType === "invoice.payment_failed" ? opts.invoice.created : undefined;
  await syncWorkspaceFromSubscription(deps, {
    sub,
    eventType: "customer.subscription.updated",
    pastDueAnchorUnix: anchor,
  });
}
