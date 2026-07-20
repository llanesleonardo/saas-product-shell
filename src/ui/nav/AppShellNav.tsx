"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ShellNavSection, ShellNavUser } from "./types";
import { WorkspaceSwitcher, type ShellWorkspaceSwitcherProps } from "./WorkspaceSwitcher";
import { ThemeToggle } from "../theme/ThemeToggle";
import { defaultAppNavSections } from "./defaults";

export type AppShellNavProps = {
  brand: { name: string; href?: string };
  /** Override sections; default = product placeholders + workspace + account. */
  sections?: ShellNavSection[];
  workspacesEnabled?: boolean;
  user?: ShellNavUser | null;
  /** After logout redirect (default /login). */
  loginPath?: string;
  logoutPath?: string;
  hideOnPaths?: (pathname: string | null) => boolean;
  workspaceSwitcher?: ShellWorkspaceSwitcherProps;
  /** Extra footer under theme/switcher. */
  footerExtra?: ReactNode;
};

function defaultHideOnPaths(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/login" || pathname === "/setup") return true;
  if (pathname === "/onboarding" || pathname.startsWith("/invite/")) return true;
  if (pathname === "/terms" || pathname === "/privacy" || pathname === "/faq") return true;
  if (pathname === "/pricing") return true;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return true;
  return false;
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: ShellNavSection["items"];
  pathname: string | null;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: "1.25rem", padding: "0 0.75rem" }}>
      <p
        style={{
          margin: "0 0 0.35rem",
          padding: "0 0.5rem",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {title}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  borderRadius: 8,
                  padding: "0.5rem 0.65rem",
                  fontSize: 14,
                  textDecoration: "none",
                  transition: "background 0.12s",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-fg)" : "var(--muted)",
                  fontWeight: active ? 500 : 400,
                  boxShadow: active ? "inset 0 0 0 1px var(--border)" : undefined,
                }}
              >
                {item.icon ?? null}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SidebarBody({
  brand,
  sections,
  workspacesEnabled,
  user,
  pathname,
  onNavigate,
  onLogout,
  workspaceSwitcher,
  footerExtra,
}: {
  brand: AppShellNavProps["brand"];
  sections: ShellNavSection[];
  workspacesEnabled: boolean;
  user: ShellNavUser | null;
  pathname: string | null;
  onNavigate?: () => void;
  onLogout: () => void;
  workspaceSwitcher?: ShellWorkspaceSwitcherProps;
  footerExtra?: ReactNode;
}) {
  const brandHref = brand.href ?? "/product";
  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          height: 56,
          flexShrink: 0,
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          padding: "0 1rem",
        }}
      >
        <Link
          href={brandHref}
          onClick={onNavigate}
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--foreground)",
            textDecoration: "none",
          }}
        >
          {brand.name}
        </Link>
      </div>

      <div style={{ minHeight: 0, flex: 1, overflowY: "auto", paddingBottom: "1rem" }}>
        {sections.map((section) => (
          <NavGroup
            key={section.title}
            title={section.title}
            items={section.items}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div
        style={{
          flexShrink: 0,
          display: "grid",
          gap: "0.75rem",
          borderTop: "1px solid var(--border)",
          padding: "0.75rem",
        }}
      >
        <ThemeToggle />
        {workspacesEnabled ? (
          <div
            style={{
              minWidth: 0,
              overflow: "hidden",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface-muted)",
              padding: "0.5rem",
            }}
          >
            <WorkspaceSwitcher {...workspaceSwitcher} />
          </div>
        ) : null}
        {footerExtra}
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 0.25rem" }}>
            <div
              aria-hidden
              style={{
                display: "flex",
                height: 32,
                width: 32,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "999px",
                background: "var(--surface-muted)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--foreground)",
              }}
            >
              {(user.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--foreground)",
                }}
              >
                {user.email}
              </p>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  margin: 0,
                  padding: 0,
                  border: "none",
                  background: "none",
                  fontSize: 11,
                  color: "var(--muted)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                Log out
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Default app chrome: Product (placeholders) · Workspace · Account,
 * theme toggle, workspace switcher — domain-agnostic.
 */
export function AppShellNav({
  brand,
  sections,
  workspacesEnabled = true,
  user = null,
  loginPath = "/login",
  logoutPath = "/api/auth/logout",
  hideOnPaths = defaultHideOnPaths,
  workspaceSwitcher,
  footerExtra,
}: AppShellNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const resolvedSections =
    sections ??
    defaultAppNavSections({ includeWorkspace: workspacesEnabled });

  if (hideOnPaths(pathname)) return null;
  if (pathname === "/" && !user) return null;

  async function logout() {
    await fetch(logoutPath, { method: "POST" });
    router.replace(loginPath);
    router.refresh();
  }

  const brandHref = brand.href ?? "/product";

  return (
    <>
      <div
        style={{
          display: "flex",
          height: 48,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "0 0.75rem",
        }}
        className="shell-nav-mobile-bar"
      >
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          style={{
            borderRadius: 6,
            border: "none",
            background: "transparent",
            padding: "0.35rem 0.5rem",
            fontSize: 14,
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          Menu
        </button>
        <Link
          href={brandHref}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--foreground)",
            textDecoration: "none",
          }}
        >
          {brand.name}
        </Link>
        <span style={{ width: 48 }} />
      </div>

      {mobileOpen ? (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50 }}
          className="shell-nav-mobile-drawer"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              background: "rgba(0,0,0,0.4)",
              cursor: "pointer",
            }}
          />
          <aside
            style={{
              position: "absolute",
              insetBlock: 0,
              left: 0,
              display: "flex",
              width: 256,
              flexDirection: "column",
              borderRight: "1px solid var(--border)",
              background: "var(--sidebar)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            }}
          >
            <SidebarBody
              brand={brand}
              sections={resolvedSections}
              workspacesEnabled={workspacesEnabled}
              user={user}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              onLogout={() => void logout()}
              workspaceSwitcher={workspaceSwitcher}
              footerExtra={footerExtra}
            />
          </aside>
        </div>
      ) : null}

      <aside
        style={{
          position: "sticky",
          top: 0,
          display: "none",
          height: "100vh",
          width: 224,
          flexShrink: 0,
          flexDirection: "column",
          alignSelf: "flex-start",
          borderRight: "1px solid var(--border)",
          background: "var(--sidebar)",
        }}
        className="shell-nav-desktop"
      >
        <SidebarBody
          brand={brand}
          sections={resolvedSections}
          workspacesEnabled={workspacesEnabled}
          user={user}
          pathname={pathname}
          onLogout={() => void logout()}
          workspaceSwitcher={workspaceSwitcher}
          footerExtra={footerExtra}
        />
      </aside>
      <style>{`
        @media (min-width: 768px) {
          .shell-nav-mobile-bar { display: none !important; }
          .shell-nav-mobile-drawer { display: none !important; }
          .shell-nav-desktop { display: flex !important; }
        }
      `}</style>
    </>
  );
}
