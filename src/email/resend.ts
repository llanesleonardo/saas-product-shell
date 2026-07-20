export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult = { sent: boolean; skipped?: string };

export type EmailSenderDeps = {
  /** Default from address (overrides RESEND_FROM_EMAIL). */
  from?: string | (() => string | undefined);
  /** Optional warn logger when skipping. */
  onSkip?: (reason: string, input: SendEmailInput) => void;
  apiKey?: () => string | undefined;
};

/**
 * Resend email sender — product-agnostic. Skips when RESEND_API_KEY missing.
 */
export function createResendEmailSender(deps: EmailSenderDeps = {}) {
  return async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = deps.apiKey?.() ?? process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      deps.onSkip?.("RESEND_API_KEY", input);
      return { sent: false, skipped: "RESEND_API_KEY" };
    }

    const from =
      (typeof deps.from === "function" ? deps.from() : deps.from) ??
      process.env.RESEND_FROM_EMAIL ??
      "SaaS <onboarding@resend.dev>";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Resend returned HTTP ${response.status}`);
    }
    return { sent: true };
  };
}

/** Convenience singleton using env only. */
export const sendEmail = createResendEmailSender();
