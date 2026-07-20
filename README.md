# @llanesleonardo/saas-product-shell

Product-shell kits on [`@llanesleonardo/saas-platform@0.3.0`](https://github.com/llanesleonardo/saas-platform).

**Source of truth:** this repository (not PeopleForms / FormBuilder).

```bash
# .npmrc
@llanesleonardo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

npm install @llanesleonardo/saas-platform@0.3.0 @llanesleonardo/saas-product-shell@0.2.1
```

| Kit | Export |
|-----|--------|
| Composition | `./composition` |
| DB memory / SQLite / Postgres | `./db` |
| Auth + Clerk helpers + page factories | `./auth` |
| Tenancy | `./tenancy` |
| Account | `./account` |
| Billing + webhook (+ hooks) | `./billing` |
| Email (Resend) | `./email` |
| API-key routes + `ApiKeysPanel` | `./api-keys` |
| Proxy / middleware | `./middleware` |

Scaffold a new app: `npx @llanesleonardo/create-saas@0.2.1 --name my-crm --prefix my_`

## Develop

```bash
npm install   # needs NODE_AUTH_TOKEN for saas-platform
npm run typecheck
npm run test:smoke
npm run check:boundaries
```

## Publish

Tag `vX.Y.Z` matching `package.json` version → GitHub Actions publishes to GitHub Packages.
