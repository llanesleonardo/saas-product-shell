import {
  PLATFORM_PACKAGE_VERSION,
  registerApiKeyScopes,
  registerFeatures,
  registerQuotas,
  registerUsageMetrics,
  setPlatformConfig,
} from "@llanesleonardo/saas-platform";

export type ShellRegistrationInput = {
  productName: string;
  apiKeyPrefix: string;
  workspaceCookieName?: string;
  supportEmail?: string;
  scopes?: readonly string[];
  features?: readonly string[];
  quotas?: readonly string[];
  metrics?: readonly string[];
};

const registered = new Set<string>();

/**
 * T-07 — Boot chassis registries for a product (idempotent per productName).
 */
export function createShellRegistration(input: ShellRegistrationInput): {
  ensureRegistered: () => void;
  linkedPlatformVersion: string;
} {
  const key = input.productName;
  return {
    linkedPlatformVersion: PLATFORM_PACKAGE_VERSION,
    ensureRegistered() {
      if (registered.has(key)) return;
      setPlatformConfig({
        productName: input.productName,
        apiKeyPrefix: input.apiKeyPrefix,
        workspaceCookieName: input.workspaceCookieName,
        supportEmail: input.supportEmail,
      });
      if (input.scopes?.length) registerApiKeyScopes(input.scopes);
      if (input.features?.length) registerFeatures(input.features);
      if (input.quotas?.length) registerQuotas(input.quotas);
      if (input.metrics?.length) registerUsageMetrics(input.metrics);
      registered.add(key);
    },
  };
}

export { PLATFORM_PACKAGE_VERSION };
