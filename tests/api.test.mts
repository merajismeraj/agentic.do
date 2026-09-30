/**
 * End-to-end tests for the account API route handlers against an in-memory
 * Postgres (PGlite), with Google and Resend mocked at the fetch layer.
 *   npm test
 */
import assert from "node:assert/strict";

process.env.PGLITE_DIR = "memory://";
process.env.SESSION_SECRET = "x".repeat(40);
process.env.GOOGLE_CLIENT_ID = "cid";
process.env.GOOGLE_CLIENT_SECRET = "csecret";
for (const k of ["DATABASE_URL", "POSTGRES_URL", "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_DRIVER"]) delete process.env[k];

const R = new URL("../", import.meta.url).href;
const route = (p: string) => import(R + p);

/* ---------------------------- fetch mocks ---------------------------- */

const calls: { url: string; body?: string }[] = [];
const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
let nextIdentity: object = { sub: "g-1", email: "gina@acme.com", name: "Gina", email_verified: true };
type Any = any;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = init?.body != null ? String(init.body) : undefined;
  calls.push({ url, body });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "at1", expires_in: 3600, id_token: idToken(nextIdentity) });
  if (url === "https://api.resend.com/emails") return json({ id: "email_" + calls.length });
  throw new Error("unmocked fetch: " + url);
}) as typeof fetch;

/* ---------------------------- helpers -------------------------------- */

class Browser {
  jar = new Map<string, string>();
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  take(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      if (attrs.some((a) => a.trim() === "Max-Age=0") || !v) this.jar.delete(k);
      else this.jar.set(k, v);
    }
    return res;
  }
  req(path: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
    const headers: Record<string, string> = { cookie: this.cookie() };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.method && init.method !== "GET") headers.origin = init.origin ?? "http://app.test";
    return new Request("http://app.test" + path, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  }
}

let step = 0;
const ok = (name: string) => console.log(`✓ ${++step}. ${name}`);

const signup = await route("app/api/auth/signup/route.ts");
const login = await route("app/api/auth/login/route.ts");
const logout = await route("app/api/auth/logout/route.ts");
const me = await route("app/api/me/route.ts");
const sites = await route("app/api/aa/sites/route.ts");
const gStart = await route("app/api/auth/google/start/route.ts");
const gCallback = await route("app/api/auth/google/callback/route.ts");
const verifyRoute = await route("app/api/auth/verify/route.ts");
const resendRoute = await route("app/api/auth/verify/resend/route.ts");
const forgot = await route("app/api/auth/forgot/route.ts");
const reset = await route("app/api/auth/reset/route.ts");
const meOf = async (b: Browser) => (await me.GET(b.req("/api/me"))).json();
const emails = () => calls.filter((c) => c.url === "https://api.resend.com/emails");
const linkIn = (text: string, page: string) => text.match(new RegExp(`${page}\\?token=([A-Za-z0-9_-]+)`))?.[1];

/* ---------------------------- accounts ------------------------------- */

const alex = new Browser();
let res = await signup.POST(alex.req("/api/auth/signup", { method: "POST", body: { email: "Alex@Northstar.com", password: "short", name: "Alex" } }));
assert.equal(res.status, 400);
res = alex.take(
  await signup.POST(alex.req("/api/auth/signup", { method: "POST", body: { email: "Alex@Northstar.com", password: "correct horse battery", name: "Alex" } })),
);
assert.equal(res.status, 200);
assert.ok(alex.jar.has("agentic_session"));
assert.match(res.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/);
res = await signup.POST(new Browser().req("/api/auth/signup", { method: "POST", body: { email: "alex@northstar.com", password: "another password!", name: "X" } }));
assert.equal(res.status, 409);
ok("sign up validates password, normalises email, rejects duplicates, sets httpOnly session");

const body = await meOf(alex);
assert.equal(body.user.email, "alex@northstar.com");
assert.deepEqual(body.server, { google: true, email: false });
const dbc = await (await route("lib/server/db.ts")).db();
const wsCount = async (email: string) =>
  (await dbc.query<{ n: number }>("select count(*)::int as n from workspaces w join users u on u.id = w.owner_id where u.email = $1", [email])).rows[0].n;
await meOf(alex);
assert.equal(await wsCount("alex@northstar.com"), 1, "workspace created once, not on every load");
res = await me.GET(new Browser().req("/api/me"));
assert.equal(res.status, 401);
assert.deepEqual((await res.json()).server, { google: true, email: false }, "signed-out visitors learn what sign-in options exist");
ok("/api/me requires a session, creates the workspace once, and reports the server's sign-in options");

const other = new Browser();
res = await login.POST(other.req("/api/auth/login", { method: "POST", body: { email: "alex@northstar.com", password: "wrong password" } }));
assert.equal(res.status, 401);
res = other.take(await login.POST(other.req("/api/auth/login", { method: "POST", body: { email: "ALEX@northstar.com", password: "correct horse battery" } })));
assert.equal(res.status, 200);
await logout.POST(other.req("/api/auth/logout", { method: "POST" }));
assert.equal((await me.GET(other.req("/api/me"))).status, 401, "logged-out session is dead");
assert.equal((await me.GET(alex.req("/api/me"))).status, 200, "other sessions unaffected");
ok("login checks the password (case-insensitive email); logout ends only that session");

const attacker = new Browser();
let last = 0;
for (let i = 0; i < 10; i++) last = (await login.POST(attacker.req("/api/auth/login", { method: "POST", body: { email: "victim@x.com", password: "guess" + i } }))).status;
assert.equal(last, 429);
ok("login is rate-limited after repeated failures");

res = await sites.POST(alex.req("/api/aa/sites", { method: "POST", body: { name: "Shop", domain: "shop.example.com" }, origin: "https://evil.example" }));
assert.equal(res.status, 403);
ok("cross-site writes are rejected");

/* ---------------------------- Google --------------------------------- */

const googleLogin = async (b: Browser, back = "/app/analytics/agents") => {
  const r = b.take(await gStart.GET(b.req(`/api/auth/google/start?return=${encodeURIComponent(back)}`)));
  const l = new URL(r.headers.get("location")!);
  return { scope: l.searchParams.get("scope"), res: b.take(await gCallback.GET(b.req(`/api/auth/google/callback?code=c&state=${l.searchParams.get("state")}`))) };
};
nextIdentity = { sub: "g-1", email: "gina@acme.com", name: "Gina", email_verified: true };
const gina = new Browser();
let g = await googleLogin(gina);
assert.equal(g.scope, "openid email profile", "sign-in asks for identity only");
assert.equal(g.res.headers.get("location"), "http://app.test/app/analytics/agents?signed_in=1");
const ginaId = (await meOf(gina)).user.id;
const gina2 = new Browser();
await googleLogin(gina2, "//evil.example");
assert.equal((await meOf(gina2)).user.id, ginaId, "same Google account → same user");
const forged = new Browser();
forged.take(await gStart.GET(forged.req("/api/auth/google/start")));
assert.match((await gCallback.GET(forged.req("/api/auth/google/callback?code=c&state=wrong"))).headers.get("location")!, /google=invalid_state/);
nextIdentity = { sub: "g-alex", email: "alex@northstar.com", name: "Alex", email_verified: false };
g = await googleLogin(new Browser());
assert.match(g.res.headers.get("location")!, /\/login\?google=error/, "unverified email can't take over an existing account");
ok("Sign in with Google: identity-only scopes, state checked, no open redirects, linking only via verified email");

/* ---------------------------- account emails --------------------------- */

process.env.RESEND_API_KEY = "re_test";
process.env.EMAIL_FROM = "agentic.do <hello@agentic.test>";
process.env.APP_URL = "https://app.agentic.test/";

assert.equal((await resendRoute.POST(alex.req("/api/auth/verify/resend", { method: "POST" }))).status, 200);
const verifyMail = JSON.parse(emails().at(-1)!.body!);
assert.equal(verifyMail.subject, "Confirm your email for agentic.do");
const alexToken = linkIn(verifyMail.text, "https://app.agentic.test/verify-email")!;
assert.ok(alexToken && alexToken.length >= 40);
assert.equal((await verifyRoute.POST(alex.req("/api/auth/verify", { method: "POST", body: { token: alexToken } }))).status, 200);
assert.equal((await verifyRoute.POST(alex.req("/api/auth/verify", { method: "POST", body: { token: alexToken } }))).status, 400, "single use");
assert.equal((await meOf(alex)).user.emailVerified, true);
ok("resend → link → verify confirms the address; links are single-use and use APP_URL");

const rita = new Browser();
rita.take(await signup.POST(rita.req("/api/auth/signup", { method: "POST", body: { email: "rita@acme.com", password: "rita's first password", name: "Rita" } })));
let ritaMail = JSON.parse(emails().at(-1)!.body!);
assert.deepEqual(ritaMail.to, ["rita@acme.com"]);
assert.ok(ritaMail.html.includes("https://app.agentic.test/verify-email?token="));
assert.equal((await meOf(rita)).user.emailVerified, false);
const ritaToken = linkIn(ritaMail.text, "https://app.agentic.test/verify-email")!;
await dbc.query("update auth_tokens set expires_at = now() - interval '1 minute' where purpose = 'verify'");
assert.equal((await verifyRoute.POST(rita.req("/api/auth/verify", { method: "POST", body: { token: ritaToken } }))).status, 400, "expired");
assert.equal((await verifyRoute.POST(rita.req("/api/auth/verify", { method: "POST", body: { token: "x".repeat(43) } }))).status, 400, "unknown");
const rawTokens = (await dbc.query("select id from auth_tokens")).rows.map((r: Any) => r.id);
assert.ok(!rawTokens.includes(ritaToken), "only token hashes are stored");
ok("sign-up sends a confirmation link; tokens expire and are stored hashed");

const mailCount = emails().length;
res = await forgot.POST(new Browser().req("/api/auth/forgot", { method: "POST", body: { email: "nobody@nowhere.io" } }));
const unknownBody = await res.json();
assert.equal(res.status, 200);
assert.equal(emails().length, mailCount, "no email for unknown accounts");
res = await forgot.POST(new Browser().req("/api/auth/forgot", { method: "POST", body: { email: "RITA@acme.com" } }));
assert.deepEqual(await res.json(), unknownBody, "identical response — no account enumeration");
ritaMail = JSON.parse(emails().at(-1)!.body!);
assert.equal(ritaMail.subject, "Reset your agentic.do password");
const resetToken = linkIn(ritaMail.text, "https://app.agentic.test/reset-password")!;
ok("forgot password never reveals whether an account exists");

const ritaPhone = new Browser();
ritaPhone.take(await login.POST(ritaPhone.req("/api/auth/login", { method: "POST", body: { email: "rita@acme.com", password: "rita's first password" } })));
assert.equal((await reset.POST(new Browser().req("/api/auth/reset", { method: "POST", body: { token: resetToken, password: "short" } }))).status, 400);
const fresh = new Browser();
res = fresh.take(await reset.POST(fresh.req("/api/auth/reset", { method: "POST", body: { token: resetToken, password: "rita's brand new password" } })));
assert.equal(res.status, 200);
assert.equal((await meOf(fresh)).user.email, "rita@acme.com", "signed in on this device");
assert.equal((await meOf(fresh)).user.emailVerified, true, "a reset proves the inbox");
assert.equal((await me.GET(rita.req("/api/me"))).status, 401, "other sessions signed out");
assert.equal((await me.GET(ritaPhone.req("/api/me"))).status, 401);
assert.equal((await reset.POST(new Browser().req("/api/auth/reset", { method: "POST", body: { token: resetToken, password: "another new password!" } }))).status, 400, "single use");
assert.equal((await login.POST(new Browser().req("/api/auth/login", { method: "POST", body: { email: "rita@acme.com", password: "rita's first password" } }))).status, 401);
assert.equal((await login.POST(new Browser().req("/api/auth/login", { method: "POST", body: { email: "rita@acme.com", password: "rita's brand new password" } }))).status, 200);
ok("password reset: new password works, old one and all other sessions are gone, link is single-use");

// Pre-hijacking: someone registers the victim's email first; the victim later signs in with Google.
const squatter = new Browser();
squatter.take(await signup.POST(squatter.req("/api/auth/signup", { method: "POST", body: { email: "victim@corp.io", password: "squatter's password", name: "Not Victim" } })));
assert.equal((await me.GET(squatter.req("/api/me"))).status, 200);
nextIdentity = { sub: "g-victim", email: "victim@corp.io", name: "Victim", email_verified: true };
const victim = new Browser();
await googleLogin(victim);
assert.equal((await meOf(victim)).user.email, "victim@corp.io");
assert.equal((await meOf(victim)).user.emailVerified, true);
assert.equal((await me.GET(squatter.req("/api/me"))).status, 401, "squatter's session ended");
assert.equal((await login.POST(new Browser().req("/api/auth/login", { method: "POST", body: { email: "victim@corp.io", password: "squatter's password" } }))).status, 401, "squatter's password wiped");
ok("a verified Google sign-in takes back an unconfirmed account: old password and sessions are wiped");

console.log("\nALL API TESTS PASSED");
