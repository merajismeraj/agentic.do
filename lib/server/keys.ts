import "server-only";
import type { ProviderId } from "../types";
import { db } from "./db";
import { envKeys, type AiKeys } from "./providers";
import { deleteConnection, getConnection, setConnection, type Workspace } from "./workspace";

/**
 * Which credentials a workspace may use.
 *
 * Each workspace brings its own AI keys (stored sealed in `connections` as
 * `ai:<provider>`). The operator's server-wide keys — AI providers plus the
 * Slack/GitHub/Linear tokens — are only used for accounts allowed by
 * SHARED_AI_KEYS: "all", a comma-separated list of emails, or unset/"off".
 */

const PREFIX = "ai:";

export function sharedAllowed(email: string | undefined) {
  const v = process.env.SHARED_AI_KEYS?.trim().toLowerCase();
  if (!v || v === "off" || !email) return false;
  if (v === "all") return true;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export interface KeyInfo {
  source: "workspace" | "shared";
  /** Last 4 characters only; keys never leave the server. */
  hint: string;
}

export interface Access {
  keys: AiKeys;
  info: Partial<Record<ProviderId, KeyInfo>>;
  /** May use the operator's server-wide tool tokens (Slack, GitHub, Linear). */
  shared: boolean;
}

const hint = (k: string) => `…${k.slice(-4)}`;

async function ownerEmail(ws: Workspace) {
  const { rows } = await (await db()).query<{ email: string }>("select email from users where id = $1", [ws.ownerId]);
  return rows[0]?.email;
}

export async function accessFor(ws: Workspace): Promise<Access> {
  const shared = sharedAllowed(await ownerEmail(ws));
  const keys: AiKeys = {};
  const info: Access["info"] = {};
  if (shared)
    for (const [id, k] of Object.entries(envKeys())) {
      keys[id as ProviderId] = k;
      info[id as ProviderId] = { source: "shared", hint: hint(k!) };
    }
  // The workspace's own key always wins over a shared one.
  const { rows } = await (await db()).query<{ provider: string }>("select provider from connections where workspace_id = $1 and provider like 'ai:%'", [ws.id]);
  for (const { provider } of rows) {
    const id = provider.slice(PREFIX.length) as ProviderId;
    const conn = await getConnection<{ apiKey: string }>(ws.id, provider);
    if (!conn?.secret.apiKey) continue;
    keys[id] = conn.secret.apiKey;
    info[id] = { source: "workspace", hint: hint(conn.secret.apiKey) };
  }
  return { keys, info, shared };
}

export async function saveAiKey(ws: Workspace, id: ProviderId, apiKey: string) {
  await setConnection(ws.id, PREFIX + id, hint(apiKey), { apiKey });
}

export async function deleteAiKey(ws: Workspace, id: ProviderId) {
  await deleteConnection(ws.id, PREFIX + id);
}
