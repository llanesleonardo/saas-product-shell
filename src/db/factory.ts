import {
  createMemoryPlatformAdapter,
  type PlatformDatabaseAdapter,
} from "@llanesleonardo/saas-platform";
import { createPostgresPlatformAdapter } from "./postgres";
import { createSqlitePlatformAdapter } from "./sqlite";

export type ShellDbProvider = "memory" | "sqlite" | "postgres";

let cached: PlatformDatabaseAdapter | null = null;

export function createShellDb(options?: {
  provider?: ShellDbProvider;
  sqlitePath?: string;
  connectionString?: string;
  maxOwnedWorkspacesPerUser?: number;
}): PlatformDatabaseAdapter {
  const provider =
    options?.provider ??
    ((process.env.DATABASE_PROVIDER ?? "memory").toLowerCase() as ShellDbProvider);

  if (provider === "sqlite") {
    return createSqlitePlatformAdapter({
      path: options?.sqlitePath,
      maxOwnedWorkspacesPerUser: options?.maxOwnedWorkspacesPerUser,
    });
  }
  if (provider === "postgres") {
    return createPostgresPlatformAdapter({
      connectionString: options?.connectionString,
      maxOwnedWorkspacesPerUser: options?.maxOwnedWorkspacesPerUser,
    });
  }
  return createMemoryPlatformAdapter({
    maxOwnedWorkspacesPerUser: options?.maxOwnedWorkspacesPerUser,
  });
}

/** Process-wide singleton for Next route handlers. */
export function getShellDb(options?: Parameters<typeof createShellDb>[0]): PlatformDatabaseAdapter {
  if (!cached) cached = createShellDb(options);
  return cached;
}

export function resetShellDbForTests(): void {
  cached = null;
}

export {
  createMemoryPlatformAdapter,
  createPostgresPlatformAdapter,
  createSqlitePlatformAdapter,
};
export type { PlatformDatabaseAdapter };
