/** Shared nav types for AppShellNav — domain-agnostic. */

import type { ReactNode } from "react";

export type ShellNavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
};

export type ShellNavSection = {
  title: string;
  items: ShellNavItem[];
};

export type ShellNavUser = {
  id?: string;
  email: string;
  role?: string;
};
