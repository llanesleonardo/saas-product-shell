"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

export type ShellApiKeyPublic = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ApiKeysPanelProps = {
  /** Base path for API (default /api/api-keys). */
  apiPath?: string;
  /** Shown under the title. */
  description?: string;
  /** Key prefix hint in copy (e.g. "acme_…"). */
  prefixHint?: string;
};

/**
 * Minimal API-key management UI — product mounts under /settings/api-keys.
 */
export function ApiKeysPanel({
  apiPath = "/api/api-keys",
  description,
  prefixHint = "…",
}: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<ShellApiKeyPublic[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiPath);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Failed to load (${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        keys: ShellApiKeyPublic[];
        availableScopes?: string[];
      };
      setKeys(data.keys ?? []);
      setAvailableScopes(data.availableScopes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    }
  }, [apiPath]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleScope(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSecret(null);
    setError(null);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Create failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as { secret: string };
      setSecret(data.secret);
      setName("");
      setScopes([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm("Revoke this API key?")) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiPath}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Revoke failed (${res.status})`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
      <p className="mt-2 text-sm opacity-70">
        {description ??
          `Use Bearer ${prefixHint} keys with your product API. The full secret is shown once.`}
      </p>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {secret ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Copy your secret now</p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-2 text-xs">{secret}</code>
        </div>
      ) : null}

      <form onSubmit={onCreate} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={busy}
          />
        </div>
        {availableScopes.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-medium">Scopes</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableScopes.map((scope) => (
                <label key={scope} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    disabled={busy}
                  />
                  {scope}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create key
        </button>
      </form>

      <ul className="mt-10 space-y-3">
        {keys.map((key) => (
          <li
            key={key.id}
            className="flex items-center justify-between gap-4 rounded border px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium">{key.name}</p>
              <p className="text-xs opacity-60">
                {key.prefix}… · {key.scopes.join(", ") || "no scopes"}
                {key.revoked_at ? " · revoked" : ""}
              </p>
            </div>
            {!key.revoked_at ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRevoke(key.id)}
                className="text-xs text-red-600 underline"
              >
                Revoke
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
