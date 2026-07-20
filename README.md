# @llanesleonardo/saas-product-shell

Product-shell kits on [`@llanesleonardo/saas-platform@0.3.0`](https://github.com/llanesleonardo/saas-platform).

**Source of truth:** this repository (not PeopleForms / FormBuilder).

```bash
# .npmrc
@llanesleonardo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

npm install @llanesleonardo/saas-platform@0.3.0 @llanesleonardo/saas-product-shell@0.2.2
```

## Import paths (important)

| Import | Use for |
|--------|---------|
| `@llanesleonardo/saas-product-shell/billing/catalog` | Plan catalog helpers in **any** bundle (browser-safe; no `pg`) |
| `@llanesleonardo/saas-product-shell/billing` | Checkout / portal / webhook **API routes** (server) |
| `@llanesleonardo/saas-product-shell/tenancy` | Workspace cookie + create/list/switch handlers |
| `@llanesleonardo/saas-product-shell` (root) | Prefer **server-only**; root re-exports `./db` (pulls `pg`) |

**Do not** import the package root from a Client Component — Next will try to bundle Postgres/`dns` and fail.

## Tenancy

- `createCreateWorkspaceHandler` — first workspace (onboarding) and additional creates (subject to owned-workspace cap).
- `requireActiveWorkspace` throws `NO_WORKSPACE` when the user has none — product UI should send them to onboarding / create, not to “edit current workspace”.
- Switcher / settings that call update/delete need an existing membership; create via `POST` create handler first.

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

## Changelog

### 0.2.2
- Export `./billing/catalog` (client-safe plan helpers) and `./errors`
- Re-export `ShellError` from `./billing`
- Docs: avoid root import in Client Components; tenancy `NO_WORKSPACE` guidance
