/**
 * T-06 — Postgres PlatformDatabaseAdapter (platform port only; no product domain).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
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

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

async function initSchema(pool: pg.Pool) {
  await pool.query(`
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
    payload: parseJson<Record<string, unknown>>(row.payload),
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

function mapApiKey(row: Record<string, unknown>): ApiKeyRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    prefix: String(row.prefix),
    key_hash: String(row.key_hash),
    scopes: parseJson<string[]>(row.scopes),
    created_at: String(row.created_at),
    last_used_at: (row.last_used_at as string | null) ?? null,
    revoked_at: (row.revoked_at as string | null) ?? null,
  };
}

function mapReferralCode(row: Record<string, unknown>): ReferralCodeRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    code: String(row.code),
    created_at: String(row.created_at),
    deactivated_at: (row.deactivated_at as string | null) ?? null,
  };
}

function mapReferralRedemption(row: Record<string, unknown>): ReferralRedemptionRecord {
  return {
    id: String(row.id),
    code: String(row.code),
    referrer_workspace_id: String(row.referrer_workspace_id),
    referee_workspace_id: String(row.referee_workspace_id),
    referee_user_id: (row.referee_user_id as string | null) ?? null,
    stripe_checkout_session_id: (row.stripe_checkout_session_id as string | null) ?? null,
    reward_granted: Boolean(row.reward_granted),
    created_at: String(row.created_at),
  };
}

export function createPostgresPlatformAdapter(options?: {
  connectionString?: string;
  maxOwnedWorkspacesPerUser?: number;
}): PlatformDatabaseAdapter {
  const maxOwned = options?.maxOwnedWorkspacesPerUser ?? 1;
  const connectionString =
    options?.connectionString ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "Postgres connection string required (options.connectionString, DATABASE_URL, or POSTGRES_URL)",
    );
  }

  const pool = new pg.Pool({ connectionString });
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema() {
    if (!schemaReady) {
      schemaReady = initSchema(pool);
    }
    await schemaReady;
  }

  const adapter: PlatformDatabaseAdapter = {
    provider: "postgres",
    async ping() {
      await ensureSchema();
      await pool.query("SELECT 1");
      return true;
    },
    async countUsers() {
      await ensureSchema();
      const { rows } = await pool.query<{ c: string | number }>("SELECT COUNT(*) AS c FROM users");
      return Number(rows[0]?.c ?? 0);
    },
    async createUser(input: CreateUserInput) {
      await ensureSchema();
      const uid = id();
      await pool.query(
        `INSERT INTO users (id, email, password_hash, role, idp_subject, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uid,
          input.email.toLowerCase(),
          input.password_hash,
          input.role ?? "admin",
          input.idp_subject ?? null,
          nowIso(),
        ],
      );
      return { id: uid };
    },
    async getUserByEmail(email: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [
        email.toLowerCase(),
      ]);
      return rows[0] ? mapUser(rows[0] as Record<string, unknown>) : null;
    },
    async getUserById(userId: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      return rows[0] ? mapUser(rows[0] as Record<string, unknown>) : null;
    },
    async getUserByIdpSubject(subject: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM users WHERE idp_subject = $1", [subject]);
      return rows[0] ? mapUser(rows[0] as Record<string, unknown>) : null;
    },
    async resolveOrCreateIdpUser(email: string, subject: string) {
      await ensureSchema();
      const existing = await adapter.getUserByIdpSubject(subject);
      if (existing) return existing;
      const byEmail = await adapter.getUserByEmail(email);
      if (byEmail) {
        await pool.query("UPDATE users SET idp_subject = $1 WHERE id = $2", [subject, byEmail.id]);
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
      await ensureSchema();
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        passwordHash,
        userId,
      ]);
    },
    async createSession(input: CreateSessionInput) {
      await ensureSchema();
      const sid = id();
      await pool.query(
        `INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sid,
          input.user_id,
          input.expires_at,
          nowIso(),
          input.user_agent ?? null,
          input.ip ?? null,
          nowIso(),
        ],
      );
      return { id: sid };
    },
    async getSessionById(sessionId: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
      return rows[0] ? mapSession(rows[0] as Record<string, unknown>) : null;
    },
    async deleteSession(sessionId: string) {
      await ensureSchema();
      await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    },
    async deleteSessionsForUser(userId: string) {
      await ensureSchema();
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    },
    async listSessionsForUser(userId: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM sessions WHERE user_id = $1", [userId]);
      return rows.map((row) => mapSession(row as Record<string, unknown>));
    },
    async touchSession(sessionId: string) {
      await ensureSchema();
      await pool.query("UPDATE sessions SET last_seen_at = $1 WHERE id = $2", [
        nowIso(),
        sessionId,
      ]);
    },
    async deleteUser(userId: string) {
      await ensureSchema();
      await adapter.deleteSessionsForUser(userId);
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    },
    async createAuditEvent(_input: CreateAuditEventInput) {
      await ensureSchema();
      const aid = id();
      await pool.query("INSERT INTO audit_events (id, created_at) VALUES ($1, $2)", [
        aid,
        nowIso(),
      ]);
      return { id: aid };
    },
    async enqueueJob(input: EnqueueJobInput) {
      await ensureSchema();
      const jid = id();
      await pool.query(
        `INSERT INTO jobs (id, type, payload, status, attempts, available_at, last_error, created_at, workspace_id, resource_type, resource_id)
         VALUES ($1, $2, $3, 'pending', 0, $4, NULL, $5, $6, $7, $8)`,
        [
          jid,
          input.type,
          JSON.stringify(input.payload),
          input.available_at ?? nowIso(),
          nowIso(),
          input.workspace_id ?? null,
          input.resource_type ?? null,
          input.resource_id ?? null,
        ],
      );
      return { id: jid };
    },
    async claimPendingJobs(limit: number) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const now = nowIso();
        const { rows } = await client.query(
          `SELECT * FROM jobs WHERE status = 'pending' AND available_at <= $1 ORDER BY created_at LIMIT $2`,
          [now, limit],
        );
        const claimed: JobOutboxRecord[] = [];
        for (const row of rows) {
          await client.query(
            `UPDATE jobs SET status = 'processing', attempts = attempts + 1 WHERE id = $1`,
            [row.id],
          );
          claimed.push(
            mapJob({
              ...(row as Record<string, unknown>),
              status: "processing",
              attempts: Number(row.attempts) + 1,
            }),
          );
        }
        await client.query("COMMIT");
        return claimed;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    async completeJob(jobId: string) {
      await ensureSchema();
      await pool.query(`UPDATE jobs SET status = 'done', last_error = NULL WHERE id = $1`, [
        jobId,
      ]);
    },
    async failJob(jobId: string, error: string, retryAtIso: string | null) {
      await ensureSchema();
      if (retryAtIso) {
        await pool.query(
          `UPDATE jobs SET status = 'pending', last_error = $1, available_at = $2 WHERE id = $3`,
          [error, retryAtIso, jobId],
        );
      } else {
        await pool.query(`UPDATE jobs SET status = 'failed', last_error = $1 WHERE id = $2`, [
          error,
          jobId,
        ]);
      }
    },
    async listJobs(options) {
      await ensureSchema();
      let sql = "SELECT * FROM jobs WHERE 1=1";
      const params: unknown[] = [];
      if (options?.status) {
        params.push(options.status);
        sql += ` AND status = $${params.length}`;
      }
      if (options?.workspaceId) {
        params.push(options.workspaceId);
        sql += ` AND workspace_id = $${params.length}`;
      }
      params.push(options?.limit ?? 50);
      sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      const { rows } = await pool.query(sql, params);
      return rows.map((row) => mapJob(row as Record<string, unknown>));
    },
    async getJobById(jobId: string, workspaceId?: string | null) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM jobs WHERE id = $1", [jobId]);
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      if (workspaceId && row.workspace_id !== workspaceId) return null;
      return mapJob(row);
    },
    async retryJob(jobId: string, workspaceId?: string | null) {
      await ensureSchema();
      const j = await adapter.getJobById(jobId, workspaceId);
      if (!j) return false;
      await pool.query(
        `UPDATE jobs SET status = 'pending', available_at = $1, last_error = NULL WHERE id = $2`,
        [nowIso(), jobId],
      );
      return true;
    },
    async createWorkspace(input: CreateWorkspaceInput) {
      await ensureSchema();
      const wid = id();
      await pool.query(
        `INSERT INTO workspaces (id, name, slug, plan, stripe_customer_id, stripe_subscription_id, subscription_status, created_at)
         VALUES ($1, $2, $3, 'free', NULL, NULL, NULL, $4)`,
        [wid, input.name, input.slug, nowIso()],
      );
      await adapter.addWorkspaceMember(wid, input.owner_user_id, "owner");
      return { id: wid };
    },
    async createOwnedWorkspaceIfAllowed(input: CreateWorkspaceInput) {
      await ensureSchema();
      const { rows } = await pool.query<{ c: string | number }>(
        `SELECT COUNT(*) AS c FROM workspace_members WHERE user_id = $1 AND role = 'owner'`,
        [input.owner_user_id],
      );
      if (Number(rows[0]?.c ?? 0) >= maxOwned) throw new Error("OWNED_WORKSPACE_CAP");
      return adapter.createWorkspace(input);
    },
    async acceptWorkspaceInvite(input: AcceptWorkspaceInviteInput) {
      await ensureSchema();
      const invite = await adapter.getWorkspaceInviteByToken(input.token);
      if (!invite) throw new Error("INVITE_NOT_FOUND");
      const seats = await adapter.countWorkspaceMembers(invite.workspace_id);
      if (seats >= input.max_seats) throw new Error("SEAT_LIMIT");
      await adapter.addWorkspaceMember(invite.workspace_id, input.user_id, invite.role);
      await pool.query("DELETE FROM workspace_invites WHERE id = $1", [invite.id]);
      return { workspaceId: invite.workspace_id };
    },
    async getWorkspaceById(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM workspaces WHERE id = $1", [workspaceId]);
      return rows[0] ? mapWorkspace(rows[0] as Record<string, unknown>) : null;
    },
    async getWorkspaceBySlug(slug: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM workspaces WHERE slug = $1", [slug]);
      return rows[0] ? mapWorkspace(rows[0] as Record<string, unknown>) : null;
    },
    async listWorkspacesForUser(userId: string) {
      await ensureSchema();
      const { rows } = await pool.query(
        `SELECT w.* FROM workspaces w
         INNER JOIN workspace_members m ON m.workspace_id = w.id
         WHERE m.user_id = $1`,
        [userId],
      );
      return rows.map((row) => mapWorkspace(row as Record<string, unknown>));
    },
    async updateWorkspaceBilling(workspaceId: string, input: UpdateWorkspaceBillingInput) {
      await ensureSchema();
      const w = await adapter.getWorkspaceById(workspaceId);
      if (!w) return;
      await pool.query(
        `UPDATE workspaces SET plan = $1, stripe_customer_id = $2, stripe_subscription_id = $3, subscription_status = $4
         WHERE id = $5`,
        [
          input.plan ?? w.plan,
          input.stripe_customer_id !== undefined ? input.stripe_customer_id : w.stripe_customer_id,
          input.stripe_subscription_id !== undefined
            ? input.stripe_subscription_id
            : w.stripe_subscription_id,
          input.subscription_status !== undefined
            ? input.subscription_status
            : w.subscription_status,
          workspaceId,
        ],
      );
    },
    async getWorkspaceMembership(workspaceId: string, userId: string) {
      await ensureSchema();
      const { rows } = await pool.query(
        `SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        workspace_id: String(row.workspace_id),
        user_id: String(row.user_id),
        role: row.role as WorkspaceRole,
        created_at: String(row.created_at),
      } satisfies WorkspaceMemberRecord;
    },
    async addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole) {
      await ensureSchema();
      await pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET
           role = EXCLUDED.role,
           created_at = EXCLUDED.created_at`,
        [workspaceId, userId, role, nowIso()],
      );
    },
    async countWorkspaceMembers(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query<{ c: string | number }>(
        `SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = $1`,
        [workspaceId],
      );
      return Number(rows[0]?.c ?? 0);
    },
    async createWorkspaceInvite(input: CreateWorkspaceInviteInput) {
      await ensureSchema();
      const iid = id();
      await pool.query(
        `INSERT INTO workspace_invites (id, workspace_id, email, role, token, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          iid,
          input.workspace_id,
          input.email.toLowerCase(),
          input.role,
          input.token,
          input.expires_at,
          nowIso(),
        ],
      );
      return { id: iid };
    },
    async getWorkspaceInviteByToken(token: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM workspace_invites WHERE token = $1", [
        token,
      ]);
      const row = rows[0] as Record<string, unknown> | undefined;
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
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM workspace_invites WHERE id = $1", [
        inviteId,
      ]);
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return false;
      if (workspaceId && row.workspace_id !== workspaceId) return false;
      await pool.query("DELETE FROM workspace_invites WHERE id = $1", [inviteId]);
      return true;
    },
    async listWorkspaceInvites(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query(
        "SELECT * FROM workspace_invites WHERE workspace_id = $1",
        [workspaceId],
      );
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
      await ensureSchema();
      const w = await adapter.getWorkspaceById(workspaceId);
      if (!w) return;
      await pool.query(`UPDATE workspaces SET name = $1, slug = $2 WHERE id = $3`, [
        input.name ?? w.name,
        input.slug ?? w.slug,
        workspaceId,
      ]);
    },
    async listWorkspaceMembers(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query(
        `SELECT m.*, u.email AS email FROM workspace_members m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = $1`,
        [workspaceId],
      );
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
      await ensureSchema();
      await pool.query(
        `UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
        [role, workspaceId, userId],
      );
    },
    async removeWorkspaceMember(workspaceId: string, userId: string) {
      await ensureSchema();
      await pool.query(
        `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId],
      );
    },
    async countWorkspaceOwners(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query<{ c: string | number }>(
        `SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'`,
        [workspaceId],
      );
      return Number(rows[0]?.c ?? 0);
    },
    async deleteWorkspace(workspaceId: string) {
      await ensureSchema();
      await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_invites WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    },
    async incrementUsage(workspaceId: string, period: string, field: string, by = 1) {
      await ensureSchema();
      const cur = await adapter.getUsage(workspaceId, period);
      const metrics = { ...(cur?.metrics ?? {}), [field]: ((cur?.metrics ?? {})[field] ?? 0) + by };
      await pool.query(
        `INSERT INTO usage_counters (workspace_id, period, metrics) VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, period) DO UPDATE SET metrics = EXCLUDED.metrics`,
        [workspaceId, period, JSON.stringify(metrics)],
      );
    },
    async getUsage(workspaceId: string, period: string) {
      await ensureSchema();
      const { rows } = await pool.query(
        `SELECT * FROM usage_counters WHERE workspace_id = $1 AND period = $2`,
        [workspaceId, period],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        workspace_id: workspaceId,
        period,
        metrics: parseJson<Record<string, number>>(row.metrics),
      } satisfies UsageCounterRecord;
    },
    async createApiKey(input: CreateApiKeyInput) {
      await ensureSchema();
      const kid = id();
      await pool.query(
        `INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_at, last_used_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)`,
        [
          kid,
          input.workspace_id,
          input.name,
          input.prefix,
          input.key_hash,
          JSON.stringify(input.scopes),
          nowIso(),
        ],
      );
      return { id: kid };
    },
    async listApiKeysForWorkspace(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM api_keys WHERE workspace_id = $1", [
        workspaceId,
      ]);
      return rows.map((row) => mapApiKey(row as Record<string, unknown>));
    },
    async listApiKeysByPrefix(prefix: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM api_keys WHERE prefix = $1", [prefix]);
      return rows.map((row) => mapApiKey(row as Record<string, unknown>));
    },
    async getApiKeyById(keyId: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM api_keys WHERE id = $1", [keyId]);
      return rows[0] ? mapApiKey(rows[0] as Record<string, unknown>) : null;
    },
    async revokeApiKey(keyId: string) {
      await ensureSchema();
      await pool.query("UPDATE api_keys SET revoked_at = $1 WHERE id = $2", [nowIso(), keyId]);
    },
    async touchApiKeyLastUsed(keyId: string) {
      await ensureSchema();
      await pool.query("UPDATE api_keys SET last_used_at = $1 WHERE id = $2", [nowIso(), keyId]);
    },
    async getReferralCodeByWorkspace(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM referral_codes WHERE workspace_id = $1", [
        workspaceId,
      ]);
      return rows[0] ? mapReferralCode(rows[0] as Record<string, unknown>) : null;
    },
    async getReferralCodeByCode(code: string) {
      await ensureSchema();
      const { rows } = await pool.query("SELECT * FROM referral_codes WHERE code = $1", [code]);
      return rows[0] ? mapReferralCode(rows[0] as Record<string, unknown>) : null;
    },
    async createReferralCode(input: CreateReferralCodeInput) {
      await ensureSchema();
      const rid = id();
      await pool.query(
        `INSERT INTO referral_codes (id, workspace_id, code, created_at, deactivated_at)
         VALUES ($1, $2, $3, $4, NULL)`,
        [rid, input.workspace_id, input.code, nowIso()],
      );
      return { id: rid };
    },
    async createReferralRedemption(input: CreateReferralRedemptionInput) {
      await ensureSchema();
      const rid = id();
      await pool.query(
        `INSERT INTO referral_redemptions
         (id, code, referrer_workspace_id, referee_workspace_id, referee_user_id, stripe_checkout_session_id, reward_granted, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
        [
          rid,
          input.code,
          input.referrer_workspace_id,
          input.referee_workspace_id,
          input.referee_user_id ?? null,
          input.stripe_checkout_session_id ?? null,
          nowIso(),
        ],
      );
      return { id: rid };
    },
    async listReferralRedemptionsForReferrer(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query(
        "SELECT * FROM referral_redemptions WHERE referrer_workspace_id = $1",
        [workspaceId],
      );
      return rows.map((row) => mapReferralRedemption(row as Record<string, unknown>));
    },
    async countReferralRedemptionsForReferee(workspaceId: string) {
      await ensureSchema();
      const { rows } = await pool.query<{ c: string | number }>(
        `SELECT COUNT(*) AS c FROM referral_redemptions WHERE referee_workspace_id = $1`,
        [workspaceId],
      );
      return Number(rows[0]?.c ?? 0);
    },
    async markReferralRewardGranted(redemptionId: string) {
      await ensureSchema();
      await pool.query(`UPDATE referral_redemptions SET reward_granted = 1 WHERE id = $1`, [
        redemptionId,
      ]);
    },
  };

  return adapter;
}
