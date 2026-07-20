"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export type ThemePreference = "light" | "dark" | "system";

export type ShellThemeProviderProps = {
  children: ReactNode;
  /** localStorage key (default shell-theme). */
  storageKey?: string;
  /** Cookie name (default shell_theme). */
  cookieKey?: string;
  /** Force light theme on these paths (login/setup/marketing). */
  isPublicSurface?: (pathname: string | null) => boolean;
};

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function defaultIsPublicSurface(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/login" || pathname === "/setup") return true;
  if (pathname === "/onboarding" || pathname.startsWith("/invite/")) return true;
  if (pathname === "/terms" || pathname === "/privacy" || pathname === "/faq") return true;
  if (pathname === "/pricing" || pathname === "/") return true;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return true;
  return false;
}

function resolvePreference(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDomTheme(resolved: "light" | "dark") {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  storageKey = "shell-theme",
  cookieKey = "shell_theme",
  isPublicSurface = defaultIsPublicSurface,
}: ShellThemeProviderProps) {
  const pathname = usePathname();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const persist = useCallback(
    (pref: ThemePreference) => {
      window.localStorage.setItem(storageKey, pref);
      document.cookie = `${cookieKey}=${pref};path=/;max-age=31536000;samesite=lax`;
    },
    [storageKey, cookieKey],
  );

  const setPreference = useCallback(
    (value: ThemePreference) => {
      setPreferenceState(value);
      persist(value);
      const next = resolvePreference(value);
      setResolved(next);
      applyDomTheme(next);
    },
    [persist],
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    const pref: ThemePreference =
      raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
    setPreferenceState(pref);
    const next = isPublicSurface(pathname) ? "light" : resolvePreference(pref);
    setResolved(next);
    applyDomTheme(next);
  }, [pathname, storageKey, isPublicSurface]);

  useEffect(() => {
    if (preference !== "system" || isPublicSurface(pathname)) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      setResolved(next);
      applyDomTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference, pathname, isPublicSurface]);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
