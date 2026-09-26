import "server-only";
import { sealingConfigured } from "./seal";
import { getConnection, setConnection, deleteConnection } from "./workspace";

/**
 * Google OAuth for two purposes: signing in (identity scopes only) and
 * connecting Gmail + Calendar to a workspace (tokens stored sealed in the DB,
 * so scheduled work can use them without a browser).
 */

export const STATE_COOKIE = "agentic_oauth_state";

const LOGIN_SCOPES = ["openid", "email", "profile"];
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

export type OAuthPurpose = "login" | "connect";

export interface GoogleTokens {
  refreshToken: string;
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
}

export interface GoogleAuth {
  email: string;
  accessToken: string;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

export function googleConfigured() {
  return !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") && sealingConfigured());
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeReturn(v: string | null | undefined, fallback = "/app/integrations") {
  return v && /^\/(?!\/)[\w\-/]*$/.test(v) ? v : fallback;
}

export function redirectUri(origin: string) {
  return env("GOOGLE_REDIRECT_URI") ?? `${origin}/api/auth/google/callback`;
}

export function authUrl(origin: string, state: string, purpose: OAuthPurpose, loginHint?: string) {
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID")!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: (purpose === "login" ? LOGIN_SCOPES : GOOGLE_SCOPES).join(" "),
    state,
    ...(purpose === "connect" ? { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } : { prompt: "select_account" }),
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID")!, client_secret: env("GOOGLE_CLIENT_SECRET")!, ...params }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(`Google token: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export async function exchangeCode(code: string, origin: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read without re-verifying.
  const c = t.id_token
    ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()) as { sub?: string; email?: string; name?: string; email_verified?: boolean })
    : {};
  if (!c.sub || !c.email) throw new Error("Google didn't return an account identity");
  const identity: GoogleIdentity = { sub: c.sub, email: c.email, name: c.name ?? c.email.split("@")[0], emailVerified: c.email_verified === true };
  const tokens: GoogleTokens | null = t.refresh_token
    ? { refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 }
    : null;
  return { identity, tokens, scope: t.scope ?? "" };
}

export async function revoke(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

/** The workspace's Google connection as a usable access token, refreshed and persisted when near expiry. */
export async function googleAuthFor(workspaceId: string): Promise<GoogleAuth | undefined> {
  if (!googleConfigured()) return undefined;
  const conn = await getConnection<GoogleTokens>(workspaceId, "google");
  if (!conn) return undefined;
  const t = conn.secret;
  if (t.expiresAt - Date.now() > 60_000) return { email: conn.account, accessToken: t.accessToken };
  try {
    const r = await tokenRequest({ refresh_token: t.refreshToken, grant_type: "refresh_token" });
    const next: GoogleTokens = { ...t, accessToken: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
    await setConnection(workspaceId, "google", conn.account, next);
    return { email: conn.account, accessToken: next.accessToken };
  } catch {
    // Revoked or expired refresh token: drop it so the UI asks to reconnect.
    await deleteConnection(workspaceId, "google");
    return undefined;
  }
}

/* ------------------------------ API calls -------------------------- */

async function gapi<T>(auth: GoogleAuth, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${auth.accessToken}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Google ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary";

export async function gmailSearch(auth: GoogleAuth, query: string, max = 8) {
  const list = await gapi<{ messages?: { id: string; threadId: string }[] }>(
    auth,
    `${GMAIL}/messages?${new URLSearchParams({ q: query, maxResults: String(Math.min(max, 15)) })}`,
  );
  const ids = list.messages ?? [];
  return Promise.all(
    ids.map(async ({ id, threadId }) => {
      const m = await gapi<{ snippet: string; payload: { headers: { name: string; value: string }[] } }>(
        auth,
        `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
      );
      const h = (n: string) => m.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      return { id, thread_id: threadId, message_id: h("Message-ID"), from: h("From"), subject: h("Subject"), date: h("Date"), snippet: m.snippet };
    }),
  );
}

/** RFC 2047 encoding so non-ASCII subjects survive. */
const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`);
const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

export async function gmailSend(
  auth: GoogleAuth,
  msg: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string },
) {
  const headers = [
    `From: ${clean(auth.email)}`,
    `To: ${clean(msg.to)}`,
    `Subject: ${encodeHeader(clean(msg.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    ...(msg.inReplyTo ? [`In-Reply-To: ${clean(msg.inReplyTo)}`, `References: ${clean(msg.inReplyTo)}`] : []),
  ];
  const raw = `${headers.join("\r\n")}\r\n\r\n${Buffer.from(msg.body, "utf8").toString("base64")}`;
  return gapi<{ id: string; threadId: string }>(auth, `${GMAIL}/messages/send`, {
    method: "POST",
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url"), ...(msg.threadId ? { threadId: msg.threadId } : {}) }),
  });
}

/** YYYY-MM-DD for "today", "tomorrow" or an ISO date, in the user's timezone. */
export function resolveDay(day: string, timeZone: string, now = new Date()) {
  const d = day.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const offset = d === "tomorrow" ? 1 : d === "yesterday" ? -1 : 0;
  return new Date(now.getTime() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone });
}

export async function calendarDay(auth: GoogleAuth, day: string, timeZone: string) {
  const date = resolveDay(day, timeZone);
  // Query a padded UTC window, then keep events whose start falls on `date` in the user's timezone.
  const start = new Date(`${date}T00:00:00Z`).getTime();
  const q = new URLSearchParams({
    timeMin: new Date(start - 86_400_000).toISOString(),
    timeMax: new Date(start + 2 * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const res = await gapi<{
    items?: { summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; attendees?: { email: string }[]; hangoutLink?: string }[];
  }>(auth, `${CAL}/events?${q}`);
  const localDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
  const localTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });
  const events = (res.items ?? [])
    .filter((e) => (e.start.dateTime ? localDate(e.start.dateTime) === date : e.start.date === date))
    .map((e) => ({
      title: e.summary ?? "(no title)",
      start: e.start.dateTime ? localTime(e.start.dateTime) : "all day",
      end: e.end.dateTime ? localTime(e.end.dateTime) : undefined,
      attendees: e.attendees?.map((a) => a.email),
      meet: e.hangoutLink,
    }));
  return { date, events };
}

export async function calendarCreate(
  auth: GoogleAuth,
  ev: { title: string; start: string; durationMinutes: number; guests: string[]; timeZone: string },
) {
  // `start` is local wall-clock time (e.g. 2026-10-01T10:00); Google applies `timeZone`.
  const local = ev.start.replace(/(Z|[+-]\d{2}:?\d{2})$/, "").slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error(`Start time must look like 2026-10-01T10:00, got “${ev.start}”`);
  const [date, time] = local.split("T");
  const [h, m] = time.split(":").map(Number);
  const endMin = h * 60 + m + ev.durationMinutes;
  const endDate = new Date(`${date}T00:00:00Z`);
  endDate.setUTCMinutes(endMin);
  const end = endDate.toISOString().slice(0, 16);
  return gapi<{ htmlLink: string; id: string }>(auth, `${CAL}/events?sendUpdates=all`, {
    method: "POST",
    body: JSON.stringify({
      summary: ev.title,
      start: { dateTime: `${local}:00`, timeZone: ev.timeZone },
      end: { dateTime: `${end}:00`, timeZone: ev.timeZone },
      attendees: ev.guests.filter(Boolean).map((email) => ({ email })),
    }),
  });
}

