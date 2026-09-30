/**
 * End-to-end tests for agent analytics route handlers against in-memory
 * Postgres (PGlite): registry, public directory, server-side verification,
 * SDK collection + scoring, dashboards, and cross-account isolation.
 *   npx tsx --conditions=react-server tests/aa-api.test.mts
 */
import assert from "node:assert/strict";
import { agentSession, humanSession } from "./aa-synth.mts";

process.env.PGLITE_DIR = "memory://";
process.env.SESSION_SECRET = "y".repeat(40);
process.env.APP_URL = "http://app.test";
process.env.AA_ADMIN_EMAILS = "reviewer@registry.test";
for (const k of ["DATABASE_URL", "AA_TRUSTED_DIRECTORIES", "SHARED_AI_KEYS"]) delete process.env[k];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error("unmocked fetch: " + String(input));
}) as typeof fetch;

const R = new URL("../", import.meta.url).href;
const route = async (p: string) => {
  const m = await import(R + p);
  return m.default?.GET || m.default?.POST ? m.default : m;
};
type HttpSig = typeof import("../lib/aa/verifier/httpsig.ts");
const sigMod = await import(R + "lib/aa/verifier/httpsig.ts");
const sig = (sigMod.default ?? sigMod) as HttpSig;

let step = 0;
const ok = (name: string) => console.log(`✓ ${++step}. ${name}`);
type Any = any;

class Browser {
  jar = new Map<string, string>();
  take(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }
  req(path: string, init: { method?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.method && init.method !== "GET") headers.origin = "http://app.test";
    return new Request("http://app.test" + path, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  }
}

const signup = await route("app/api/auth/signup/route.ts");
const sites = await route("app/api/aa/sites/route.ts");
const siteOne = await route("app/api/aa/sites/[id]/route.ts");
const agents = await route("app/api/aa/agents/route.ts");
const agentOne = await route("app/api/aa/agents/[id]/route.ts");
const agentKeys = await route("app/api/aa/agents/[id]/keys/route.ts");
const agentKey = await route("app/api/aa/agents/[id]/keys/[kid]/route.ts");
const review = await route("app/api/aa/review/route.ts");
const collect = await route("app/api/aa/collect/route.ts");
const verify = await route("app/api/aa/verify/route.ts");
const wellKnown = await route("app/.well-known/http-message-signatures-directory/route.ts");
const perAgentDir = await route("app/r/[agentId]/route.ts");
const card = await route("app/r/[agentId]/card/route.ts");

async function account(email: string) {
  const b = new Browser();
  const res = b.take(await signup.POST(b.req("/api/auth/signup", { method: "POST", body: { email, password: "correct horse battery", name: email.split("@")[0] } })));
  assert.equal(res.status, 200);
  return b;
}

const alex = await account("alex@northstar.test"); // runs a shop and operates an agent
const bob = await account("bob@other.test"); // someone else
const reviewer = await account("reviewer@registry.test");

/* ------------------------------- Sites ------------------------------- */

let res = await sites.POST(alex.req("/api/aa/sites", { method: "POST", body: { name: "Shop", domain: "not a domain!" } }));
assert.equal(res.status, 400);
res = await sites.POST(alex.req("/api/aa/sites", { method: "POST", body: { name: "Northstar Shop", domain: "https://Shop.Northstar.test/some/path" } }));
const { site } = (await res.json()) as Any;
assert.equal(site.domain, "shop.northstar.test");
assert.match(site.siteKey, /^aa_pk_/);
assert.match(site.secret, /^aa_sk_/);
const listed = (await (await sites.GET(alex.req("/api/aa/sites"))).json()) as Any;
assert.equal(listed.sites.length, 1);
assert.equal(listed.sites[0].secret, undefined, "secret is shown once, never listed");
assert.equal((await sites.GET(new Browser().req("/api/aa/sites"))).status, 401);
ok("sites: domain normalised, public key + one-time secret issued, secret never listed, sign-in required");

/* ------------------------------ Registry ------------------------------ */

const key = await sig.generateAgentKey();
const agentBody = {
  name: "Northstar Shopper",
  operator: "Northstar Labs Ltd",
  contact: "abuse@northstar.test",
  purpose: "shopping",
  actuation: "hosted_browser",
  principalModel: "consumer_delegated",
  ratePerMin: 30,
  homepage: "https://northstar.test/agent",
};
res = await agents.POST(alex.req("/api/aa/agents", { method: "POST", body: { ...agentBody, publicJwk: key.privateJwk } }));
assert.equal(res.status, 400, "private keys are refused");
res = await agents.POST(alex.req("/api/aa/agents", { method: "POST", body: { ...agentBody, purpose: "spam", publicJwk: key.publicJwk } }));
assert.equal(res.status, 400);
res = await agents.POST(alex.req("/api/aa/agents", { method: "POST", body: { ...agentBody, publicJwk: key.publicJwk } }));
const { agent } = (await res.json()) as Any;
assert.equal(agent.status, "pending");
assert.equal(agent.keys[0].kid, key.kid);
assert.equal(agent.card.tier, "T2");
res = await agents.POST(bob.req("/api/aa/agents", { method: "POST", body: { ...agentBody, publicJwk: key.publicJwk } }));
assert.equal(res.status, 409, "a key can belong to one agent only");
ok("registry: agent registered with Ed25519 public key (private keys and bad enums refused, keys unique), starts pending/T2");

let dir = (await (await wellKnown.GET()).json()) as Any;
assert.deepEqual(dir.keys.map((k: Any) => k.kid), [key.kid]);
assert.equal((await wellKnown.GET()).headers.get("content-type"), "application/http-message-signatures-directory+json");
const agentDir = (await (await perAgentDir.GET(new Request("http://app.test/r/x"), { params: Promise.resolve({ agentId: agent.id }) })).json()) as Any;
assert.equal(agentDir.keys[0].x, key.publicJwk.x);
assert.equal(agentDir.keys[0].d, undefined);
const cardBody = (await (await card.GET(new Request("http://app.test/r/x/card"), { params: Promise.resolve({ agentId: agent.id }) })).json()) as Any;
assert.equal(cardBody.client_name, "Northstar Shopper");
assert.equal(cardBody.rate_expectation.requests_per_minute, 30);
assert.equal(cardBody.jwks_uri, `http://app.test/r/${agent.id}`);
ok("public Web Bot Auth directory (well-known + per agent) and Signature Agent Card served, public parts only");

/* ---------------------------- Verification ---------------------------- */

const shopUrl = "https://shop.northstar.test/products/42";
const signed = (u = shopUrl, k = key) => sig.signRequest({ method: "GET", url: u }, { key: k.privateJwk, keyid: k.kid, signatureAgent: "http://app.test" });
const callVerify = async (headers: Record<string, string>, opts: { url?: string; secret?: string } = {}) => {
  const r = await verify.POST(
    new Request("http://app.test/api/aa/verify", {
      method: "POST",
      headers: { authorization: `Bearer ${opts.secret ?? site.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ method: "GET", url: opts.url ?? shopUrl, headers, ip: "203.0.113.7" }),
    }),
  );
  return { status: r.status, body: (await r.json()) as Any };
};

assert.equal((await callVerify({}, { secret: "aa_sk_wrong" })).status, 401);
assert.equal((await callVerify({}, { url: "https://bank.test/" })).status, 400, "a site secret only verifies its own host");

let h = await signed();
let v = await callVerify({ ...h, "user-agent": "NorthstarShopper/1.0" });
assert.equal(v.status, 200);
assert.equal(v.body.tier, "T2");
assert.equal(v.body.decision, "allow");
assert.equal(v.body.agent.id, agent.id);
assert.ok(v.body.vt);
const vtPending = v.body.vt;
ok("signed request from a pending agent → T2 Signed, allowed, attributed, verification token minted");

v = await callVerify(h);
assert.equal(v.body.verification.reason, "replay");
assert.equal(v.body.tier, "T1");
assert.equal(v.body.decision, "challenge");
ok("replayed signature (same nonce) → rejected as replay, challenged");

res = await agentOne.PATCH(alex.req(`/api/aa/agents/${agent.id}`, { method: "PATCH", body: { status: "approved" } }), { params: Promise.resolve({ id: agent.id }) });
assert.equal(res.status, 403, "operators can't approve their own agents");
assert.equal((await review.GET(alex.req("/api/aa/review"))).status, 403);
const queue = (await (await review.GET(reviewer.req("/api/aa/review"))).json()) as Any;
assert.equal(queue.agents[0].id, agent.id);
res = await agentOne.PATCH(reviewer.req(`/api/aa/agents/${agent.id}`, { method: "PATCH", body: { status: "approved", note: "KYB ok" } }), { params: Promise.resolve({ id: agent.id }) });
assert.equal(res.status, 200);
v = await callVerify(await signed());
assert.equal(v.body.tier, "T3");
assert.equal(v.body.agent.status, "approved");
const vtApproved = v.body.vt;
ok("registry reviewer approves (operators can't self-approve) → next request is T3 Registered");

v = await callVerify(await signed("https://evil.test/products/42"));
assert.equal(v.body.verification.reason, "bad_signature");
assert.equal(v.body.decision, "challenge");
const stranger = await sig.generateAgentKey();
v = await callVerify(await signed(shopUrl, stranger));
assert.equal(v.body.verification.reason, "unknown_key");
assert.equal(v.body.tier, "T1");
assert.equal(v.body.decision, "allow");
ok("signature for another host → challenged; unknown key → T1 Declared, allowed (identity unproven, not hostile)");

assert.equal((await callVerify({ "user-agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0)" })).body.tier, "T1");
v = await callVerify({ "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15" });
assert.equal(v.body.tier, "T0");
assert.equal(v.body.verification.status, "absent");
ok("unsigned declared agent UA → T1; ordinary browser → T0");

// Rate expectation: declared 30/min; push a second agent with 2/min past it.
const fastKey = await sig.generateAgentKey();
const fast = ((await (await agents.POST(alex.req("/api/aa/agents", { method: "POST", body: { ...agentBody, name: "Fast", ratePerMin: 2, publicJwk: fastKey.publicJwk } }))).json()) as Any).agent;
const decisions = [];
for (let i = 0; i < 3; i++) decisions.push((await callVerify(await signed(shopUrl, fastKey))).body.decision);
assert.deepEqual(decisions, ["allow", "allow", "rate_limit"]);
ok("agents exceeding their declared rate are rate-limited, not blocked");

/* --------------------------- SDK collection --------------------------- */

const post = (body: unknown, raw?: string) =>
  collect.POST(new Request("http://app.test/api/aa/collect", { method: "POST", headers: { "content-type": "text/plain", "user-agent": "Mozilla/5.0 test" }, body: raw ?? JSON.stringify(body) }));

res = await post({ site: "aa_pk_nope", sid: "abcdef0123456789", seq: 0, events: [] });
assert.equal(res.status, 404);
assert.equal(res.headers.get("access-control-allow-origin"), "*");
assert.equal((await post(null, "{nope")).status, 400);
assert.equal((await post(null, "x".repeat(200_000))).status, 413);
assert.equal((await post({ site: site.siteKey, sid: "../../etc", seq: 0, events: [] })).status, 400);
assert.equal((await collect.OPTIONS()).status, 204);
ok("collect: CORS-open but rejects unknown sites, bad JSON, oversize batches and malformed session ids");

const humanEv = humanSession(7);
const half = Math.floor(humanEv.length / 2);
assert.equal((await post({ site: site.siteKey, sid: "aaaa000000000001", seq: 0, events: [...humanEv.slice(0, half), { t: "evil", ts: 1, payload: "x" }] })).status, 200);
res = await post({ site: site.siteKey, sid: "aaaa000000000001", seq: 1, events: humanEv.slice(half) });
assert.equal(res.status, 200);
const dup = (await (await post({ site: site.siteKey, sid: "aaaa000000000001", seq: 1, events: humanEv.slice(half) })).json()) as Any;
assert.equal(dup.duplicate, true, "retried batches are idempotent");

// An agent session carrying the verification token its page was served with.
await post({ site: site.siteKey, sid: "bbbb000000000002", seq: 0, vt: vtApproved, events: agentSession(8) });
// An unverified agent (behaviour only), and a token forged for it.
await post({ site: site.siteKey, sid: "cccc000000000003", seq: 0, vt: vtPending.replace(/.$/, (c: string) => (c === "A" ? "B" : "A")), events: agentSession(9, Date.now() - 4 * 60_000) });
ok("SDK batches stored idempotently, unknown event kinds dropped, session rescored per batch");

/* ------------------------------ Dashboards ------------------------------ */

res = await siteOne.GET(alex.req(`/api/aa/sites/${site.id}?days=7`), { params: Promise.resolve({ id: site.id }) });
assert.equal(res.status, 200);
const { overview } = (await res.json()) as Any;
const byId = Object.fromEntries(overview.sessions.map((s: Any) => [s.id, s]));
assert.equal(byId.aaaa000000000001.cls, "human");
assert.equal(byId.aaaa000000000001.tier, "T0");
assert.equal(byId.bbbb000000000002.cls, "verified_agent");
assert.equal(byId.bbbb000000000002.tier, "T3");
assert.equal(byId.bbbb000000000002.agentName, "Northstar Shopper");
assert.equal(byId.cccc000000000003.cls, "agent", "forged token ignored; behaviour still says agent");
assert.equal(byId.cccc000000000003.tier, "T0");
assert.ok(byId.cccc000000000003.evidence.length > 0);
assert.equal(overview.totals.sessions, 3);
assert.equal(overview.totals.byClass.verified_agent, 1);
assert.ok(Math.abs(overview.totals.agentShare - 2 / 3) < 1e-9);
assert.equal(overview.totals.verifiedShare, 0.5);
assert.equal(overview.tasks.human.rate, 1);
assert.equal(overview.tasks.verified_agent.completed, 1);
assert.equal(overview.taskBreakdown[0].name, "checkout");
const reasons = Object.fromEntries(overview.requests.failures.map((f: Any) => [f.reason, f.n]));
assert.deepEqual(reasons, { replay: 1, bad_signature: 1, unknown_key: 1 });
assert.equal(overview.requests.total, 10, "401/400 calls never reach the log");
// Only verified requests are attributed to an agent; failed claims stay unattributed.
const shopRow = overview.agents.find((a: Any) => a.name === "Northstar Shopper");
assert.equal(shopRow.requests, 2);
assert.equal(shopRow.sessions, 1);
assert.equal(overview.agents.find((a: Any) => a.name === "Fast").requests, 3);
assert.equal(overview.daily.length, 7);
assert.equal(overview.recentRequests.length, 10);
ok("site dashboard: classes, tiers, agent share, verified share, task completion by class, failure reasons, top agents");

const mine = (await (await agents.GET(alex.req("/api/aa/agents"))).json()) as Any;
const shopper = mine.agents.find((a: Any) => a.id === agent.id);
assert.equal(shopper.outcomes.requests, 4); // T2, replay, T3, wrong-host
assert.equal(shopper.outcomes.sites, 1);
assert.equal(shopper.outcomes.acceptanceRate, 2 / 4);
assert.deepEqual(Object.fromEntries(shopper.outcomes.failures.map((f: Any) => [f.reason, f.n])), { replay: 1, bad_signature: 1 });
assert.equal(shopper.outcomes.tasks.completed, 1);
assert.equal(mine.agents.find((a: Any) => a.id === fast.id).outcomes.byDecision.find((d: Any) => d.decision === "rate_limit").n, 1);
ok("builder view: requests, sites reached, acceptance rate, failure reasons and task success — sites stay anonymous");

/* ------------------------ Rotation & revocation ------------------------ */

const next = await sig.generateAgentKey();
res = await agentKeys.POST(alex.req(`/api/aa/agents/${agent.id}/keys`, { method: "POST", body: { publicJwk: next.publicJwk } }), { params: Promise.resolve({ id: agent.id }) });
assert.equal(res.status, 200);
res = await agentKey.DELETE(alex.req(`/api/aa/agents/${agent.id}/keys/${key.kid}`, { method: "DELETE" }), { params: Promise.resolve({ id: agent.id, kid: key.kid }) });
assert.equal(res.status, 200);
v = await callVerify(await signed());
assert.equal(v.body.verification.reason, "revoked_key");
assert.equal(v.body.decision, "challenge");
assert.equal((await callVerify(await signed(shopUrl, next))).body.tier, "T3");
dir = (await (await wellKnown.GET()).json()) as Any;
assert.ok(!dir.keys.some((k: Any) => k.kid === key.kid), "revoked key leaves the directory");
ok("key rotation: new key works at T3, revoked key is refused at once and leaves the directory");

res = await agentOne.PATCH(alex.req(`/api/aa/agents/${agent.id}`, { method: "PATCH", body: { status: "suspended" } }), { params: Promise.resolve({ id: agent.id }) });
assert.equal(res.status, 200);
v = await callVerify(await signed(shopUrl, next));
assert.equal(v.body.verification.reason, "untrusted_directory");
assert.equal(v.body.tier, "T1");
ok("an operator can suspend their own agent: its keys stop verifying (T1)");

/* ------------------------------ Isolation ------------------------------ */

assert.equal((await siteOne.GET(bob.req(`/api/aa/sites/${site.id}`), { params: Promise.resolve({ id: site.id }) })).status, 404);
assert.equal((await siteOne.DELETE(bob.req(`/api/aa/sites/${site.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: site.id }) })).status, 404);
assert.equal(
  (await agentKey.DELETE(bob.req(`/api/aa/agents/${agent.id}/keys/${next.kid}`, { method: "DELETE" }), { params: Promise.resolve({ id: agent.id, kid: next.kid }) })).status,
  404,
);
assert.equal((await agentOne.PATCH(bob.req(`/api/aa/agents/${agent.id}`, { method: "PATCH", body: { status: "suspended" } }), { params: Promise.resolve({ id: agent.id }) })).status, 404);
assert.equal(((await (await agents.GET(bob.req("/api/aa/agents"))).json()) as Any).agents.length, 0);
res = await sites.POST(
  new Request("http://app.test/api/aa/sites", { method: "POST", headers: { cookie: [...alex.jar].map(([k, v]) => `${k}=${v}`).join("; "), origin: "https://evil.test", "content-type": "application/json" }, body: JSON.stringify({ name: "x", domain: "x.test" }) }),
);
assert.equal(res.status, 403);
ok("isolation: other accounts can't read, delete or change your sites, agents or keys; cross-site writes blocked");

const rotated = (await (await siteOne.POST(alex.req(`/api/aa/sites/${site.id}`, { method: "POST", body: { action: "rotate_secret" } }), { params: Promise.resolve({ id: site.id }) })).json()) as Any;
assert.equal((await callVerify({})).status, 401, "old secret stops working");
assert.equal((await callVerify({}, { secret: rotated.secret })).status, 200);
ok("site secret rotation invalidates the old secret");

console.log(`\nAll ${step} agent-analytics API checks passed.`);
process.exit(0);
