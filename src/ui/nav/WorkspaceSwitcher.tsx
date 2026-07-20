"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_WORKSPACE_COOKIE } from "../../cookies";

export type ShellWorkspaceSwitcherProps = {
  /** Cookie that stores the active workspace id (default shell_workspace). */
  cookieName?: string;
  listPath?: string;
  activePath?: string;
  createPath?: string;
  onboardingHref?: string;
};

type WorkspaceRow = { id: string; name: string; slug?: string };

/**
 * Domain-agnostic workspace switcher — same chrome for saas and selfhosted.
 */
export function WorkspaceSwitcher({
  cookieName = DEFAULT_WORKSPACE_COOKIE,
  listPath = "/api/workspaces",
  activePath = "/api/workspaces/active",
  createPath = "/api/workspaces",
  onboardingHref = "/onboarding",
}: ShellWorkspaceSwitcherProps) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(listPath);
    if (!res.ok) return;
    const data = (await res.json()) as { workspaces: WorkspaceRow[] };
    setWorkspaces(data.workspaces ?? []);
    const cookieMatch = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.split("=")[1];
    const decoded = cookieMatch ? decodeURIComponent(cookieMatch) : "";
    const initial =
      data.workspaces.find((w) => w.id === decoded)?.id ?? data.workspaces[0]?.id ?? "";
    setActiveId(initial);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  async function createWorkspace(name: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(createPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not create workspace");
        return;
      }
      await refresh();
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function onChange(workspaceId: string) {
    if (workspaceId === "__create__") {
      const name = window.prompt("New workspace name");
      if (!name?.trim()) return;
      await createWorkspace(name);
      return;
    }
    setActiveId(workspaceId);
    await fetch(activePath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    router.refresh();
  }

  if (loading) {
    return (
      <p style={{ padding: "0 0.25rem", fontSize: 11, color: "var(--muted)" }}>
        Loading workspaces…
      </p>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div style={{ display: "grid", gap: "0.5rem", padding: "0 0.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>No workspace yet.</p>
        <button
          type="button"
          disabled={creating}
          onClick={() => {
            const name = window.prompt("Workspace name");
            if (!name?.trim()) return;
            void createWorkspace(name);
          }}
          style={{
            width: "100%",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--input)",
            padding: "0.35rem 0.5rem",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          {creating ? "Creating…" : "Create workspace"}
        </button>
        {error ? (
          <p style={{ fontSize: 11, color: "var(--danger, #dc2626)", margin: 0 }}>{error}</p>
        ) : null}
        <a
          href={onboardingHref}
          style={{ fontSize: 11, color: "var(--muted)" }}
        >
          Or use setup form
        </a>
      </div>
    );
  }

  return (
    <label style={{ display: "block", minWidth: 0, width: "100%" }}>
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
        Workspace
      </span>
      <select
        value={activeId}
        disabled={creating}
        onChange={(e) => void onChange(e.target.value)}
        style={{
          width: "100%",
          maxWidth: "100%",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--input)",
          padding: "0.35rem 0.5rem",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--foreground)",
        }}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
        <option value="__create__">+ Create workspace…</option>
      </select>
      {error ? (
        <p style={{ marginTop: 4, fontSize: 11, color: "var(--danger, #dc2626)" }}>{error}</p>
      ) : null}
    </label>
  );
}
