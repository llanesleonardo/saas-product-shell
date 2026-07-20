import type { PlatformDatabaseAdapter, UserRecord } from "@llanesleonardo/saas-platform";

export function isClerkConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && env.CLERK_SECRET_KEY?.trim(),
  );
}

export type ClerkAuthFns = {
  auth: () => Promise<{ userId: string | null }>;
  currentUser: () => Promise<{
    primaryEmailAddress?: { emailAddress?: string | null } | null;
    emailAddresses?: Array<{ emailAddress?: string | null }>;
  } | null>;
};

export type PublicShellUser = {
  id: string;
  email: string;
  role: UserRecord["role"];
};

/**
 * T-01 IdP — resolve Clerk session → platform user via resolveOrCreateIdpUser.
 * Product injects Clerk server APIs so @clerk/nextjs stays a peer/optional dep.
 */
export async function resolveClerkAppUser(
  db: PlatformDatabaseAdapter,
  clerk: ClerkAuthFns,
): Promise<PublicShellUser | null> {
  if (!isClerkConfigured()) return null;

  const { userId } = await clerk.auth();
  if (!userId) return null;

  const clerkUser = await clerk.currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    `${userId}@users.clerk`;

  const user = await db.resolveOrCreateIdpUser(email, userId);
  return { id: user.id, email: user.email, role: user.role };
}
