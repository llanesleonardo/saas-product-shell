/**
 * Smoke: composition + memory/sqlite auth + workspace + billing catalog.
 */
import { createShellRegistration } from "./composition/index";
import { createShellDb, resetShellDbForTests } from "./db/index";
import { hashPassword, verifyPassword } from "./auth/index";
import { slugifyWorkspaceName } from "./tenancy/index";
import {
  DEMO_PLAN_CATALOG,
  toPlanSnapshot,
  planIdFromStripePriceId,
  resolveEntitledPlan,
} from "./billing/index";
import { isClerkConfigured } from "./auth/index";

async function run(provider: "memory" | "sqlite") {
  resetShellDbForTests();
  const { ensureRegistered, linkedPlatformVersion } = createShellRegistration({
    productName: "ShellSmoke",
    apiKeyPrefix: "smoke_",
    workspaceCookieName: "shell_workspace",
    scopes: ["demo:read"],
    features: ["demo"],
    quotas: ["max_seats"],
    metrics: ["actions"],
  });
  ensureRegistered();

  const db = createShellDb({
    provider,
    sqlitePath:
      provider === "sqlite" ? `data/smoke-${Date.now()}.db` : undefined,
    maxOwnedWorkspacesPerUser: 3,
  });

  const hash = hashPassword("password123");
  if (!verifyPassword("password123", hash)) throw new Error("password verify failed");

  const user = await db.createUser({
    email: "smoke@example.com",
    password_hash: hash,
    role: "admin",
  });
  const session = await db.createSession({
    user_id: user.id,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  if (!(await db.getSessionById(session.id))) throw new Error("session missing");

  const slug = slugifyWorkspaceName("Acme Demo");
  const ws = await db.createOwnedWorkspaceIfAllowed({
    name: "Acme Demo",
    slug,
    owner_user_id: user.id,
  });
  const list = await db.listWorkspacesForUser(user.id);
  if (!list.some((w) => w.id === ws.id)) throw new Error("workspace list failed");

  const snap = toPlanSnapshot(DEMO_PLAN_CATALOG.plans[1]);
  if (!snap.features.api) throw new Error("plan snapshot missing feature");
  if (planIdFromStripePriceId(DEMO_PLAN_CATALOG, undefined) !== "free") {
    throw new Error("default plan expected free");
  }

  const entitled = resolveEntitledPlan({
    status: "active",
    catalogPlan: "pro",
    currentPlan: "free",
    defaultPlanId: "free",
    isPaidPlan: (p) => p === "pro" || p === "business",
  });
  if (entitled !== "pro") throw new Error("entitlement policy failed");
  void isClerkConfigured(); // callable without throwing

  console.log(`OK ${provider} platform=${linkedPlatformVersion} user=${user.id} ws=${ws.id}`);
}

await run("memory");
await run("sqlite");
console.log("saas-product-shell smoke passed");
