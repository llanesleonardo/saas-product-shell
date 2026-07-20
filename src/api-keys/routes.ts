import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  formatApiKeySecret,
  apiKeyPrefixFromPlaintext,
  requireExplicitScopes as platformRequireScopes,
} from "@llanesleonardo/saas-platform/server";
import { jsonError, parseJsonBody, ShellError } from "../errors";
import { hashPassword } from "../auth/password";
import { requireSessionUser, type AuthRouteDeps, type PublicUser } from "../auth/index";
import { getActiveWorkspaceId, requireWorkspaceAccess } from "../tenancy/index";

export type ApiKeyPublic = {
  id: string;
  workspace_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ApiKeyRouteDeps = AuthRouteDeps & {
  getWorkspaceCookieId?: (request: Request) => string | undefined | null;
  /** Override session resolution (e.g. Clerk + cookie). */
  resolveUser?: (request: Request) => Promise<PublicUser | null>;
  availableScopes?: () => string[];
  onCreated?: (info: {
    user: PublicUser;
    keyId: string;
    name: string;
    scopes: string[];
    prefix: string;
  }) => void | Promise<void>;
  onRevoked?: (info: { user: PublicUser; keyId: string }) => void | Promise<void>;
};

function workspaceCookie(deps: ApiKeyRouteDeps, request: Request) {
  return deps.getWorkspaceCookieId?.(request) ?? null;
}

async function resolveUser(deps: ApiKeyRouteDeps, request: Request): Promise<PublicUser> {
  if (deps.resolveUser) {
    const user = await deps.resolveUser(request);
    if (!user) throw ShellError.unauthorized("Sign in required.");
    return user;
  }
  return requireSessionUser(deps.getDb(), deps.getSessionId(request));
}

export function generateApiKeySecret(): {
  plaintext: string;
  prefix: string;
  keyHash: string;
} {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = formatApiKeySecret(secret);
  const prefix = apiKeyPrefixFromPlaintext(plaintext, 10);
  return { plaintext, prefix, keyHash: hashPassword(plaintext) };
}

export function toApiKeyPublic(row: {
  id: string;
  workspace_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
}): ApiKeyPublic {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at ?? null,
  };
}

export function createApiKeysListHandler(deps: ApiKeyRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await resolveUser(deps, request);
      const workspaceId = await getActiveWorkspaceId(
        db,
        user.id,
        workspaceCookie(deps, request),
      );
      if (!workspaceId) throw ShellError.validation("Create a workspace first", ["NO_WORKSPACE"]);
      await requireWorkspaceAccess(db, user.id, workspaceId, "admin");
      const keys = await db.listApiKeysForWorkspace(workspaceId);
      return NextResponse.json({
        keys: keys.map(toApiKeyPublic),
        availableScopes: deps.availableScopes?.() ?? [],
      });
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createApiKeyCreateHandler(deps: ApiKeyRouteDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await resolveUser(deps, request);
      const workspaceId = await getActiveWorkspaceId(
        db,
        user.id,
        workspaceCookie(deps, request),
      );
      if (!workspaceId) throw ShellError.validation("Create a workspace first", ["NO_WORKSPACE"]);
      await requireWorkspaceAccess(db, user.id, workspaceId, "admin");

      const body = await parseJsonBody<{ name?: string; scopes?: string[] }>(request);
      const name = body.name?.trim();
      if (!name) throw ShellError.validation("name is required", ["name"]);

      let scopes: string[];
      try {
        scopes = platformRequireScopes(body.scopes);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("SCOPES_")) {
          throw ShellError.validation(msg, [msg.split(":")[0] ?? "SCOPES"]);
        }
        throw e;
      }

      const { plaintext, prefix, keyHash } = generateApiKeySecret();
      const result = await db.createApiKey({
        workspace_id: workspaceId,
        name,
        prefix,
        key_hash: keyHash,
        scopes,
      });

      await deps.onCreated?.({
        user,
        keyId: result.id,
        name,
        scopes,
        prefix,
      });

      const row = await db.getApiKeyById(result.id);
      return NextResponse.json(
        {
          key: row ? toApiKeyPublic(row) : null,
          secret: plaintext,
          message: "Copy this secret now. It will not be shown again.",
        },
        { status: 201 },
      );
    } catch (err) {
      return jsonError(err);
    }
  };
}

export function createApiKeyRevokeHandler(deps: ApiKeyRouteDeps) {
  return async (request: Request, ctx: { params: { id: string } }): Promise<Response> => {
    try {
      const db = deps.getDb();
      const user = await resolveUser(deps, request);
      const workspaceId = await getActiveWorkspaceId(
        db,
        user.id,
        workspaceCookie(deps, request),
      );
      if (!workspaceId) throw ShellError.validation("Create a workspace first", ["NO_WORKSPACE"]);
      await requireWorkspaceAccess(db, user.id, workspaceId, "admin");

      const id = ctx.params.id;
      const existing = await db.getApiKeyById(id);
      if (!existing || existing.workspace_id !== workspaceId) {
        throw ShellError.notFound("API key");
      }
      await db.revokeApiKey(id);
      await deps.onRevoked?.({ user, keyId: id });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return jsonError(err);
    }
  };
}
