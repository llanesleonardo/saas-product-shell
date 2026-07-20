"use client";

import { useTheme, type ThemePreference } from "./ThemeProvider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <label style={{ display: "block", padding: "0 0.25rem" }}>
      <span
        style={{
          display: "block",
          marginBottom: 4,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Theme
      </span>
      <select
        value={preference}
        onChange={(e) => setPreference(e.target.value as ThemePreference)}
        aria-label="Color theme"
        style={{
          width: "100%",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--input)",
          padding: "0.35rem 0.5rem",
          fontSize: 12,
          color: "var(--foreground)",
        }}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
