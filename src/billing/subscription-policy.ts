/**
 * Generic entitlement policy for Stripe → workspace.plan (product injects plan ids).
 */

const DAY_SECONDS = 86_400;

export function getPastDueGraceDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BILLING_PAST_DUE_GRACE_DAYS?.trim();
  if (raw === undefined || raw === "") return 7;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 7;
  return n;
}

export function subscriptionStatusFromEvent(
  eventType: string,
  stripeStatus: string,
): string {
  if (eventType === "customer.subscription.deleted") return "canceled";
  return stripeStatus;
}

export type ResolveEntitledPlanInput = {
  status: string;
  catalogPlan: string;
  currentPlan: string | null | undefined;
  defaultPlanId: string;
  isPaidPlan: (plan: string | null | undefined) => boolean;
  pastDueAnchorUnix?: number | null;
  nowUnix?: number;
  graceDays?: number;
};

/**
 * Maps Stripe status → workspace plan string for entitlements.
 */
export function resolveEntitledPlan(input: ResolveEntitledPlanInput): string {
  const status = input.status;
  const graceDays = input.graceDays ?? getPastDueGraceDays();
  const now = input.nowUnix ?? Math.floor(Date.now() / 1000);
  const paidFallback = input.isPaidPlan(input.catalogPlan)
    ? input.catalogPlan
    : input.isPaidPlan(input.currentPlan)
      ? (input.currentPlan as string)
      : input.defaultPlanId;

  if (
    status === "canceled" ||
    status === "unpaid" ||
    status === "incomplete_expired" ||
    status === "paused"
  ) {
    return input.defaultPlanId;
  }

  if (status === "active" || status === "trialing") {
    return input.isPaidPlan(input.catalogPlan) ? input.catalogPlan : input.defaultPlanId;
  }

  if (status === "past_due") {
    if (graceDays <= 0) return input.defaultPlanId;
    const anchor = input.pastDueAnchorUnix;
    if (typeof anchor !== "number" || !Number.isFinite(anchor) || anchor <= 0) {
      return input.defaultPlanId;
    }
    if (now >= anchor + graceDays * DAY_SECONDS) return input.defaultPlanId;
    return paidFallback;
  }

  return input.defaultPlanId;
}
