import "server-only";
import { sealingConfigured } from "./seal";
import { deleteConnection, getConnection, setConnection } from "./workspace";

/**
 * Slack "Add to Slack" (OAuth v2) per workspace, plus a small Web API client.
 * The bot token is stored sealed in `connections` as provider "slack".
 */

export const SLACK_STATE_COOKIE = "agentic_slack_state";

/** Bot scopes: read and post in channels, auto-join public ones, resolve people's names. */
export const SLACK_SCOPES = ["channels:read", "channels:history", "channels:join", "groups:read", "groups:history", "chat:write", "users:read"];

export interface SlackInstall {
  botToken: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  scope: string;
}

export interface SlackAuth {
  token: string;
  team: string;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

export function slackConfigured() {
  return !!(env("SLACK_CLIENT_ID") && env("SLACK_CLIENT_SECRET") && sealingConfigured());
}

/** Slack only accepts HTTPS redirect URLs, so this prefers APP_URL (use a tunnel such as ngrok locally). */
export function slackRedirectUri(origin: string) {
  return env("SLACK_REDIRECT_URI") ?? `${(env("APP_URL") ?? origin).replace(/\/+$/, "")}/api/auth/slack/callback`;
}

export function slackAuthUrl(origin: string, state: string) {
  const p = new URLSearchParams({ client_id: env("SLACK_CLIENT_ID")!, scope: SLACK_SCOPES.join(","), redirect_uri: slackRedirectUri(origin), state });
  return `https://slack.com/oauth/v2/authorize?${p}`;
}

export class SlackError extends Error {
  constructor(
    public method: string,
    public code: string,
  ) {
    super(`Slack ${method}: ${code}`);
  }
}

/** Calls a Web API method. Form-encoded, which every method accepts (JSON bodies are ignored by some read methods). */
export async function slackApi<T = Record<string, unknown>>(token: string | null, method: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  });
  const json = (await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))) as { ok: boolean; error?: string } & T;
  if (!json.ok) throw new SlackError(method, json.error ?? `http_${res.status}`);
  return json;
}

export async function exchangeSlackCode(code: string, origin: string): Promise<SlackInstall> {
  const r = await slackApi<{ access_token: string; token_type: string; scope: string; bot_user_id: string; team: { id: string; name: string } }>(null, "oauth.v2.access", {
    client_id: env("SLACK_CLIENT_ID"),
    client_secret: env("SLACK_CLIENT_SECRET"),
    code,
    redirect_uri: slackRedirectUri(origin),
  });
  if (r.token_type !== "bot" || !r.access_token?.startsWith("xoxb-")) throw new Error("Slack didn't return a bot token");
  return { botToken: r.access_token, teamId: r.team.id, teamName: r.team.name, botUserId: r.bot_user_id, scope: r.scope };
}

export async function saveSlack(workspaceId: string, install: SlackInstall) {
  await setConnection(workspaceId, "slack", install.teamName, install);
}

export async function slackAuthFor(workspaceId: string): Promise<SlackAuth | undefined> {
  const conn = await getConnection<SlackInstall>(workspaceId, "slack");
  return conn ? { token: conn.secret.botToken, team: conn.secret.teamName } : undefined;
}

/** Revokes the bot token at Slack (uninstalling the bot) and forgets it. */
export async function disconnectSlack(workspaceId: string) {
  const conn = await getConnection<SlackInstall>(workspaceId, "slack");
  if (conn) await slackApi(conn.secret.botToken, "auth.revoke").catch(() => {});
  await deleteConnection(workspaceId, "slack");
}

/* ------------------------------ Helpers used by tools ------------------------------ */

/** Resolves "#eng", "eng" or a channel ID, paging through the workspace's channels. */
export async function channelId(token: string, name: string) {
  const clean = name.trim().replace(/^#/, "");
  if (/^[CG][A-Z0-9]{6,}$/.test(clean)) return clean;
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await slackApi<{ channels: { id: string; name: string }[]; response_metadata?: { next_cursor?: string } }>(token, "conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 1000,
      cursor,
    });
    const hit = r.channels.find((c) => c.name === clean.toLowerCase());
    if (hit) return hit.id;
    cursor = r.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  throw new Error(`Couldn't find #${clean}. For a private channel, invite the agentic.do bot first (/invite @agentic.do).`);
}

/** Recent messages with author names; joins public channels automatically when the bot isn't in them yet. */
export async function readChannel(token: string, channel: string, limit: number) {
  const id = await channelId(token, channel);
  const history = () => slackApi<{ messages: { user?: string; bot_id?: string; text: string; ts: string }[] }>(token, "conversations.history", { channel: id, limit });
  let h;
  try {
    h = await history();
  } catch (e) {
    if (!(e instanceof SlackError) || e.code !== "not_in_channel") throw e;
    await slackApi(token, "conversations.join", { channel: id });
    h = await history();
  }
  const names = new Map<string, string>();
  for (const uid of [...new Set(h.messages.map((m) => m.user).filter(Boolean) as string[])].slice(0, 25)) {
    try {
      const u = await slackApi<{ user: { real_name?: string; name: string; profile?: { display_name?: string } } }>(token, "users.info", { user: uid });
      names.set(uid, u.user.profile?.display_name || u.user.real_name || u.user.name);
    } catch {
      names.set(uid, uid);
    }
  }
  return h.messages.map((m) => ({ from: m.user ? (names.get(m.user) ?? m.user) : "bot", text: m.text, at: new Date(Number(m.ts) * 1000).toISOString() }));
}

export async function postMessage(token: string, channel: string, text: string) {
  const id = await channelId(token, channel);
  const post = () => slackApi<{ ts: string; channel: string }>(token, "chat.postMessage", { channel: id, text });
  try {
    return await post();
  } catch (e) {
    if (!(e instanceof SlackError) || e.code !== "not_in_channel") throw e;
    await slackApi(token, "conversations.join", { channel: id });
    return post();
  }
}
