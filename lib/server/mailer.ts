import "server-only";

/**
 * Outbound email. Uses Resend (RESEND_API_KEY + EMAIL_FROM) when configured.
 * Without it, EMAIL_DRIVER=log prints messages instead (development only).
 */

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Same key → the provider sends at most once (safe retries). */
  idempotencyKey: string;
}

export type SendResult = { ok: true; id?: string; driver: "resend" | "log" } | { ok: false; error: string; retryable: boolean };

const env = (k: string) => process.env[k]?.trim() || undefined;

export function emailDriver(): "resend" | "log" | null {
  if (env("RESEND_API_KEY") && env("EMAIL_FROM")) return "resend";
  if (env("EMAIL_DRIVER") === "log") return "log";
  return null;
}

export const emailConfigured = () => emailDriver() !== null;

/** Public base URL for links in emails. */
export const appUrl = () => (env("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");

export async function sendEmail(e: Email): Promise<SendResult> {
  const driver = emailDriver();
  if (!driver) return { ok: false, error: "Email isn't configured on this server", retryable: false };
  if (driver === "log") {
    console.log(`[email] to=${e.to} subject="${e.subject}"\n${e.text}\n`);
    return { ok: true, driver };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": e.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: env("EMAIL_FROM"), to: [e.to], subject: e.subject, html: e.html, text: e.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (res.ok) return { ok: true, id: body.id, driver };
    // 429 and 5xx are worth retrying; 4xx (bad address, unverified domain) are not.
    return { ok: false, error: `Resend ${res.status}: ${body.message ?? body.name ?? res.statusText}`, retryable: res.status === 429 || res.status >= 500 };
  } catch (err) {
    return { ok: false, error: (err as Error).message, retryable: true };
  }
}
