import "server-only";

/** "Continue with Google": identity scopes only; no Google tokens are stored. */

export const STATE_COOKIE = "agentic_oauth_state";
const LOGIN_SCOPES = ["openid", "email", "profile"];

const env = (k: string) => process.env[k]?.trim() || undefined;

export function googleConfigured() {
  return !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeReturn(v: string | null | undefined, fallback = "/app") {
  return v && /^\/(?!\/)[\w\-/]*$/.test(v) ? v : fallback;
}

export function redirectUri(origin: string) {
  return env("GOOGLE_REDIRECT_URI") ?? `${origin}/api/auth/google/callback`;
}

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID")!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: LOGIN_SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export async function exchangeCode(code: string, origin: string): Promise<GoogleIdentity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID")!,
      client_secret: env("GOOGLE_CLIENT_SECRET")!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
    }),
  });
  const t = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || t.error) throw new Error(`Google token: ${t.error_description ?? t.error ?? res.status}`);
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read without re-verifying.
  const c = t.id_token
    ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()) as { sub?: string; email?: string; name?: string; email_verified?: boolean })
    : {};
  if (!c.sub || !c.email) throw new Error("Google didn't return an account identity");
  return { sub: c.sub, email: c.email, name: c.name ?? c.email.split("@")[0], emailVerified: c.email_verified === true };
}
