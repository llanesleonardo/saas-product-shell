/**
 * T-06 — SQLite PlatformDatabaseAdapter (platform port only; no product domain).
 */
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AcceptWorkspaceInviteInput,
  ApiKeyRecord,
  CreateApiKeyInput,
  CreateAuditEventInput,
  CreateReferralCodeInput,
  CreateReferralRedemptionInput,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  CreateWorkspaceInviteInput,
  EnqueueJobInput,
  JobOutboxRecord,
  PlatformDatabaseAdapter,
  ReferralCodeRecord,
  ReferralRedemptionRecord,
  SessionRecord,
  UpdateWorkspaceBillingInput,
  UpdateWorkspaceInput,
  UsageCounterRecord,
  UserRecord,
  WorkspaceInviteRecord,
  WorkspaceMemberRecord,
  WorkspaceMemberWithEmail,
  WorkspaceRecord,
  WorkspaceRole,
} from "@llanesleonardo/saas-platform";

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return randomUUID();
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      idp_subject TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_agent TEXT,
      ip TEXT,
      last_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS workspace_invites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      available_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      workspace_id TEXT,
      resource_type TEXT,
      resource_id TEXT
    );
    CREATE TABLE IF NOT EXISTS usage_counters (
      workspace_id TEXT NOT NULL,
      period TEXT NOT NULL,
      metrics TEXT NOT NULL,
      PRIMARY KEY (workspace_id, period)
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS referral_codes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      deactivated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS referral_redemptions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      referrer_workspace_id TEXT NOT NULL,
      referee_workspace_id TEXT NOT NULL,
      referee_user_id TEXT,
      stripe_checkout_session_id TEXT,
      reward_granted INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: row.role as UserRecord["role"],
    idp_subject: (row.idp_subject as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
    user_agent: (row.user_agent as string | null) ?? null,
    ip: (row.ip as string | null) ?? null,
    last_seen_at: (row.last_seen_at as string | null) ?? null,
  };
}

function mapWorkspace(row: Record<string, unknown>): WorkspaceRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    plan: String(row.plan),
    stripe_customer_id: (row.stripe_customer_id as string | null) ?? null,
    stripe_subscription_id: (row.stripe_subscription_id as string | null) ?? null,
    subscription_status: (row.subscription_status as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function mapJob(row: Record<string, unknown>): JobOutboxRecord {
  return {
    id: String(row.id),
    type: String(row.type),
    payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
    status: row.status as JobOutboxRecord["status"],
    attempts: Number(row.attempts),
    available_at: String(row.available_at),
    last_error: (row.last_error as string | null) ?? null,
    created_at: String(row.created_at),
    workspace_id: (row.workspace_id as string | null) ?? null,
    resource_type: (row.resource_type as string | null) ?? null,
    resource_id: (row.resource_id as string | null) ?? null,
  };
}

export function createSqlitePlatformAdapter(options?: {
  path?: string;
  maxOwnedWorkspacesPerUser?: number;
}): PlatformDatabaseAdapter {
  const maxOwned = options?.maxOwnedWorkspacesPerUser ?? 1;
  const dbPath =
    options?.path ??
    process.env.SQLITE_PATH ??
    path.join(process.cwd(), "data", "saas-shell.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);

  const adapter: PlatformDatabaseAdapter = {
    provider: "sqlite",
    async ping() {
      db.prepare("SELECT 1").get();
      return true;
    },
    async countUsers() {
      const row = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
      return row.c;
    },
    async createUser(input: CreateUserInput) {
      const uid = id();
      db.prepare(
        `INSERT INTO users (id, email, password_hash, role, idp_subject, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        uid,
        input.email.toLowerCase(),
        input.password_hash,
        input.role ?? "admin",
        input.idp_subject ?? null,
        nowIso(),
      );
      return { id: uid };
    },
    async getUserByEmail(email: string) {
      const row = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(email.toLowerCase()) as Record<string, unknown> | undefined;
      return row ? mapUser(row) : null;
    },
    async getUserById(userId: string) {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
        | Record<string, unknown>
        | undefined;
      return row ? mapUser(row) : null;
    },
    async getUserByIdpSubject(subject: string) {
      const row = db
        .prepare("SELECT * FROM users WHERE idp_subject = ?")
        .get(subject) as Record<string, unknown> | undefined;
      return row ? mapUser(row) : null;
    },
    async resolveOrCreateIdpUser(email: string, subject: string) {
      const existing = await adapter.getUserByIdpSubject(subject);
      if (existing) return existing;
      const byEmail = await adapter.getUserByEmail(email);
      if (byEmail) {
        db.prepare("UPDATE users SET idp_subject = ? WHERE id = ?").run(subject, byEmail.id);
        return (await adapter.getUserById(byEmail.id))!;
      }
      const created = await adapter.createUser({
        email,
        password_hash: "",
        idp_subject: subject,
      });
      return (await adapter.getUserById(created.id))!;
    },
    async updateUserPassword(userId: string, passwordHash: string) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
    },
    async createSession(input: CreateSessionInput) {
      const sid = id();
      db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sid,
        input.user_id,
        input.expires_at,
        nowIso(),
        input.user_agent ?? null,
        input.ip ?? null,
        nowIso(),
      );
      return { id: sid };
    },
    async getSessionById(sessionId: string) {
      const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as
        | Record<string, unknown>
        | undefined;
      return row ? mapSession(row) : null;
    },
    async deleteSession(sessionId: string) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    },
    async deleteSessionsForUser(userId: string) {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    },
    async listSessionsForUser(userId: string) {
      const rows = db
        .prepare("SELECT * FROM sessions WHERE user_id = ?")
        .all(userId) as Record<string, unknown>[];
      return rows.map(mapSession);
    },
    async touchSession(sessionId: string) {
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), sessionId);
    },
    async deleteUser(userId: string) {
      await adapter.deleteSessionsForUser(userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    },
    async createAuditEvent(_input: CreateAuditEventInput) {
      const aid = id();
      db.prepare("INSERT INTO audit_events (id, created_at) VALUES (?, ?)").run(aid, nowIso());
      return { id: aid };
    },
    async enqueueJob(input: EnqueueJobInput) {
      const jid = id();
      db.prepare(
        `INSERT INTO jobs (id, type, payload, status, attempts, available_at, last_error, created_at, workspace_id, resource_type, resource_id)
         VALUES (?, ?, ?, 'pending', 0, ?, NULL, ?, ?, ?, ?)`,
      ).run(
        jid,
        input.type,
        JSON.stringify(input.payload),
        input.available_at ?? nowIso(),
        nowIso(),
        input.workspace_id ?? null,
        input.resource_type ?? null,
        input.resource_id ?? null,
      );
      return { id: jid };
    },
    async claimPendingJobs(limit: number) {
      const now = nowIso();
      const rows = db
        .prepare(
          `SELECT * FROM jobs WHERE status = 'pending' AND available_at <= ? ORDER BY created_at LIMIT ?`,
        )
        .all(now, limit) as Record<string, unknown>[];
      const claimed: JobOutboxRecord[] = [];
      for (const row of rows) {
        db.prepare(
          `UPDATE jobs SET status = 'processing', attempts = attempts + 1 WHERE id = ?`,
        ).run(row.id);
        claimed.push(mapJob({ ...row, status: "processing", attempts: Number(row.attempts) + 1 }));
      }
      return claimed;
    },
    async completeJob(jobId: string) {
      db.prepare(`UPDATE jobs SET status = 'done', last_error = NULL WHERE id = ?`).run(jobId);
    },
    async failJob(jobId: string, error: string, retryAtIso: string | null) {
      if (retryAtIso) {
        db.prepare(
          `UPDATE jobs SET status = 'pending', last_error = ?, available_at = ? WHERE id = ?`,
        ).run(error, retryAtIso, jobId);
      } else {
        db.prepare(`UPDATE jobs SET status = 'failed', last_error = ? WHERE id = ?`).run(
          error,
          jobId,
        );
      }
    },
    async listJobs(options) {
      let sql = "SELECT * FROM jobs WHERE 1=1";
      const params: unknown[] = [];
      if (options?.status) {
        sql += " AND status = ?";
        params.push(options.status);
      }
      if (options?.workspaceId) {
        sql += " AND workspace_id = ?";
        params.push(options.workspaceId);
      }
      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(options?.limit ?? 50);
      return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(mapJob);
    },
    async getJobById(jobId: string, workspaceId?: string | null) {
      const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as
        | Record<string, unknown>
        | undefined;
      if (!row) return null;
      if (workspaceId && row.workspace_id !== workspaceId) return null;
      return mapJob(row);
    },
    async retryJob(jobId: string, workspaceId?: string | null) {
      const j = await adapter.getJobById(jobId, workspaceId);
      if (!j) return false;
      db.prepare(
        `UPDATE jobs SET status = 'pending', available_at = ?, last_error = NULL WHERE id = ?`,
      ).run(nowIso(), jobId);
      return true;
    },
    async createWorkspace(input: CreateWorkspaceInput) {
      const wid = id();
      db.prepare(
        `INSERT INTO workspaces (id, name, slug, plan, stripe_customer_id, stripe_subscription_id, subscription_status, created_at)
         VALUES (?, ?, ?, 'free', NULL, NULL, NULL, ?)`,
      ).run(wid, input.name, input.slug, nowIso());
      await adapter.addWorkspaceMember(wid, input.owner_user_id, "owner");
      return { id: wid };
    },
    async createOwnedWorkspaceIfAllowed(input: CreateWorkspaceInput) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c FROM workspace_members WHERE user_id = ? AND role = 'owner'`,
        )
        .get(input.owner_user_id) as { c: number };
      if (row.c >= maxOwned) throw new Error("OWNED_WORKSPACE_CAP");
      return adapter.createWorkspace(input);
    },
    async acceptWorkspaceInvite(input: AcceptWorkspaceInviteInput) {
      const invite = await adapter.getWorkspaceInviteByToken(input.token);
      if (!invite) throw new Error("INVITE_NOT_FOUND");
      const seats = await adapter.countWorkspaceMembers(invite.workspace_id);
      if (seats >= input.max_seats) throw new Error("SEAT_LIMIT");
      await adapter.addWorkspaceMember(invite.workspace_id, input.user_id, invite.role);
      db.prepare("DELETE FROM workspace_invites WHERE id = ?").run(invite.id);
      return { workspaceId: invite.workspace_id };
    },
    async getWorkspaceById(workspaceId: string) {
      const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as
        | Record<string, unknown>
        | undefined;
      return row ? mapWorkspace(row) : null;
    },
    async getWorkspaceBySlug(slug: string) {
      const row = db.prepare("SELECT * FROM workspaces WHERE slug = ?").get(slug) as
        | Record<string, unknown>
        | undefined;
      return row ? mapWorkspace(row) : null;
    },
    async listWorkspacesForUser(userId: string) {
      const rows = db
        .prepare(
          `SELECT w.* FROM workspaces w
           INNER JOIN workspace_members m ON m.workspace_id = w.id
           WHERE m.user_id = ?`,
        )
        .all(userId) as Record<string, unknown>[];
      return rows.map(mapWorkspace);
    },
    async updateWorkspaceBilling(workspaceId: string, input: UpdateWorkspaceBillingInput) {
      const w = await adapter.getWorkspaceById(workspaceId);
      if (!w) return;
      db.prepare(
        `UPDATE workspaces SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?
         WHERE id = ?`,
      ).run(
        input.plan ?? w.plan,
        input.stripe_customer_id !== undefined ? input.stripe_customer_id : w.stripe_customer_id,
        input.stripe_subscription_id !== undefined
          ? input.stripe_subscription_id
          : w.stripe_subscription_id,
        input.subscription_status !== undefined
          ? input.subscription_status
          : w.subscription_status,
        workspaceId,
      );
    },
    async getWorkspaceMembership(workspaceId: string, userId: string) {
      const row = db
        .prepare(
          `SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
        )
        .get(workspaceId, userId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        workspace_id: String(row.workspace_id),
        user_id: String(row.user_id),
        role: row.role as WorkspaceRole,
        created_at: String(row.created_at),
      } satisfies WorkspaceMemberRecord;
    },
    async addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole) {
      db.prepare(
        `INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(workspaceId, userId, role, nowIso());
    },
    async countWorkspaceMembers(workspaceId: string) {
      const row = db
        .prepare(`SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ?`)
        .get(workspaceId) as { c: number };
      return row.c;
    },
    async createWorkspaceInvite(input: CreateWorkspaceInviteInput) {
      const iid = id();
      db.prepare(
        `INSERT INTO workspace_invites (id, workspace_id, email, role, token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        iid,
        input.workspace_id,
        input.email.toLowerCase(),
        input.role,
        input.token,
        input.expires_at,
        nowIso(),
      );
      return { id: iid };
    },
    async getWorkspaceInviteByToken(token: string) {
      const row = db
        .prepare("SELECT * FROM workspace_invites WHERE token = ?")
        .get(token) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        workspace_id: String(row.workspace_id),
        email: String(row.email),
        role: row.role as WorkspaceRole,
        token: String(row.token),
        expires_at: String(row.expires_at),
        created_at: String(row.created_at),
      } satisfies WorkspaceInviteRecord;
    },
    async deleteWorkspaceInvite(inviteId: string, workspaceId?: string | null) {
      const row = db.prepare("SELECT * FROM workspace_invites WHERE id = ?").get(inviteId) as
        | Record<string, unknown>
        | undefined;
      if (!row) return false;
      if (workspaceId && row.workspace_id !== workspaceId) return false;
      db.prepare("DELETE FROM workspace_invites WHERE id = ?").run(inviteId);
      return true;
    },
    async listWorkspaceInvites(workspaceId: string) {
      const rows = db
        .prepare("SELECT * FROM workspace_invites WHERE workspace_id = ?")
        .all(workspaceId) as Record<string, unknown>[];
      return rows.map(
        (row) =>
          ({
            id: String(row.id),
            workspace_id: String(row.workspace_id),
            email: String(row.email),
            role: row.role as WorkspaceRole,
            token: String(row.token),
            expires_at: String(row.expires_at),
            created_at: String(row.created_at),
          }) satisfies WorkspaceInviteRecord,
      );
    },
    async updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput) {
      const w = await adapter.getWorkspaceById(workspaceId);
      if (!w) return;
      db.prepare(`UPDATE workspaces SET name = ?, slug = ? WHERE id = ?`).run(
        input.name ?? w.name,
        input.slug ?? w.slug,
        workspaceId,
      );
    },
    async listWorkspaceMembers(workspaceId: string) {
      const rows = db
        .prepare(
          `SELECT m.*, u.email AS email FROM workspace_members m
           LEFT JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id = ?`,
        )
        .all(workspaceId) as Record<string, unknown>[];
      return rows.map(
        (row) =>
          ({
            workspace_id: String(row.workspace_id),
            user_id: String(row.user_id),
            role: row.role as WorkspaceRole,
            created_at: String(row.created_at),
            email: String(row.email ?? ""),
          }) satisfies WorkspaceMemberWithEmail,
      );
    },
    async updateWorkspaceMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
      db.prepare(
        `UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?`,
      ).run(role, workspaceId, userId);
    },
    async removeWorkspaceMember(workspaceId: string, userId: string) {
      db.prepare(
        `DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
      ).run(workspaceId, userId);
    },
    async countWorkspaceOwners(workspaceId: string) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND role = 'owner'`,
        )
        .get(workspaceId) as { c: number };
      return row.c;
    },
    async deleteWorkspace(workspaceId: string) {
      db.prepare("DELETE FROM workspace_members WHERE workspace_id = ?").run(workspaceId);
      db.prepare("DELETE FROM workspace_invites WHERE workspace_id = ?").run(workspaceId);
      db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
    },
    async incrementUsage(workspaceId: string, period: string, field: string, by = 1) {
      const cur = await adapter.getUsage(workspaceId, period);
      const metrics = { ...(cur?.metrics ?? {}), [field]: ((cur?.metrics ?? {})[field] ?? 0) + by };
      db.prepare(
        `INSERT INTO usage_counters (workspace_id, period, metrics) VALUES (?, ?, ?)
         ON CONFLICT(workspace_id, period) DO UPDATE SET metrics = excluded.metrics`,
      ).run(workspaceId, period, JSON.stringify(metrics));
    },
    async getUsage(workspaceId: string, period: string) {
      const row = db
        .prepare(`SELECT * FROM usage_counters WHERE workspace_id = ? AND period = ?`)
        .get(workspaceId, period) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        workspace_id: workspaceId,
        period,
        metrics: JSON.parse(String(row.metrics)) as Record<string, number>,
      } satisfies UsageCounterRecord;
    },
    async createApiKey(input: CreateApiKeyInput) {
      const kid = id();
      db.prepare(
        `INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_at, last_used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      ).run(
        kid,
        input.workspace_id,
        input.name,
        input.prefix,
        input.key_hash,
        JSON.stringify(input.scopes),
        nowIso(),
      );
      return { id: kid };
    },
    async listApiKeysForWorkspace(workspaceId: string) {
      const rows = db
        .prepare("SELECT * FROM api_keys WHERE workspace_id = ?")
        .all(workspaceId) as Record<string, unknown>[];
      return rows.map(
        (row) =>
          ({
            id: String(row.id),
            workspace_id: String(row.workspace_id),
            name: String(row.name),
            prefix: String(row.prefix),
            key_hash: String(row.key_hash),
            scopes: JSON.parse(String(row.scopes)) as string[],
            created_at: String(row.created_at),
            last_used_at: (row.last_used_at as string | null) ?? null,
            revoked_at: (row.revoked_at as string | null) ?? null,
          }) satisfies ApiKeyRecord,
      );
    },
    async listApiKeysByPrefix(prefix: string) {
      const rows = db
        .prepare("SELECT * FROM api_keys WHERE prefix = ?")
        .all(prefix) as Record<string, unknown>[];
      return rows.map(
        (row) =>
          ({
            id: String(row.id),
            workspace_id: String(row.workspace_id),
            name: String(row.name),
            prefix: String(row.prefix),
            key_hash: String(row.key_hash),
            scopes: JSON.parse(String(row.scopes)) as string[],
            created_at: String(row.created_at),
            last_used_at: (row.last_used_at as string | null) ?? null,
            revoked_at: (row.revoked_at as string | null) ?? null,
          }) satisfies ApiKeyRecord,
      );
    },
    async getApiKeyById(keyId: string) {
      const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(keyId) as
        | Record<string, unknown>
        | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        workspace_id: String(row.workspace_id),
        name: String(row.name),
        prefix: String(row.prefix),
        key_hash: String(row.key_hash),
        scopes: JSON.parse(String(row.scopes)) as string[],
        created_at: String(row.created_at),
        last_used_at: (row.last_used_at as string | null) ?? null,
        revoked_at: (row.revoked_at as string | null) ?? null,
      } satisfies ApiKeyRecord;
    },
    async revokeApiKey(keyId: string) {
      db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ?").run(nowIso(), keyId);
    },
    async touchApiKeyLastUsed(keyId: string) {
      db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(nowIso(), keyId);
    },
    async getReferralCodeByWorkspace(workspaceId: string) {
      const row = db
        .prepare("SELECT * FROM referral_codes WHERE workspace_id = ?")
        .get(workspaceId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        workspace_id: String(row.workspace_id),
        code: String(row.code),
        created_at: String(row.created_at),
        deactivated_at: (row.deactivated_at as string | null) ?? null,
      } satisfies ReferralCodeRecord;
    },
    async getReferralCodeByCode(code: string) {
      const row = db.prepare("SELECT * FROM referral_codes WHERE code = ?").get(code) as
        | Record<string, unknown>
        | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        workspace_id: String(row.workspace_id),
        code: String(row.code),
        created_at: String(row.created_at),
        deactivated_at: (row.deactivated_at as string | null) ?? null,
      } satisfies ReferralCodeRecord;
    },
    async createReferralCode(input: CreateReferralCodeInput) {
      const rid = id();
      db.prepare(
        `INSERT INTO referral_codes (id, workspace_id, code, created_at, deactivated_at)
         VALUES (?, ?, ?, ?, NULL)`,
      ).run(rid, input.workspace_id, input.code, nowIso());
      return { id: rid };
    },
    async createReferralRedemption(input: CreateReferralRedemptionInput) {
      const rid = id();
      db.prepare(
        `INSERT INTO referral_redemptions
         (id, code, referrer_workspace_id, referee_workspace_id, referee_user_id, stripe_checkout_session_id, reward_granted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      ).run(
        rid,
        input.code,
        input.referrer_workspace_id,
        input.referee_workspace_id,
        input.referee_user_id ?? null,
        input.stripe_checkout_session_id ?? null,
        nowIso(),
      );
      return { id: rid };
    },
    async listReferralRedemptionsForReferrer(workspaceId: string) {
      const rows = db
        .prepare("SELECT * FROM referral_redemptions WHERE referrer_workspace_id = ?")
        .all(workspaceId) as Record<string, unknown>[];
      return rows.map(
        (row) =>
          ({
            id: String(row.id),
            code: String(row.code),
            referrer_workspace_id: String(row.referrer_workspace_id),
            referee_workspace_id: String(row.referee_workspace_id),
            referee_user_id: (row.referee_user_id as string | null) ?? null,
            stripe_checkout_session_id: (row.stripe_checkout_session_id as string | null) ?? null,
            reward_granted: Boolean(row.reward_granted),
            created_at: String(row.created_at),
          }) satisfies ReferralRedemptionRecord,
      );
    },
    async countReferralRedemptionsForReferee(workspaceId: string) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c FROM referral_redemptions WHERE referee_workspace_id = ?`,
        )
        .get(workspaceId) as { c: number };
      return row.c;
    },
    async markReferralRewardGranted(redemptionId: string) {
      db.prepare(`UPDATE referral_redemptions SET reward_granted = 1 WHERE id = ?`).run(
        redemptionId,
      );
    },
  };

  return adapter;
}
