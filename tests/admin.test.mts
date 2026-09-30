/**
 * Sites and apps (kinds, the 100 limit) and the super admin dashboard, end to end
 * against an in-memory Postgres.
 *   npm test
 */
import assert from "node:assert/strict";

process.env.PGLITE_DIR = "memory://";
process.env.SESSION_SECRET = "x".repeat(40);
process.env.SUPER_ADMIN_EMAILS = "Boss@Agentic.test, other-admin@agentic.test";
process.env.AA_ADMIN_EMAILS = "";
for (const k of ["DATABASE_URL", "POSTGRES_URL", "RESEND_API_KEY", "GOOGLE_CLIENT_ID"]) delete process.env[k];
process.env.EMAIL_DRIVER = "log";

const R = new URL("../", import.meta.url).href;
const route = (p: string) => import(R + p);
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

let step = 0;
const ok = (name: string) => process.stdout.write(`✓ ${++step}. ${name}\n`);
const log = console.log;
console.log = () => {}; // silence the email log driver
const signup = await route("app/api/auth/signup/route.ts");
const me = await route("app/api/me/route.ts");
const sites = await route("app/api/aa/sites/route.ts");
const siteOne = await route("app/api/aa/sites/[id]/route.ts");
const overview = await route("app/api/admin/overview/route.ts");
const accountRoute = await route("app/api/admin/accounts/[id]/route.ts");
const collect = await route("app/api/aa/collect/route.ts");
const { db } = await route("lib/server/db.ts");
const d = await db();

async function account(email: string, name = email.split("@")[0]) {
  const b = new Browser();
  const res = b.take(await signup.POST(b.req("/api/auth/signup", { method: "POST", body: { email, password: "correct horse battery", name } })));
  assert.equal(res.status, 200);
  return b;
}
const confirm = (email: string) => d.query("update users set email_verified_at = now() where email = $1", [email.toLowerCase()]);
const add = async (b: Browser, body: Any) => sites.POST(b.req("/api/aa/sites", { method: "POST", body }));

/* ---------------------------- sites and apps ---------------------------- */

const alex = await account("alex@shop.test", "Alex");
let res = await add(alex, { name: "Shop", domain: "shop.test" });
assert.equal(res.status, 200);
const shop = (await res.json()).site;
assert.equal(shop.kind, "website", "kind defaults to website");
res = await add(alex, { name: "Dashboard", kind: "web_app", domain: "https://app.shop.test/login" });
assert.equal((await res.json()).site.domain, "app.shop.test");
res = await add(alex, { name: "Shop for iOS", kind: "mobile_app", domain: "api.shop.test", appId: "com.shop.ios" });
const ios = (await res.json()).site;
assert.deepEqual([ios.kind, ios.appId, ios.domain], ["mobile_app", "com.shop.ios", "api.shop.test"]);
assert.ok(ios.secret?.startsWith("aa_sk_"), "apps get a server secret too");
res = await add(alex, { name: "Public API", kind: "api", domain: "api.shop.test" });
assert.equal(res.status, 200);
assert.equal((await add(alex, { name: "No bundle", kind: "mobile_app", domain: "api.shop.test" })).status, 400, "mobile apps need a bundle id");
assert.equal((await add(alex, { name: "Bad bundle", kind: "mobile_app", domain: "api.shop.test", appId: "not a bundle" })).status, 400);
assert.equal((await add(alex, { name: "Toaster", kind: "toaster", domain: "x.test" })).status, 400, "unknown kind refused");
let listed = await (await sites.GET(alex.req("/api/aa/sites"))).json();
assert.equal(listed.sites.length, 4);
assert.equal(listed.limit, 100);
assert.ok(listed.sites.every((s: Any) => s.secret === undefined), "secrets never listed");
res = await siteOne.POST(alex.req(`/api/aa/sites/${shop.id}`, { method: "POST", body: { action: "rename", name: "Northstar Shop" } }), { params: Promise.resolve({ id: shop.id }) });
assert.equal((await res.json()).site.name, "Northstar Shop");
ok("websites, web apps, mobile apps (bundle id required) and APIs can be added, listed and renamed");

// Fill up to the limit, including concurrent requests racing for the last slots.
for (let i = listed.sites.length; i < 97; i++) assert.equal((await add(alex, { name: `Site ${i}`, domain: `s${i}.shop.test` })).status, 200);
const race = await Promise.all(Array.from({ length: 6 }, (_, i) => add(alex, { name: `Race ${i}`, kind: "api", domain: `r${i}.shop.test` })));
assert.equal(race.filter((r) => r.status === 200).length, 3, "exactly the 3 remaining slots are filled");
const refused = race.find((r) => r.status === 400)!;
assert.match((await refused.json()).error, /up to 100 sites and apps/);
listed = await (await sites.GET(alex.req("/api/aa/sites"))).json();
assert.equal(listed.sites.length, 100);
assert.equal((await siteOne.DELETE(alex.req(`/api/aa/sites/${shop.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: shop.id }) })).status, 200);
assert.equal((await add(alex, { name: "After delete", domain: "again.shop.test" })).status, 200, "deleting frees a slot");
ok("100 sites and apps per account, enforced under concurrent requests; deleting frees a slot");

const bob = await account("bob@other.test", "Bob");
assert.equal((await add(bob, { name: "Bob's", domain: "bob.test" })).status, 200, "the limit is per account");
ok("the limit is per account");

/* ---------------------------- super admin ------------------------------- */

// Traffic on one of Bob's sites.
const bobSite = (await (await sites.GET(bob.req("/api/aa/sites"))).json()).sites[0];
res = await collect.POST(
  new Request("http://app.test/api/aa/collect", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ site: bobSite.siteKey, sid: "abcdef0123456789", seq: 0, events: [{ t: "pv", ts: Date.now(), path: "/", words: 100, vw: 1200, vh: 800 }] }),
  }),
);
assert.equal(res.status, 200);

const boss = await account("boss@agentic.test", "Boss");
const get = (b: Browser, q = "") => overview.GET(b.req(`/api/admin/overview${q}`));
assert.equal((await get(alex)).status, 404, "regular accounts don't even learn the page exists");
assert.equal((await get(new Browser())).status, 401);
assert.equal((await get(boss)).status, 404, "listed but unconfirmed: refused");
assert.equal((await (await me.GET(boss.req("/api/me"))).json()).user.superAdmin, false);
await confirm("boss@agentic.test");
assert.equal((await (await me.GET(boss.req("/api/me"))).json()).user.superAdmin, true, "email match is case-insensitive");
assert.equal((await (await me.GET(alex.req("/api/me"))).json()).user.superAdmin, false);
ok("super admin: confirmed email in SUPER_ADMIN_EMAILS only; everyone else gets 404");

let o = await (await get(boss)).json();
assert.deepEqual(
  { accounts: o.totals.accounts, verified: o.totals.verified, sites: o.totals.sites, apps: o.totals.apps, sessions7d: o.totals.sessions7d, active: o.totals.activeProperties },
  { accounts: 3, verified: 1, sites: 94 + 1, apps: 6, sessions7d: 1, active: 1 },
);
const row = (email: string) => o.accounts.find((a: Any) => a.email === email);
assert.deepEqual([row("alex@shop.test").sites, row("alex@shop.test").apps], [94, 6], "sites vs apps per account");
assert.deepEqual([row("bob@other.test").sites, row("bob@other.test").sessions7d, !!row("bob@other.test").lastEventAt], [1, 1, true]);
assert.equal(row("alex@shop.test").signIn, "password");
assert.equal(o.accounts[0].email, "boss@agentic.test", "newest first");
o = await (await get(boss, "?sort=properties")).json();
assert.deepEqual(o.accounts.slice(0, 2).map((a: Any) => a.email), ["alex@shop.test", "bob@other.test"], "most sites & apps first; empty accounts last");
o = await (await get(boss, "?sort=sessions")).json();
assert.equal(o.accounts[0].email, "bob@other.test");
o = await (await get(boss, "?sort=active")).json();
assert.equal(o.accounts[0].email, "bob@other.test", "accounts with no traffic sort last");
o = await (await get(boss, "?q=BOB")).json();
assert.deepEqual(o.accounts.map((a: Any) => a.email), ["bob@other.test"], "search by email, case-insensitive");
assert.equal(o.matched, 1);
o = await (await get(boss, "?q=%25")).json();
assert.equal(o.matched, 0, "search wildcards are escaped");
ok("admin overview: totals, sites and apps per account, traffic, search, sort");

// Bulk accounts straight into the database (sign-up is rate limited, rightly).
for (let i = 0; i < 55; i++) await d.query("insert into users (id, email, name) values ($1, $2, $3)", [`bulk${i}`, `user${i}@bulk.test`, `User ${i}`]);
o = await (await get(boss)).json();
assert.deepEqual([o.accounts.length, o.pages, o.matched], [50, 2, 58]);
o = await (await get(boss, "?page=2")).json();
assert.equal(o.accounts.length, 8);
ok("admin overview pages through accounts, 50 at a time");

const alexId = (await (await me.GET(alex.req("/api/me"))).json()).user.id;
res = await accountRoute.GET(boss.req(`/api/admin/accounts/${alexId}`), { params: Promise.resolve({ id: alexId }) });
const detail = await res.json();
assert.equal(detail.account.email, "alex@shop.test");
assert.equal(detail.properties.length, 100);
const iosRow = detail.properties.find((p: Any) => p.appId === "com.shop.ios");
assert.deepEqual([iosRow.kind, iosRow.domain], ["mobile_app", "api.shop.test"]);
const raw = JSON.stringify(detail);
const leak = raw.match(/.{0,40}(aa_sk_|aa_pk_|scrypt\$|"secret|secret_hash|password_hash|siteKey).{0,40}/i); assert.ok(!leak, `no keys, secrets or password hashes: ${leak?.[0]}`);
assert.equal((await accountRoute.GET(alex.req(`/api/admin/accounts/${alexId}`), { params: Promise.resolve({ id: alexId }) })).status, 404);
assert.equal((await accountRoute.GET(boss.req("/api/admin/accounts/nope"), { params: Promise.resolve({ id: "nope" }) })).status, 404);
ok("account detail: every site and app with type, domain or bundle id and traffic; no keys or secrets; admins only");

console.log = log;
console.log(`\nAll ${step} sites, apps and admin checks passed.`);
process.exit(0);
