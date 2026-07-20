# Dual-mode tenancy (saas + selfhosted)

**Kit note for every product on `@llanesleonardo/saas-product-shell`.**  
PeopleForms proved this pattern; scaffold templates and shell helpers should match it — **domain-agnostic**.

## Rule

After login, **every authenticated user must belong to ≥1 workspace** before using product surfaces — in **both** `DEPLOYMENT_MODE=saas` and `DEPLOYMENT_MODE=selfhosted`.

| Mode | Workspaces mean | Owned-workspace create |
|------|-----------------|-------------------------|
| **saas** | Tenant / customer org | Cap via `createOwnedWorkspaceIfAllowed` (usually 1 owned; join via invite) |
| **selfhosted** | Departments (Marketing, Sales, CEO Office, …) | **Unlimited** owned via `createWorkspace` |

Do **not** short-circuit `getActiveWorkspaceId` / `requireActiveWorkspace` when selfhosted. Unscoped (`null` / `""`) tenants are a legacy smell.

## First admin (local auth)

One super admin bootstrap — **standard for any domain**:

| Surface | Behavior |
|---------|----------|
| Copy | **Log In** (heading + button), not “Sign in” |
| Create admin | Shown on `/login` only when `needsSetup` (`countUsers() === 0`) |
| `/setup` | Public only until first user exists; then redirect → `/login` |
| Setup API | Blocked after first user (`SETUP_ALREADY_DONE` / proxy gate) |

Shell helpers:

- `createShellProxy({ requireFirstAdmin: { getDb } })` — empty install → `/setup`; close setup after first admin
- `createSetupStatusHandler` → `GET` `{ needsSetup: boolean }`
- `createSetupHandler` — already rejects when users exist

## Required product surfaces

1. **`/onboarding`** — create first workspace (required).
2. **Proxy / middleware gate** — after session is valid, if `listWorkspacesForUser` is empty → redirect `/onboarding` (API → `400` + `NO_WORKSPACE`).
3. **Exempt paths** — `/onboarding`, `/api/workspaces`, `/api/auth/*`, `/account`, `/invite/*`, marketing/legal.
4. **Switcher** — show in both modes (sidebar footer via `AppShellNav`).
5. **Nav (both modes)** — Members, API keys, Domains, Billing; Product section = placeholders until domain known. See [APP-SHELL-LAYOUT.md](./APP-SHELL-LAYOUT.md).

## Shell helpers

- `createShellProxy({ requireFirstAdmin, requireWorkspace })` — see `src/proxy.ts`.
- `createCreateWorkspaceHandler` — when `DEPLOYMENT_MODE=selfhosted` (or `allowMultipleOwnedWorkspaces: true`), uses `createWorkspace` instead of the owned cap.
- `onWorkspaceCreated` — product hook (e.g. claim orphan domain rows on first selfhosted workspace). Shell does not claim product tables.
- `requireActiveWorkspace` — throws `NO_WORKSPACE` when none; UI must onboarding, not “edit current”.

## Selfhosted billing (product UI)

Selfhosted **Billing** is not in-app Stripe Checkout:

| Show | Hide |
|------|------|
| Banner: self-hosted install | Checkout / portal buttons |
| Feature matrix (from plan catalog) | Referrals (optional) |
| Current plan + usage (incl. seats / devices when product tracks them) | |
| Invoices (when `stripe_customer_id` linked) | |

Payment links are **sent manually**; after Stripe customer is attached to the workspace, invoices list via Stripe API.

Scaffold: `create-saas` ships `/billing` + `GET /api/billing` (+ invoices) with this split.

## Acceptance checklist

- [ ] Empty install forces `/setup`; after first admin, `/setup` → `/login` and no “Create admin” on login
- [ ] Login copy is **Log In**
- [ ] Signed-in user with 0 workspaces cannot open product pages
- [ ] First create sets workspace cookie
- [ ] Selfhosted can create Marketing / Sales / … as separate owned workspaces
- [ ] SaaS still respects owned-workspace cap
- [ ] Both modes show Members / API keys / Domains / Billing nav
- [ ] Selfhosted billing page has matrix + invoices, no checkout
