# App shell layout (domain-agnostic)

**Default UI chrome for every product** on `@llanesleonardo/saas-product-shell/ui`.  
Matches the PeopleForms sidebar shape; only the **Product** section is placeholders until the domain is known.

## Layout

```
┌─────────────┬──────────────────────────┐
│ Brand       │                          │
│ PRODUCT *   │   Page content           │
│ WORKSPACE   │                          │
│ ACCOUNT     │                          │
│ Theme       │                          │
│ Workspace ▾ │                          │
│ User / out  │                          │
└─────────────┴──────────────────────────┘
```

\* Product = Overview / Entities / Connections / Rules → `/product/*` stubs in `create-saas`.

## Usage

```tsx
import {
  AppShellNav,
  ThemeProvider,
  themeBootstrapScript,
  defaultAppNavSections,
} from "@llanesleonardo/saas-product-shell/ui";
import "@llanesleonardo/saas-product-shell/ui/tokens.css";

// layout.tsx head:
<script dangerouslySetInnerHTML={{ __html: themeBootstrapScript() }} />

<ThemeProvider>
  <div style={{ display: "flex", minHeight: "100vh" }}>
    <AppShellNav
      brand={{ name: "My App", href: "/product" }}
      sections={defaultAppNavSections()}
      workspacesEnabled
      user={user}
      workspaceSwitcher={{ cookieName: "shell_workspace" }}
    />
    <main style={{ flex: 1 }}>{children}</main>
  </div>
</ThemeProvider>
```

Replace `defaultProductPlaceholderSection()` items with your domain routes when ready.

## Related

- Dual-mode tenancy: [DUAL-MODE-TENANCY.md](./DUAL-MODE-TENANCY.md)
- Scaffold: `@llanesleonardo/create-saas` ships this layout by default
