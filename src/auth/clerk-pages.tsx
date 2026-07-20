import type { ReactNode } from "react";

export type ClerkSignInPageProps = {
  /** When Clerk env is missing, render this fallback (link to /login, etc.). */
  fallback?: ReactNode;
  /** Path for Clerk SignIn (default /sign-in). */
  path?: string;
  signUpUrl?: string;
};

export type ClerkSignUpPageProps = {
  fallback?: ReactNode;
  path?: string;
  signInUrl?: string;
};

/**
 * Factory that returns page components for Clerk catch-all routes.
 * Product injects `@clerk/nextjs` SignIn/SignUp so the shell stays peer-optional.
 *
 * Usage in `app/sign-in/[[...sign-in]]/page.tsx`:
 *   export default createClerkSignInPage({ SignIn })();
 */
export function createClerkSignInPage(opts: {
  SignIn: (props: { routing: "path"; path: string; signUpUrl: string }) => ReactNode;
  isConfigured?: () => boolean;
  fallback?: ReactNode;
  path?: string;
  signUpUrl?: string;
}) {
  const isConfigured =
    opts.isConfigured ??
    (() =>
      Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
          process.env.CLERK_SECRET_KEY?.trim(),
      ));

  return function ClerkSignInPage() {
    if (!isConfigured()) {
      return opts.fallback ?? null;
    }
    return opts.SignIn({
      routing: "path",
      path: opts.path ?? "/sign-in",
      signUpUrl: opts.signUpUrl ?? "/sign-up",
    });
  };
}

export function createClerkSignUpPage(opts: {
  SignUp: (props: { routing: "path"; path: string; signInUrl: string }) => ReactNode;
  isConfigured?: () => boolean;
  fallback?: ReactNode;
  path?: string;
  signInUrl?: string;
}) {
  const isConfigured =
    opts.isConfigured ??
    (() =>
      Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
          process.env.CLERK_SECRET_KEY?.trim(),
      ));

  return function ClerkSignUpPage() {
    if (!isConfigured()) {
      return opts.fallback ?? null;
    }
    return opts.SignUp({
      routing: "path",
      path: opts.path ?? "/sign-up",
      signInUrl: opts.signInUrl ?? "/sign-in",
    });
  };
}
