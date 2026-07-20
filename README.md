# @llanesleonardo/saas-product-shell

Product-shell kits on [`@llanesleonardo/saas-platform@0.3.0`](https://github.com/llanesleonardo/saas-platform).

**Source of truth:** this repository (not PeopleForms / FormBuilder).

```bash
# .npmrc
@llanesleonardo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

npm install @llanesleonardo/saas-platform@0.3.0 @llanesleonardo/saas-product-shell@0.2.5
```

## Import paths (important)

| Import | Use for |
|--------|---------|
| `@llanesleonardo/saas-product-shell/ui` | **App chrome** — `AppShellNav`, theme, workspace switcher (client) |
| `@llanesleonardo/saas-product-shell/ui/tokens.css` | Default light/dark CSS variables |
| `@llanesleonardo/saas-product-shell/billing/catalog` | Plan catalog helpers in **any** bundle (browser-safe; no `pg`) |
| `@llanesleonardo/saas-product-shell/billing` | Checkout / portal / webhook **API routes** (server) |
| `@llanesleonardo/saas-product-shell/tenancy` | Workspace cookie + create/list/switch handlers |
| `@llanesleonardo/saas-product-shell` (root) | Prefer **server-only**; root re-exports `./db` (pulls `pg`) |

**Do not** import the package root from a Client Component — Next will try to bundle Postgres/`dns` and fail.

## Tenancy

- `createCreateWorkspaceHandler` — first workspace (onboarding) and additional creates.
  - **saas:** owned-workspace cap via `createOwnedWorkspaceIfAllowed`
  - **selfhosted** (`DEPLOYMENT_MODE=selfhosted` or `allowMultipleOwnedWorkspaces: true`): unlimited owned via `createWorkspace` (departments)
  - optional `onWorkspaceCreated` — product hook (claim orphan domain data, etc.)
- `requireActiveWorkspace` throws `NO_WORKSPACE` when the user has none — product UI should send them to onboarding / create, not to “edit current workspace”.
- `createShellProxy({ requireFirstAdmin, requireWorkspace })` — **standard gates**: one super admin, then workspace required after login (both modes). See [docs/DUAL-MODE-TENANCY.md](./docs/DUAL-MODE-TENANCY.md).
- Switcher / settings that call update/delete need an existing membership; create via `POST` create handler first.

## Dual-mode (saas + selfhosted)

Read **[docs/DUAL-MODE-TENANCY.md](./docs/DUAL-MODE-TENANCY.md)** — first admin / Log In, workspace required after login, selfhosted billing (matrix + invoices, no checkout), department workspaces, Members/API keys/Domains/Billing nav.

## Publish (CI)

1. GitHub repo → **Settings → Secrets and variables → Actions** → `NODE_AUTH_TOKEN` (PAT with **read:packages** + **write:packages**)
2. Bump `version` in `package.json` (must match the tag).
3. Commit, then:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

`GITHUB_TOKEN` alone is not enough for Install — it cannot read `@llanesleonardo/saas-platform` by default.

## App chrome (default layout)

Every product gets the same sidebar by default via `@llanesleonardo/saas-product-shell/ui`:

| Section | Contents |
|---------|----------|
| **Product** | Placeholder links (`/product/*`) — replace with your domain |
| **Workspace** | Workspace, Members, API keys, Domains, Billing |
| **Account** | Account, Security, Jobs |

Also: **Theme** (light / dark / system) + **Workspace** switcher in the sidebar footer.

See [docs/APP-SHELL-LAYOUT.md](./docs/APP-SHELL-LAYOUT.md).

## Changelog

### 0.2.5
- `./ui` — `AppShellNav`, `ThemeProvider` / `ThemeToggle`, `WorkspaceSwitcher`, default nav sections
- `./ui/tokens.css` — light/dark CSS variables
- Docs: [APP-SHELL-LAYOUT.md](./docs/APP-SHELL-LAYOUT.md)

### 0.2.4
- `createShellProxy({ requireFirstAdmin })` — empty install → `/setup`; close setup after first admin
- `createSetupStatusHandler` — `{ needsSetup }`
- `onWorkspaceCreated` on create-workspace handler (product claim-orphan hook)
- Auth API copy: **Log in required.**
- Docs: first-admin + Log In + nav standards in [DUAL-MODE-TENANCY.md](./docs/DUAL-MODE-TENANCY.md)

### 0.2.3
- Dual-mode tenancy kit: [docs/DUAL-MODE-TENANCY.md](./docs/DUAL-MODE-TENANCY.md)
- `createShellProxy({ requireWorkspace })` — redirect/API `NO_WORKSPACE` until first workspace
- `createCreateWorkspaceHandler` — selfhosted uses unlimited `createWorkspace`

### 0.2.2
- Export `./billing/catalog` (client-safe plan helpers) and `./errors`
- Re-export `ShellError` from `./billing`
- Docs: avoid root import in Client Components; tenancy `NO_WORKSPACE` guidance
