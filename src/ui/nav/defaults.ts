import type { ShellNavItem, ShellNavSection } from "./types";
import { shellNavIcons } from "./icons";

/**
 * Default PRODUCT section — placeholders until the product domain is known.
 * Replace hrefs/labels in the consuming app.
 */
export function defaultProductPlaceholderSection(): ShellNavSection {
  return {
    title: "Product",
    items: [
      { href: "/product", label: "Overview", icon: shellNavIcons.product },
      { href: "/product/entities", label: "Entities", icon: shellNavIcons.entities },
      {
        href: "/product/connections",
        label: "Connections",
        icon: shellNavIcons.connections,
      },
      { href: "/product/rules", label: "Rules", icon: shellNavIcons.rules },
    ],
  };
}

/** Standard WORKSPACE section — both saas and selfhosted. */
export function defaultWorkspaceNavSection(): ShellNavSection {
  return {
    title: "Workspace",
    items: [
      { href: "/settings/workspace", label: "Workspace", icon: shellNavIcons.workspace },
      { href: "/settings/members", label: "Members", icon: shellNavIcons.members },
      { href: "/settings/api-keys", label: "API keys", icon: shellNavIcons.key },
      { href: "/settings/domains", label: "Domains", icon: shellNavIcons.domains },
      { href: "/billing", label: "Billing", icon: shellNavIcons.billing },
    ],
  };
}

/** Standard ACCOUNT section. */
export function defaultAccountNavSection(): ShellNavSection {
  return {
    title: "Account",
    items: [
      { href: "/account", label: "Account", icon: shellNavIcons.account },
      { href: "/settings/security", label: "Security", icon: shellNavIcons.security },
      { href: "/settings/jobs", label: "Jobs", icon: shellNavIcons.jobs },
    ],
  };
}

export function defaultAppNavSections(options?: {
  includeWorkspace?: boolean;
  productSection?: ShellNavSection;
}): ShellNavSection[] {
  const includeWorkspace = options?.includeWorkspace !== false;
  const sections: ShellNavSection[] = [
    options?.productSection ?? defaultProductPlaceholderSection(),
  ];
  if (includeWorkspace) sections.push(defaultWorkspaceNavSection());
  sections.push(defaultAccountNavSection());
  return sections;
}

export type { ShellNavItem };
