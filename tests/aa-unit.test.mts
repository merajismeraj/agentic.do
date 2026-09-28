/**
 * Unit tests for agent analytics: Web Bot Auth signing/verification, trust
 * tiers, and the behavioural scorer on synthetic sessions.
 *   npx tsx tests/aa-unit.test.mts
 */
import assert from "node:assert/strict";
import { agentSession, humanSession, hybridSession, scriptedBotSession } from "./aa-synth.mts";

const mod = async <T,>(p: string): Promise<T> => {
  const m = await import(new URL(p, import.meta.url).href);
  return (m.default ?? m) as T;
};
type HttpSig = typeof import("../lib/aa/verifier/httpsig.ts");
type TierMod = typeof import("../lib/aa/verifier/tier.ts");
type Scoring = typeof import("../lib/aa/scoring.ts");
type Dir = typeof import("../lib/aa/verifier/directory.ts");
type B64 = typeof import("../lib/aa/verifier/b64.ts");
const sig = await mod<HttpSig>("../lib/aa/verifier/httpsig.ts");
const tiers = await mod<TierMod>("../lib/aa/verifier/tier.ts");
const scoring = await mod<Scoring>("../lib/aa/scoring.ts");
const dir = await mod<Dir>("../lib/aa/verifier/directory.ts");
const b64 = await mod<B64>("../lib/aa/verifier/b64.ts");

let step = 0;
const ok = (name: string) => console.log(`✓ ${++step}. ${name}`);

/* ----------------------------- RFC 9421 vector ----------------------------- */
{
  // RFC 9421 Appendix B.2.6: Ed25519 signature over a POST request, test-key-ed25519.
  const req = {
    method: "POST",
    url: "https://example.com/foo?param=Value&Pet=dog",
    headers: {
      date: "Tue, 20 Apr 2021 02:07:55 GMT",
      "content-type": "application/json",
      "content-length": "18",
    },
  };
  const params = `("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"`;
  const comps = ["date", "@method", "@path", "@authority", "content-type", "content-length"].map((name) => ({ name, params: {} }));
  const base = sig.signatureBase(req, comps, params);
  assert.equal(
    base,
    [
      `"date": Tue, 20 Apr 2021 02:07:55 GMT`,
      `"@method": POST`,
      `"@path": /foo`,
      `"@authority": example.com`,
      `"content-type": application/json`,
      `"content-length": 18`,
      `"@signature-params": ${params}`,
    ].join("\n"),
  );
  const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs" }, { name: "Ed25519" }, false, ["verify"]);
  const expected = "wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==";
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, key, Uint8Array.from(atob(expected), (c) => c.charCodeAt(0)), new TextEncoder().encode(base));
  assert.ok(valid, "RFC 9421 B.2.6 Ed25519 test vector verifies");
  ok("signature base and Ed25519 match the RFC 9421 test vector (B.2.6)");
}

/* ------------------------------ Sign / verify ------------------------------ */

const k = await sig.generateAgentKey();
assert.equal(k.kid, await sig.jwkThumbprint(k.publicJwk));
assert.equal(k.kid.length, 43);
const url = "https://shop.test/p/1?q=1";
const resolve = async (id: string) => (id === k.kid ? { jwk: k.publicJwk, trusted: true, meta: { agentId: "a1" } } : null);
const headers = await sig.signRequest({ method: "GET", url }, { key: k.privateJwk, keyid: k.kid, signatureAgent: "https://registry.test" });
assert.match(headers["signature-input"], /^sig1=\("@authority" "signature-agent"\);created=\d+;expires=\d+;keyid="[\w-]{43}";alg="ed25519";nonce="[\w-]+";tag="web-bot-auth"$/);

let r = await sig.verifyRequest({ method: "GET", url, headers }, { resolveKey: resolve });
assert.equal(r.status, "valid");
assert.equal(r.status === "valid" && r.directory, "https://registry.test");
assert.deepEqual(r.status === "valid" && r.meta, { agentId: "a1" });
ok("an agent-signed request verifies; keyid is the RFC 7638 thumbprint");

const bad = async (req: { url?: string; headers?: Record<string, string> }, opts: Partial<Parameters<HttpSig["verifyRequest"]>[1]> = {}) => {
  const out = await sig.verifyRequest({ method: "GET", url: req.url ?? url, headers: req.headers ?? headers }, { resolveKey: resolve, ...opts });
  return out.status === "invalid" ? out.reason : out.status;
};
assert.equal(await bad({ url: "https://evil.test/p/1" }), "bad_signature");
assert.equal(await bad({ headers: { ...headers, "signature-agent": '"https://other.test"' } }), "bad_signature");
assert.equal(await bad({ headers: { ...headers, signature: headers.signature.replace(/:(.)/, ":A") } }), "bad_signature");
assert.equal(await bad({}, { now: Math.floor(Date.now() / 1000) + 3600 }), "expired");
assert.equal(await bad({}, { now: Math.floor(Date.now() / 1000) - 3600 }), "not_yet_valid");
assert.equal(await bad({}, { resolveKey: async () => null }), "unknown_key");
assert.equal(await bad({}, { resolveKey: async () => ({ jwk: k.publicJwk, trusted: false }) }), "untrusted_directory");
assert.equal(await bad({}, { resolveKey: async () => ({ jwk: k.publicJwk, trusted: true, revoked: true }) }), "revoked_key");
assert.equal(await bad({ headers: { "signature-input": headers["signature-input"] } }), "malformed");
assert.equal(await bad({ headers: { "user-agent": "x" } }), "absent");
ok("tampered host, header or signature, expired, future, unknown, untrusted and revoked keys all fail with a reason");

{
  const long = await sig.signRequest({ method: "GET", url }, { key: k.privateJwk, keyid: k.kid, ttl: 7200 });
  assert.equal(await bad({ headers: long }), "validity_too_long");
  const other = await sig.signRequest({ method: "GET", url }, { key: k.privateJwk, keyid: k.kid, tag: "something-else" });
  assert.equal(await bad({ headers: other }), "wrong_tag");
  const noAgent = await sig.signRequest({ method: "GET", url }, { key: k.privateJwk, keyid: k.kid });
  assert.equal(await bad({ headers: { ...noAgent, "signature-agent": '"https://sneaky.test"' } }), "signature_agent_not_covered");
  const seen = new Set<string>();
  const checkNonce = async (id: string, n: string) => (seen.has(id + n) ? false : (seen.add(id + n), true));
  assert.equal(await bad({ headers: noAgent }, { checkNonce }), "valid");
  assert.equal(await bad({ headers: noAgent }, { checkNonce }), "replay");
  // A forged request must not burn a legitimate nonce.
  const fresh = await sig.signRequest({ method: "GET", url }, { key: k.privateJwk, keyid: k.kid });
  assert.equal(await bad({ url: "https://evil.test/", headers: fresh }, { checkNonce }), "bad_signature");
  assert.equal(await bad({ headers: fresh }, { checkNonce }), "valid");
  ok("long validity, wrong tag, unsigned Signature-Agent and nonce replay are rejected; forgeries don't consume nonces");
}

{
  // Dictionary-form Signature-Agent (newer drafts): sig1="https://…" with "signature-agent";key="sig1" covered.
  const created = Math.floor(Date.now() / 1000);
  const params = `("@authority" "signature-agent";key="sig1");created=${created};expires=${created + 60};keyid="${k.kid}";alg="ed25519";tag="web-bot-auth"`;
  const h: Record<string, string> = { "signature-agent": 'sig1="https://registry.test"' };
  const base = sig.signatureBase({ method: "GET", url, headers: h }, [{ name: "@authority", params: {} }, { name: "signature-agent", params: { key: { type: "string", value: "sig1" } } }], params);
  const pk = await crypto.subtle.importKey("jwk", k.privateJwk, { name: "Ed25519" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pk, new TextEncoder().encode(base)));
  h["signature-input"] = `sig1=${params}`;
  h["signature"] = `sig1=:${btoa(String.fromCharCode(...s))}:`;
  const out = await sig.verifyRequest({ method: "GET", url, headers: h }, { resolveKey: resolve });
  assert.equal(out.status, "valid");
  assert.equal(out.status === "valid" && out.directory, "https://registry.test");
  ok("dictionary-form Signature-Agent with a keyed component verifies");
}

/* --------------------------------- Tiers --------------------------------- */

const valid = { status: "valid", keyid: "k", directory: null, trusted: true, created: 0, expires: 0 } as const;
const invalid = { status: "invalid", reason: "bad_signature", detail: "" } as const;
assert.equal(tiers.assignTier({ verify: { status: "absent" }, userAgent: "Mozilla/5.0 (Macintosh) Safari/605" }), "T0");
assert.equal(tiers.assignTier({ verify: { status: "absent" }, userAgent: "Mozilla/5.0 AppleWebKit (compatible; ChatGPT-User/1.0)" }), "T1");
assert.equal(tiers.assignTier({ verify: { status: "absent" }, userAgent: "python-requests/2.32" }), "T1");
assert.equal(tiers.assignTier({ verify: invalid }), "T1");
assert.equal(tiers.assignTier({ verify: valid }), "T2");
assert.equal(tiers.assignTier({ verify: valid, registryStatus: "pending" }), "T2");
assert.equal(tiers.assignTier({ verify: valid, registryStatus: "approved" }), "T3");
assert.equal(tiers.assignTier({ verify: valid, registryStatus: "approved", delegated: true }), "T4");
assert.equal(tiers.assignTier({ verify: valid, registryStatus: "suspended" }), "T1");
assert.equal(tiers.decide({ tier: "T1", verify: invalid }), "challenge");
assert.equal(tiers.decide({ tier: "T1", verify: { ...invalid, reason: "unknown_key" } }), "allow");
assert.equal(tiers.decide({ tier: "T3", verify: valid, overRate: true }), "rate_limit");
assert.equal(tiers.decide({ tier: "T0", verify: { status: "absent" } }), "allow");
ok("tiers: T0 unknown → T1 declared/failed → T2 signed → T3 approved → T4 delegated; policy never blocks on behaviour");

/* ------------------------------- Directories ------------------------------- */
{
  let fetched = 0;
  const cache = dir.createDirectoryCache({
    trustedOrigins: ["https://registry.test"],
    fetchImpl: (async (u: string) => {
      fetched++;
      assert.equal(u, "https://registry.test/.well-known/http-message-signatures-directory");
      return new Response(JSON.stringify({ keys: [k.publicJwk, { kty: "RSA", n: "x", e: "AQAB" }] }));
    }) as typeof fetch,
  });
  assert.deepEqual((await cache.find(k.kid, "https://registry.test"))?.x, k.publicJwk.x);
  await cache.find(k.kid, "https://registry.test");
  assert.equal(fetched, 1, "directory is cached");
  assert.equal(await cache.find(k.kid, "https://attacker.test"), null);
  assert.equal(fetched, 1, "untrusted directories are never fetched");
  assert.equal(dir.directoryUrl("http://internal.corp/x"), null);
  assert.equal(dir.directoryUrl("https://a.test/r/agt_1"), "https://a.test/r/agt_1");
  ok("only trusted directories are fetched (no SSRF), results cached, non-Ed25519 keys ignored");
}
assert.equal(b64.bytesToB64url(b64.b64urlToBytes("AQID_-8")), "AQID_-8");

/* --------------------------------- Scoring --------------------------------- */

const human = scoring.scoreSession(humanSession(11));
assert.equal(human.label, "human", `human scored ${human.pAgent.toFixed(3)}: ${JSON.stringify(human.evidence)}`);
assert.ok(human.pAgent < 0.2);
assert.ok(human.features.dwell_per_word_ms > 50, "dwell grows with words for a reader");
assert.ok(human.features.fitts_r > 0.3, "human movement follows Fitts' law");
assert.equal(human.hybrid, false);
assert.deepEqual(human.tasks.checkout, { start: 1, complete: 1, fail: 0 });
ok(`human reader → human (P=${human.pAgent.toFixed(3)}; dwell ${human.features.dwell_per_word_ms} ms/word, Fitts r=${human.features.fitts_r})`);

for (const seed of [21, 22, 23]) {
  const a = scoring.scoreSession(agentSession(seed));
  assert.equal(a.label, "agent", `agent seed ${seed} scored ${a.pAgent.toFixed(3)}: ${JSON.stringify(a.evidence)}`);
  assert.ok(Math.abs(a.features.dwell_per_word_ms) < 10, "agent latency ignores content");
}
const agent = scoring.scoreSession(agentSession(21));
assert.equal(agent.evidence[0].llr > 0, true);
ok(`LLM agent over CDP → agent (P=${agent.pAgent.toFixed(3)}); top evidence: ${agent.evidence.slice(0, 3).map((e) => e.feature).join(", ")}`);

const bot = scoring.scoreSession(scriptedBotSession());
assert.equal(bot.label, "agent");
assert.ok(bot.pAgent > 0.99);
assert.ok(bot.features.burstiness < -0.5, "fixed sleeps are periodic");
ok(`scripted bot → agent (P=${bot.pAgent.toFixed(4)}, burstiness ${bot.features.burstiness})`);

const hyb = scoring.scoreSession(hybridSession(5));
assert.equal(hyb.hybrid, true, JSON.stringify(hyb.segments));
assert.equal(hyb.segments[0].state, "human");
assert.equal(hyb.segments[hyb.segments.length - 1].state, "agent");
ok(`hybrid session → HMM splits it: ${hyb.segments.map((s) => `${s.state} ${Math.round((s.to - s.from) / 1000)}s`).join(" → ")}`);

const empty = scoring.scoreSession([{ t: "pv", ts: Date.now(), path: "/", words: 300, vw: 1, vh: 1 }]);
assert.equal(empty.label, "uncertain");
ok("too little evidence → uncertain (no guess from one page view)");

// Many seeds: no human seed crosses the agent threshold and vice versa.
let fp = 0,
  fn = 0,
  falseHybrid = 0,
  hybridFound = 0;
for (let s = 100; s < 160; s++) {
  const h = scoring.scoreSession(humanSession(s));
  const a = scoring.scoreSession(agentSession(s));
  if (h.label === "agent") fp++;
  if (a.label === "human") fn++;
  if (h.hybrid || a.hybrid) falseHybrid++;
  if (scoring.scoreSession(hybridSession(s)).hybrid) hybridFound++;
}
assert.equal(fp, 0, "no synthetic human labelled agent");
assert.equal(fn, 0, "no synthetic agent labelled human");
assert.equal(falseHybrid, 0, "pure sessions are never split");
assert.ok(hybridFound >= 57, `hybrid sessions found: ${hybridFound}/60`);
ok(`60 seeds each: 0 humans labelled agent, 0 agents labelled human, 0 false hybrids, ${hybridFound}/60 hand-offs found`);

console.log(`\nAll ${step} agent-analytics unit checks passed.`);
