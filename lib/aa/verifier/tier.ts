import type { VerifyResult } from "./httpsig";

/**
 * Trust tiers (see PRD):
 *  T0 Unknown     – no declaration; behavioural score only
 *  T1 Declared    – self-declared automation (user agent) or a signature we can't vouch for
 *  T2 Signed      – valid Web Bot Auth signature from a trusted directory
 *  T3 Registered  – T2 + registered in our registry with operator review passed
 *  T4 Delegated   – T3 + per-task delegation credential (not issued in v0)
 */
export type Tier = "T0" | "T1" | "T2" | "T3" | "T4";
export const TIERS: Tier[] = ["T0", "T1", "T2", "T3", "T4"];
export const TIER_LABEL: Record<Tier, string> = {
  T0: "Unknown",
  T1: "Declared",
  T2: "Signed",
  T3: "Registered",
  T4: "Delegated",
};
export const tierRank = (t: Tier) => TIERS.indexOf(t);
export const maxTier = (a: Tier, b: Tier) => (tierRank(a) >= tierRank(b) ? a : b);

/** User-agent tokens of automation that announces itself. Case-insensitive substring match. */
const DECLARED_UA = [
  "chatgpt-user",
  "gptbot",
  "oai-searchbot",
  "claude-user",
  "claudebot",
  "claude-searchbot",
  "perplexity-user",
  "perplexitybot",
  "google-extended",
  "googleother",
  "google-agent",
  "googlebot",
  "bingbot",
  "applebot",
  "amazonbot",
  "meta-externalagent",
  "bytespider",
  "ccbot",
  "duckassistbot",
  "mistralai-user",
  "headlesschrome",
  "playwright",
  "puppeteer",
  "python-requests",
  "python-httpx",
  "aiohttp",
  "curl/",
  "wget/",
  "go-http-client",
  "node-fetch",
  "undici",
  "axios/",
  "okhttp",
];

export function declaredAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const hit = DECLARED_UA.find((t) => ua.includes(t));
  if (hit) return hit.replace(/\/$/, "");
  if (/\b(bot|crawler|spider|agent)\b/.test(ua)) return "generic-bot";
  return null;
}

export interface TierInput {
  verify: VerifyResult;
  userAgent?: string | null;
  /** Registry status of the agent owning the key (when the key is in our registry). */
  registryStatus?: "pending" | "approved" | "suspended" | null;
  delegated?: boolean;
}

export function assignTier({ verify, userAgent, registryStatus, delegated }: TierInput): Tier {
  if (verify.status === "valid") {
    if (registryStatus === "approved") return delegated ? "T4" : "T3";
    if (registryStatus === "suspended") return "T1";
    return "T2";
  }
  // A signature that failed still declares automation; so does an honest user agent.
  if (verify.status === "invalid") return "T1";
  return declaredAgent(userAgent) ? "T1" : "T0";
}

export type Decision = "allow" | "rate_limit" | "challenge";

/**
 * Default site policy. Behavioural scores never hard-block (assistive tech can look
 * agent-like); only a failed identity claim or a declared rate overrun adds friction.
 */
export function decide(p: { tier: Tier; verify: VerifyResult; overRate?: boolean }): Decision {
  if (p.verify.status === "invalid" && p.verify.reason !== "untrusted_directory" && p.verify.reason !== "unknown_key") return "challenge";
  if (p.overRate) return "rate_limit";
  return "allow";
}
