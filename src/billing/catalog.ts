import type { PlanSnapshot } from "@llanesleonardo/saas-platform";

/**
 * T-03 / T-04 — Product-owned plan catalog. Stripe Price IDs stay in env, never in chassis.
 */
export type ShellPlanDefinition = {
  id: string;
  name: string;
  /** Env var holding the Stripe Price ID for paid plans (omit for free). */
  stripePriceEnvKey?: string;
  /** Display amount hint for pricing page (not charged — Stripe is source of truth). */
  displayPrice?: string;
  features: Record<string, boolean>;
  quotas: Record<string, number>;
};

export type ShellPlanCatalog = {
  plans: ShellPlanDefinition[];
  defaultPlanId: string;
};

export function createPlanCatalog(
  plans: ShellPlanDefinition[],
  defaultPlanId?: string,
): ShellPlanCatalog {
  if (!plans.length) throw new Error("Plan catalog requires at least one plan");
  const def = defaultPlanId ?? plans[0].id;
  if (!plans.some((p) => p.id === def)) {
    throw new Error(`defaultPlanId ${def} not in catalog`);
  }
  return { plans, defaultPlanId: def };
}

export function getPlanDefinition(
  catalog: ShellPlanCatalog,
  planId: string | null | undefined,
): ShellPlanDefinition {
  return catalog.plans.find((p) => p.id === planId) ?? catalog.plans.find((p) => p.id === catalog.defaultPlanId)!;
}

export function toPlanSnapshot(plan: ShellPlanDefinition): PlanSnapshot {
  return {
    id: plan.id,
    features: { ...plan.features },
    quotas: { ...plan.quotas },
  };
}

/** Resolve plan id from a Stripe Price ID using env keys declared on the catalog. */
export function planIdFromStripePriceId(
  catalog: ShellPlanCatalog,
  priceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!priceId) return catalog.defaultPlanId;
  for (const plan of catalog.plans) {
    if (!plan.stripePriceEnvKey) continue;
    const configured = env[plan.stripePriceEnvKey]?.trim();
    if (configured && configured === priceId) return plan.id;
  }
  return catalog.defaultPlanId;
}

export function stripePriceIdForPlan(
  catalog: ShellPlanCatalog,
  planId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const plan = getPlanDefinition(catalog, planId);
  if (!plan.stripePriceEnvKey) return null;
  return env[plan.stripePriceEnvKey]?.trim() || null;
}

export function assertDistinctStripePriceEnvKeys(
  catalog: ShellPlanCatalog,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  for (const plan of catalog.plans) {
    if (!plan.stripePriceEnvKey) continue;
    const val = env[plan.stripePriceEnvKey]?.trim();
    if (!val) {
      errors.push(`${plan.stripePriceEnvKey} is required for plan "${plan.id}"`);
      continue;
    }
    const other = seen.get(val);
    if (other) {
      errors.push(
        `${plan.stripePriceEnvKey} and ${other} must be distinct Price IDs (both map to ${val})`,
      );
    } else {
      seen.set(val, plan.stripePriceEnvKey);
    }
  }
  return errors;
}

/** Demo catalog for ShellDemo — replace in real products. */
export const DEMO_PLAN_CATALOG = createPlanCatalog([
  {
    id: "free",
    name: "Free",
    displayPrice: "$0",
    features: { demo: true },
    quotas: { max_seats: 1 },
  },
  {
    id: "pro",
    name: "Pro",
    displayPrice: "$29/mo",
    stripePriceEnvKey: "STRIPE_PRICE_PRO",
    features: { demo: true, api: true },
    quotas: { max_seats: 5 },
  },
  {
    id: "business",
    name: "Business",
    displayPrice: "$99/mo",
    stripePriceEnvKey: "STRIPE_PRICE_BUSINESS",
    features: { demo: true, api: true, sso: true },
    quotas: { max_seats: 20 },
  },
]);
