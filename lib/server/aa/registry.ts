import "server-only";
import { createDirectoryCache, isEd25519PublicJwk, jwkThumbprint, type Ed25519PublicJwk, type ResolvedKey } from "@/lib/aa/verifier";
import { HttpError, newId } from "../auth";
import { db } from "../db";
import { trustedExternalDirectories } from "./util";

/**
 * The agent registry: operators register agents and their Ed25519 public keys.
 * Keys of non-suspended agents are published in this deployment's Web Bot Auth
 * directory, so any compliant verifier can check them without calling us.
 */

export const PURPOSES = ["assistant", "shopping", "search", "research", "monitoring", "other"] as const;
export const ACTUATIONS = ["hosted_browser", "user_browser", "api"] as const;
export const PRINCIPAL_MODELS = ["consumer_delegated", "enterprise", "autonomous"] as const;
export type AgentStatus = "pending" | "approved" | "suspended";

export interface AgentKey {
  kid: string;
  jwk: Ed25519PublicJwk;
  createdAt: string;
  revokedAt: string | null;
}

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  operator: string;
  contact: string;
  purpose: string;
  actuation: string;
  principalModel: string;
  ratePerMin: number;
  homepage: string;
  status: AgentStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  keys?: AgentKey[];
}

const COLS = `id, workspace_id as "workspaceId", name, operator, contact, purpose, actuation, principal_model as "principalModel",
  rate_per_min as "ratePerMin", homepage, status, review_note as "reviewNote", created_at as "createdAt", reviewed_at as "reviewedAt"`;

export interface AgentInput {
  name?: unknown;
  operator?: unknown;
  contact?: unknown;
  purpose?: unknown;
  actuation?: unknown;
  principalModel?: unknown;
  ratePerMin?: unknown;
  homepage?: unknown;
  publicJwk?: unknown;
}

const text = (v: unknown, field: string, max = 120) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new HttpError(400, `${field} is required`);
  return s.slice(0, max);
};
const oneOf = <T extends readonly string[]>(v: unknown, list: T, field: string): T[number] => {
  if (typeof v !== "string" || !list.includes(v)) throw new HttpError(400, `${field} must be one of ${list.join(", ")}`);
  return v as T[number];
};

export async function parseKey(jwk: unknown) {
  if (!isEd25519PublicJwk(jwk)) throw new HttpError(400, "publicJwk must be an Ed25519 public JWK ({kty:'OKP', crv:'Ed25519', x}) without the private part");
  const clean: Ed25519PublicJwk = { kty: "OKP", crv: "Ed25519", x: jwk.x };
  return { kid: await jwkThumbprint(clean), jwk: { ...clean, kid: await jwkThumbprint(clean) } };
}

export async function createAgent(workspaceId: string, input: AgentInput): Promise<Agent> {
  const rate = Number(input.ratePerMin ?? 60);
  if (!Number.isInteger(rate) || rate < 1 || rate > 10_000) throw new HttpError(400, "ratePerMin must be 1–10000");
  const homepage = typeof input.homepage === "string" ? input.homepage.trim().slice(0, 200) : "";
  if (homepage && !/^https:\/\//.test(homepage)) throw new HttpError(400, "homepage must be an https URL");
  const contact = text(input.contact, "Contact", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new HttpError(400, "Contact must be an email for abuse reports");
  const key = await parseKey(input.publicJwk);
  const a = {
    id: `agt_${newId(9)}`,
    name: text(input.name, "Name", 80),
    operator: text(input.operator, "Operator", 120),
    purpose: oneOf(input.purpose, PURPOSES, "purpose"),
    actuation: oneOf(input.actuation, ACTUATIONS, "actuation"),
    principalModel: oneOf(input.principalModel, PRINCIPAL_MODELS, "principalModel"),
  };
  const d = await db();
  const { rows: count } = await d.query<{ n: number }>("select count(*)::int as n from aa_agents where workspace_id = $1", [workspaceId]);
  if ((count[0]?.n ?? 0) >= 50) throw new HttpError(400, "A workspace can register up to 50 agents");
  await d.transaction(async (tx) => {
    const taken = await tx.query("select 1 from aa_keys where kid = $1", [key.kid]);
    if (taken.rows.length) throw new HttpError(409, "That key is already registered to an agent");
    await tx.query(
      `insert into aa_agents (id, workspace_id, name, operator, contact, purpose, actuation, principal_model, rate_per_min, homepage)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [a.id, workspaceId, a.name, a.operator, contact, a.purpose, a.actuation, a.principalModel, rate, homepage],
    );
    await tx.query("insert into aa_keys (kid, agent_id, jwk) values ($1, $2, $3)", [key.kid, a.id, JSON.stringify(key.jwk)]);
  });
  return (await getAgent(a.id, workspaceId))!;
}

async function withKeys(agents: Agent[]) {
  if (!agents.length) return agents;
  const { rows } = await (await db()).query<AgentKey & { agentId: string }>(
    `select kid, agent_id as "agentId", jwk, created_at as "createdAt", revoked_at as "revokedAt" from aa_keys where agent_id = any($1) order by created_at`,
    [agents.map((a) => a.id)],
  );
  for (const a of agents) a.keys = rows.filter((k) => k.agentId === a.id).map(({ agentId: _, ...k }) => k);
  return agents;
}

export async function getAgent(id: string, workspaceId?: string) {
  const { rows } = await (await db()).query<Agent>(
    `select ${COLS} from aa_agents where id = $1${workspaceId ? " and workspace_id = $2" : ""}`,
    workspaceId ? [id, workspaceId] : [id],
  );
  return rows[0] ? (await withKeys([rows[0]]))[0] : null;
}

export async function listAgents(workspaceId: string) {
  return withKeys((await (await db()).query<Agent>(`select ${COLS} from aa_agents where workspace_id = $1 order by created_at`, [workspaceId])).rows);
}

/** Registry admins review agents (KYB); owners can't approve their own. */
export async function listAgentsForReview() {
  return withKeys((await (await db()).query<Agent>(`select ${COLS} from aa_agents order by (status = 'pending') desc, created_at desc limit 200`)).rows);
}

export async function setAgentStatus(id: string, status: AgentStatus, note?: string) {
  const { rows } = await (await db()).query(
    "update aa_agents set status = $2, review_note = $3, reviewed_at = now() where id = $1 returning id",
    [id, status, note?.slice(0, 500) ?? null],
  );
  if (!rows.length) throw new HttpError(404, "Agent not found");
  kidCache.clear();
}

export async function deleteAgent(workspaceId: string, id: string) {
  const { rows } = await (await db()).query("delete from aa_agents where workspace_id = $1 and id = $2 returning id", [workspaceId, id]);
  if (!rows.length) throw new HttpError(404, "Agent not found");
  kidCache.clear();
}

export async function addKey(workspaceId: string, agentId: string, jwk: unknown) {
  if (!(await getAgent(agentId, workspaceId))) throw new HttpError(404, "Agent not found");
  const key = await parseKey(jwk);
  const d = await db();
  const active = await d.query<{ n: number }>("select count(*)::int as n from aa_keys where agent_id = $1 and revoked_at is null", [agentId]);
  if ((active.rows[0]?.n ?? 0) >= 5) throw new HttpError(400, "Revoke an old key first (max 5 active keys)");
  const taken = await d.query("select 1 from aa_keys where kid = $1", [key.kid]);
  if (taken.rows.length) throw new HttpError(409, "That key is already registered");
  await d.query("insert into aa_keys (kid, agent_id, jwk) values ($1, $2, $3)", [key.kid, agentId, JSON.stringify(key.jwk)]);
  return key.kid;
}

export async function revokeKey(workspaceId: string, agentId: string, kid: string) {
  const { rows } = await (await db()).query(
    `update aa_keys k set revoked_at = now() from aa_agents a
     where k.kid = $1 and k.agent_id = $2 and a.id = k.agent_id and a.workspace_id = $3 and k.revoked_at is null returning k.kid`,
    [kid, agentId, workspaceId],
  );
  if (!rows.length) throw new HttpError(404, "Active key not found");
  kidCache.delete(kid);
}

/** Keys this registry vouches for: active keys of agents that aren't suspended. */
export async function directoryKeys(agentId?: string) {
  const { rows } = await (await db()).query<{ jwk: Ed25519PublicJwk }>(
    `select k.jwk from aa_keys k join aa_agents a on a.id = k.agent_id
     where k.revoked_at is null and a.status <> 'suspended'${agentId ? " and a.id = $1" : ""} order by k.created_at`,
    agentId ? [agentId] : [],
  );
  return rows.map((r) => r.jwk);
}

/** Public Signature Agent Card (per the Web Bot Auth registry draft), no contact PII beyond the abuse inbox. */
export function agentCard(a: Agent, origin: string) {
  return {
    agent_id: a.id,
    client_name: a.name,
    operator: a.operator,
    purpose: a.purpose,
    actuation: a.actuation,
    principal_model: a.principalModel,
    rate_expectation: { requests_per_minute: a.ratePerMin },
    homepage: a.homepage || undefined,
    abuse_contact: a.contact,
    status: a.status,
    tier: a.status === "approved" ? "T3" : a.status === "pending" ? "T2" : "T1",
    signature_agent: origin,
    jwks_uri: `${origin}/r/${a.id}`,
    keys: (a.keys ?? []).filter((k) => !k.revokedAt).map((k) => k.jwk),
  };
}

/* ------------------------------ Key resolution ------------------------------ */

type KidRow = { jwk: Ed25519PublicJwk; revoked: boolean; agentId: string; status: AgentStatus; ratePerMin: number; name: string };
const kidCache = new Map<string, { at: number; row: KidRow | null }>();
const KID_TTL = 30_000;

async function lookupKid(kid: string): Promise<KidRow | null> {
  const hit = kidCache.get(kid);
  if (hit && Date.now() - hit.at < KID_TTL) return hit.row;
  const { rows } = await (await db()).query<KidRow>(
    `select k.jwk, (k.revoked_at is not null) as revoked, a.id as "agentId", a.status, a.rate_per_min as "ratePerMin", a.name
     from aa_keys k join aa_agents a on a.id = k.agent_id where k.kid = $1`,
    [kid],
  );
  const row = rows[0] ?? null;
  kidCache.set(kid, { at: Date.now(), row });
  return row;
}

let externalDirs: ReturnType<typeof createDirectoryCache> | null = null;
const external = () => (externalDirs ??= createDirectoryCache({ trustedOrigins: trustedExternalDirectories() }));

export interface KeyMeta {
  agentId?: string;
  agentName?: string;
  status?: AgentStatus;
  ratePerMin?: number;
  external?: string;
}

/** Our registry first (by thumbprint), then trusted external directories (Cloudflare, Visa, …). */
export async function resolveKey(keyid: string, signatureAgent: string | null): Promise<ResolvedKey | null> {
  const own = await lookupKid(keyid);
  if (own) {
    const meta: KeyMeta = { agentId: own.agentId, agentName: own.name, status: own.status, ratePerMin: own.ratePerMin };
    return { jwk: own.jwk, trusted: own.status !== "suspended", revoked: own.revoked, meta: meta as Record<string, unknown> };
  }
  const jwk = await external().find(keyid, signatureAgent);
  if (jwk) return { jwk, trusted: true, meta: { external: new URL(signatureAgent!).origin } };
  return null;
}

export const _resetRegistryCaches = () => {
  kidCache.clear();
  externalDirs = null;
};
