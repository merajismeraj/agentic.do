import "server-only";
import { assignTier, decide, declaredAgent, verifyRequest, type Decision, type RequestLike, type Tier, type VerifyResult } from "@/lib/aa/verifier";
import { newId } from "../auth";
import { db } from "../db";
import { resolveKey, type KeyMeta } from "./registry";
import type { Site } from "./sites";
import { hmac, ipHash, safeEqual } from "./util";

/**
 * Server-side verification for a tracked site: checks the Web Bot Auth
 * signature, assigns a trust tier, applies the default policy, logs the
 * request, and mints a short-lived verification token (vt) the page hands to
 * the SDK so browser sessions inherit the request's verified identity.
 */

export interface Verdict {
  tier: Tier;
  decision: Decision;
  verify: VerifyResult;
  agent: { id: string; name: string; status: string } | null;
  external: string | null;
  declared: string | null;
  vt: string;
}

/** Nonces are single-use across instances (unique key in Postgres). */
async function checkNonce(keyid: string, nonce: string, expires: number) {
  const d = await db();
  if (Math.random() < 0.02) await d.query("delete from aa_nonces where expires_at < now()");
  const { rows } = await d.query(
    "insert into aa_nonces (key, expires_at) values ($1, to_timestamp($2)) on conflict (key) do nothing returning key",
    [`${keyid}:${nonce}`.slice(0, 300), expires + 60],
  );
  return rows.length > 0;
}

async function overRate(siteId: string, agentId: string, perMin: number) {
  const { rows } = await (await db()).query<{ n: number }>(
    "select count(*)::int as n from aa_requests where site_id = $1 and agent_id = $2 and at > now() - interval '60 seconds'",
    [siteId, agentId],
  );
  return (rows[0]?.n ?? 0) >= perMin;
}

export interface VerifyOptions {
  /** Path to record instead of the request's own (the SDK's requests record the page they came from). */
  logPath?: string;
  /** Record requests that carry no signature (default true). */
  logUnsigned?: boolean;
}

export async function verifyForSite(site: Site, req: RequestLike & { ip?: string | null }, opts: VerifyOptions = {}): Promise<Verdict> {
  const verify = await verifyRequest(req, { resolveKey, checkNonce });
  const meta = (verify.status === "valid" ? verify.meta : undefined) as KeyMeta | undefined;
  const ua =
    req.headers instanceof Headers
      ? req.headers.get("user-agent")
      : ((Object.entries(req.headers).find(([k]) => k.toLowerCase() === "user-agent")?.[1] as string | undefined) ?? null);
  const tier = assignTier({ verify, userAgent: ua, registryStatus: meta?.status ?? null });
  const agentId = meta?.agentId ?? null;
  const rate = agentId && meta?.ratePerMin ? await overRate(site.id, agentId, meta.ratePerMin) : false;
  const decision = decide({ tier, verify, overRate: rate });
  const declared = declaredAgent(ua);
  let path = opts.logPath ?? "/";
  if (!opts.logPath)
    try {
      const u = new URL(req.url);
      path = (u.pathname + u.search).slice(0, 500);
    } catch {
      /* keep "/" */
    }

  if (verify.status !== "absent" || opts.logUnsigned !== false)
    await (await db()).query(
    `insert into aa_requests (id, site_id, method, path, tier, decision, verify_status, verify_reason, keyid, directory, agent_id, declared, ua, ip_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      newId(),
      site.id,
      req.method.toUpperCase().slice(0, 10),
      path,
      tier,
      decision,
      verify.status,
      verify.status === "invalid" ? verify.reason : null,
      verify.status === "absent" ? null : (verify.keyid ?? null),
      verify.status === "absent" ? null : (verify.directory ?? null)?.slice(0, 300),
      agentId,
      declared,
      ua?.slice(0, 300) ?? null,
      ipHash(req.ip),
    ],
  );

  return {
    tier,
    decision,
    verify,
    agent: agentId ? { id: agentId, name: meta?.agentName ?? agentId, status: meta?.status ?? "pending" } : null,
    external: meta?.external ?? null,
    declared,
    vt: mintVt({ s: site.id, t: tier, a: agentId, e: Math.floor(Date.now() / 1000) + 30 * 60 }),
  };
}

/* ------------------------------ Verification token ------------------------------ */

interface VtClaims {
  s: string; // site id
  t: Tier;
  a: string | null; // agent id
  e: number; // expiry (unix seconds)
}

export function mintVt(c: VtClaims) {
  const body = Buffer.from(JSON.stringify(c)).toString("base64url");
  return `${body}.${hmac("aa-vt", body)}`;
}

export function readVt(vt: string | undefined, siteId: string): VtClaims | null {
  if (!vt || vt.length > 600) return null;
  const [body, mac] = vt.split(".");
  if (!body || !mac || !safeEqual(mac, hmac("aa-vt", body))) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as VtClaims;
    if (c.s !== siteId || c.e < Date.now() / 1000) return null;
    return c;
  } catch {
    return null;
  }
}
