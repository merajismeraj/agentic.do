/**
 * End-to-end tests for the API route handlers against an in-memory Postgres
 * (PGlite), with Google and OpenAI mocked at the fetch layer.
 *   npm test
 */
import assert from "node:assert/strict";

process.env.PGLITE_DIR = "memory://";
process.env.SESSION_SECRET = "x".repeat(40);
process.env.GOOGLE_CLIENT_ID = "cid";
process.env.GOOGLE_CLIENT_SECRET = "csecret";
process.env.OPENAI_API_KEY = "test-key";
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY", "XAI_API_KEY", "SLACK_BOT_TOKEN", "GITHUB_TOKEN", "LINEAR_API_KEY", "DATABASE_URL", "OPENAI_BASE_URL"])
  delete process.env[k];

const R = new URL("../", import.meta.url).href;
const route = (p: string) => import(R + p);

/* ---------------------------- fetch mocks ---------------------------- */

const calls: { url: string; body?: string }[] = [];
const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
let nextIdentity: object = { sub: "g-1", email: "gina@acme.com", name: "Gina", email_verified: true };
const tokenScope =
  "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events";
type Any = any;
let chatScript: ((body: Any) => Any) | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = init?.body != null ? String(init.body) : input instanceof Request ? await input.clone().text() : undefined;
  calls.push({ url, body });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url === "https://oauth2.googleapis.com/token") {
    const p = new URLSearchParams(body);
    if (p.get("grant_type") === "authorization_code")
      return json({ access_token: "at1", expires_in: 3600, refresh_token: "rt1", id_token: idToken(nextIdentity), scope: tokenScope });
    return json({ access_token: "at2", expires_in: 3600 });
  }
  if (url.startsWith("https://oauth2.googleapis.com/revoke")) return json({});
  if (url.includes("/gmail/v1/users/me/messages?")) return json({ messages: [{ id: "m1", threadId: "t1" }] });
  if (url.includes("/gmail/v1/users/me/messages/m1"))
    return json({
      snippet: "Can we close 7.2?",
      payload: { headers: [{ name: "From", value: "Priya <priya@northwind.com>" }, { name: "Subject", value: "MSA" }, { name: "Message-ID", value: "<abc@mail>" }] },
    });
  if (url.endsWith("/gmail/v1/users/me/messages/send")) return json({ id: "s1", threadId: "t1" });
  if (url.includes("/calendar/v3/calendars/primary/events?sendUpdates")) return json({ id: "e1", htmlLink: "https://cal/e1" });
  if (url.includes("/calendar/v3/calendars/primary/events?"))
    return json({
      items: [
        { summary: "Late call", start: { dateTime: "2026-10-01T23:30:00Z" }, end: { dateTime: "2026-10-02T00:00:00Z" } },
        { summary: "Standup", start: { dateTime: "2026-10-01T04:00:00Z" }, end: { dateTime: "2026-10-01T04:15:00Z" } },
        { summary: "Offsite", start: { date: "2026-10-01" }, end: { date: "2026-10-02" } },
      ],
    });
  if (url.endsWith("/chat/completions")) {
    const b = JSON.parse(body!);
    const msg = chatScript!(b);
    return json({ id: "x", object: "chat.completion", created: 0, model: b.model, choices: [{ index: 0, message: msg, finish_reason: msg.tool_calls ? "tool_calls" : "stop" }] });
  }
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

async function readStream(res: Response): Promise<Any[]> {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const doc = (overrides: Record<string, unknown> = {}) => ({
  user: { name: "Alex", company: "Northstar", role: "Founder", timezone: "Asia/Kolkata" },
  brains: [{ providerId: "chatgpt", plan: "Plus", usage: 10, resetsIn: "5d", enabled: true, connectedAt: 0 }],
  routing: "auto",
  connected: ["gmail", "hubspot"],
  agents: [
    { id: "rex", name: "Rex", role: "Sales SDR", emoji: "🎯", color: "#F59E0B", instructions: "Research leads", tools: ["hubspot", "gmail"], brain: "auto", autonomy: "ask", status: "idle", hiredAt: 0 },
  ],
  routines: [],
  memory: [{ id: "m1", text: "ICP is mid-market ops teams", source: "test", scope: "company" }],
  ...overrides,
});

let step = 0;
const ok = (name: string) => console.log(`✓ ${++step}. ${name}`);

const signup = await route("app/api/auth/signup/route.ts");
const login = await route("app/api/auth/login/route.ts");
const logout = await route("app/api/auth/logout/route.ts");
const me = await route("app/api/me/route.ts");
const workspace = await route("app/api/workspace/route.ts");
const run = await route("app/api/run/route.ts");
const approvals = await route("app/api/approvals/[id]/route.ts");
const status = await route("app/api/status/route.ts");
const gStart = await route("app/api/auth/google/start/route.ts");
const gCallback = await route("app/api/auth/google/callback/route.ts");
const gConn = await route("app/api/connections/google/route.ts");
const tools = await route("lib/server/tools.ts");
const approve = (b: Browser, id: string, body: unknown) =>
  approvals.POST(b.req(`/api/approvals/${id}`, { method: "POST", body }), { params: Promise.resolve({ id }) });
const meOf = async (b: Browser) => (await me.GET(b.req("/api/me"))).json();
const statusOf = async (b: Browser) => (await status.GET(b.req("/api/status"))).json();

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

let body = await meOf(alex);
assert.equal(body.user.email, "alex@northstar.com");
assert.equal(body.workspace, null);
assert.equal((await me.GET(new Browser().req("/api/me"))).status, 401);
ok("/api/me requires a session; a new account has no workspace yet");

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

res = await workspace.PUT(alex.req("/api/workspace", { method: "PUT", body: { doc: doc(), baseVersion: null }, origin: "https://evil.example" }));
assert.equal(res.status, 403);
ok("cross-site writes are rejected");

/* ---------------------------- workspace ------------------------------ */

res = await workspace.PUT(alex.req("/api/workspace", { method: "PUT", body: { doc: { ...doc(), routing: "nonsense" }, baseVersion: null } }));
assert.equal(res.status, 400);
res = await workspace.PUT(
  alex.req("/api/workspace", {
    method: "PUT",
    body: { doc: doc(), baseVersion: null, init: { messages: [{ id: "welcome1", threadId: "rex", author: "agent", agentId: "rex", text: "Hi, I'm Rex", at: Date.now() - 5000 }] } },
  }),
);
assert.deepEqual(await res.json(), { version: 1 });
body = await meOf(alex);
assert.equal(body.workspace.doc.agents[0].name, "Rex");
assert.equal(body.messages[0].text, "Hi, I'm Rex");
res = await workspace.PUT(alex.req("/api/workspace", { method: "PUT", body: { doc: doc({ routing: "cost" }), baseVersion: 1 } }));
assert.deepEqual(await res.json(), { version: 2 });
res = await workspace.PUT(alex.req("/api/workspace", { method: "PUT", body: { doc: doc({ routing: "quality" }), baseVersion: 1 } }));
assert.equal(res.status, 409);
body = await res.json();
assert.equal(body.version, 2);
assert.equal(body.doc.routing, "cost");
ok("workspace validates, is created with a welcome message, and rejects stale writes (409 + latest)");

/* ---------------------------- live runs ------------------------------ */

chatScript = (b) => {
  const toolMsgs = b.messages.filter((m: Any) => m.role === "tool").length;
  assert.ok(b.messages[0].content.includes("mid-market ops"), "memory comes from the stored workspace");
  assert.deepEqual(
    b.tools.map((t: Any) => t.function.name).sort(),
    ["gmail_search", "gmail_send", "hubspot_search", "hubspot_update_deal"],
    "tools come from the stored teammate",
  );
  if (toolMsgs === 0) return { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "hubspot_search", arguments: '{"query":"inbound"}' } }] };
  if (toolMsgs === 1)
    return {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c2", type: "function", function: { name: "gmail_send", arguments: JSON.stringify({ to: "dana@lumen.io", subject: "Intro", body: "Hi Dana" }) } }],
    };
  return { role: "assistant", content: "Drafted a note to Dana — it's in Approvals." };
};
res = await run.POST(
  alex.req("/api/run", {
    method: "POST",
    // A tampered client can't widen the teammate's tools or swap its prompt: only agentId + text are used.
    body: { agentId: "rex", text: "Find leads and email the best", messageId: "clientMsg01", replyId: "clientRep01", agent: { tools: ["slack"] } },
  }),
);
const events = await readStream(res);
assert.equal(events.at(-1).t, "done");
assert.equal(events.at(-1).mode, "live");
const approvalEvent = events.find((e) => e.t === "approval").approval;
assert.equal(approvalEvent.title, "Email dana@lumen.io: “Intro”");
body = await meOf(alex);
const thread = body.messages.filter((m: Any) => m.threadId === "rex");
assert.deepEqual(
  thread.map((m: Any) => m.id),
  ["welcome1", "clientMsg01", "clientRep01"],
);
assert.equal(thread[2].text, "Drafted a note to Dana — it's in Approvals.");
assert.equal(thread[2].mode, "live");
assert.deepEqual(thread[2].approvalIds, [approvalEvent.id]);
assert.equal(body.approvals[0].call.tool, "gmail_send");
assert.match(body.activity[0].text, /Prepared/);
ok("runs use the stored teammate, stream live events, and persist thread + approval + activity");

res = await run.POST(alex.req("/api/run", { method: "POST", body: { agentId: "nobody", text: "hi" } }));
assert.equal(res.status, 404);
ok("runs reject unknown teammates");

/* ---------------------------- approvals ------------------------------ */

const bob = new Browser();
bob.take(await signup.POST(bob.req("/api/auth/signup", { method: "POST", body: { email: "bob@other.com", password: "bob's long password", name: "Bob" } })));
await workspace.PUT(bob.req("/api/workspace", { method: "PUT", body: { doc: doc(), baseVersion: null } }));
res = await approve(bob, approvalEvent.id, { decision: "approved" });
assert.equal(res.status, 404);
ok("another account can't see or approve someone else's action");

res = await approve(alex, approvalEvent.id, {
  decision: "approved",
  edits: [
    { label: "Body", value: "Hi Dana — edited by Alex" },
    { label: "thread_id", value: "hijack" },
  ],
  call: { tool: "slack_post_message", input: { channel: "#general", text: "pwned" } },
});
body = await res.json();
assert.equal(body.status, "approved");
assert.equal(body.live, false, "no Google yet, so a demo send");
assert.ok(body.preview.find((f: Any) => f.label === "Body").value.includes("edited by Alex"));
body = await meOf(alex);
const stored = body.approvals.find((a: Any) => a.id === approvalEvent.id);
assert.equal(stored.call.tool, "gmail_send", "client can't swap the action");
assert.equal(stored.call.input.body, "Hi Dana — edited by Alex");
assert.equal(stored.call.input.thread_id, undefined, "non-editable fields ignored");
res = await approve(alex, approvalEvent.id, { decision: "approved" });
assert.equal(res.status, 409);
ok("approve runs the stored action with only whitelisted edits, exactly once");

/* ---------------------------- demo --------------------------------- */

const visitor = new Browser();
res = await run.POST(visitor.req("/api/run", { method: "POST", body: { agentId: "rex", text: "hi" } }));
assert.equal(res.status, 401);
const modelCalls = () => calls.filter((c) => c.url.endsWith("/chat/completions")).length;
const before = modelCalls();
res = await run.POST(visitor.req("/api/run", { method: "POST", body: { demo: { ...doc(), agent: doc().agents[0], text: "Research new leads", threadId: "rex", history: [] } } }));
const demoEvents = await readStream(res);
assert.equal(demoEvents.at(-1).mode, "demo");
assert.equal(modelCalls(), before, "demo never calls a real model");
assert.equal((await statusOf(visitor)).providers.chatgpt.live, false);
assert.equal((await statusOf(alex)).providers.chatgpt.live, true);
ok("the signed-out demo is always simulated and never spends API credit");

/* ---------------------------- Google --------------------------------- */

res = await gStart.GET(new Browser().req("/api/auth/google/start?purpose=connect&return=/app/integrations"));
assert.match(res.headers.get("location")!, /\/login\?return=%2Fapp%2Fintegrations$/);
res = alex.take(await gStart.GET(alex.req("/api/auth/google/start?purpose=connect&return=//evil.com")));
let loc = new URL(res.headers.get("location")!);
assert.equal(loc.origin, "https://accounts.google.com");
assert.equal(loc.searchParams.get("access_type"), "offline");
assert.ok(loc.searchParams.get("scope")!.includes("gmail.send"));
assert.ok(decodeURIComponent(alex.jar.get("agentic_oauth_state")!).endsWith("/app/integrations"), "open redirect sanitized");
res = await gCallback.GET(alex.req(`/api/auth/google/callback?code=c&state=wrong`));
assert.match(res.headers.get("location")!, /google=invalid_state/);
nextIdentity = { sub: "g-alex", email: "alex.work@gmail.com", name: "Alex", email_verified: true };
res = alex.take(await gCallback.GET(alex.req(`/api/auth/google/callback?code=c&state=${loc.searchParams.get("state")}`)));
assert.equal(res.headers.get("location"), "http://app.test/app/integrations?google=connected");
body = await statusOf(alex);
assert.equal(body.google.email, "alex.work@gmail.com");
assert.equal(body.tools.gmail, true);
assert.equal((await statusOf(bob)).google.email, undefined, "connection is per workspace");
ok("connect Google: requires sign-in, checks state, blocks open redirects, stores tokens per workspace");

let turn = 0;
chatScript = (b) => {
  turn++;
  const toolMsgs = b.messages.filter((m: Any) => m.role === "tool");
  if (turn === 1) return { role: "assistant", content: null, tool_calls: [{ id: "g1", type: "function", function: { name: "gmail_search", arguments: '{"query":"from:priya"}' } }] };
  if (turn === 2) {
    assert.ok(toolMsgs[0].content.includes("<abc@mail>"), "real Gmail data reaches the model");
    return {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "g2",
          type: "function",
          function: {
            name: "gmail_send",
            arguments: JSON.stringify({ to: "priya@northwind.com\r\nBcc: evil@x.com", subject: "Re: MSA – 7.2", body: "Thursday works.\nAlex", thread_id: "t1", message_id: "<abc@mail>" }),
          },
        },
      ],
    };
  }
  return { role: "assistant", content: "Reply drafted." };
};
const ev2 = await readStream(await run.POST(alex.req("/api/run", { method: "POST", body: { agentId: "rex", text: "Reply to Priya" } })));
assert.ok(ev2.some((e) => e.t === "step" && e.step.label === "Searching Gmail" && e.step.state === "done" && !String(e.step.detail).includes("demo")));
const gApproval = ev2.find((e) => e.t === "approval").approval;
body = await (await approve(alex, gApproval.id, { decision: "approved" })).json();
assert.equal(body.ok, true);
assert.equal(body.live, true);
const send = calls.filter((c) => c.url.endsWith("/messages/send")).at(-1)!;
const payload = JSON.parse(send.body!);
const [head, b64] = Buffer.from(payload.raw, "base64url").toString().split("\r\n\r\n");
assert.equal(payload.threadId, "t1");
assert.ok(!/\r\nBcc:/i.test(head), "header injection blocked");
assert.match(head, /From: alex\.work@gmail\.com/);
assert.match(head, /In-Reply-To: <abc@mail>/);
assert.match(head, /Subject: =\?UTF-8\?B\?/);
assert.equal(Buffer.from(b64, "base64").toString(), "Thursday works.\nAlex");
ok("live Gmail: search feeds the model; the approved reply is threaded, UTF-8 and injection-safe");

const gctx = { google: { email: "a", accessToken: "t" }, timeZone: "Asia/Kolkata" };
const cal = await tools.toolByName("calendar_list_events").run({ day: "2026-10-01" }, gctx);
assert.deepEqual(
  cal.data.events.map((e: Any) => `${e.start} ${e.title}`),
  ["09:30 Standup", "all day Offsite"],
);
await tools.toolByName("calendar_create_event").run({ title: "Close 7.2", start: "2026-10-01T23:45", duration_minutes: 30 }, gctx);
const created = JSON.parse(calls.at(-1)!.body!);
assert.deepEqual(created.end, { dateTime: "2026-10-02T00:15:00", timeZone: "Asia/Kolkata" });
ok("calendar: day view in the user's timezone; events can cross midnight");

const { db } = await route("lib/server/db.ts");
const { seal } = await route("lib/server/seal.ts");
const { getConnection } = await route("lib/server/workspace.ts");
const d = await db();
const ws = (await d.query("select w.id from workspaces w join users u on u.id = w.owner_id where u.email = 'alex@northstar.com'")).rows[0];
const raw = (await d.query("select secret from connections where workspace_id = $1", [ws.id])).rows[0].secret;
assert.ok(!raw.includes("rt1") && !raw.includes("at1"), "tokens are encrypted at rest");
await d.query("update connections set secret = $1 where workspace_id = $2", [seal({ refreshToken: "rt1", accessToken: "old", expiresAt: Date.now() - 1 }), ws.id]);
assert.equal((await statusOf(alex)).google.email, "alex.work@gmail.com");
assert.equal((await getConnection(ws.id, "google")).secret.accessToken, "at2", "refreshed token persisted");
ok("Google tokens are encrypted at rest, and refreshed + persisted when expired");

res = await gConn.DELETE(alex.req("/api/connections/google", { method: "DELETE" }));
assert.equal(res.status, 200);
assert.ok(calls.some((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke?token=rt1")));
assert.equal((await statusOf(alex)).google.email, undefined);
ok("disconnect revokes at Google and deletes the tokens");

// Sign in with Google: new user, repeat login, and no takeover of a password account via an unverified email.
const googleLogin = async (b: Browser) => {
  const r = b.take(await gStart.GET(b.req("/api/auth/google/start?purpose=login&return=/onboarding")));
  const l = new URL(r.headers.get("location")!);
  return { scope: l.searchParams.get("scope"), res: b.take(await gCallback.GET(b.req(`/api/auth/google/callback?code=c&state=${l.searchParams.get("state")}`))) };
};
nextIdentity = { sub: "g-1", email: "gina@acme.com", name: "Gina", email_verified: true };
const gina = new Browser();
let g = await googleLogin(gina);
assert.equal(g.scope, "openid email profile", "sign-in asks for identity only");
assert.equal(g.res.headers.get("location"), "http://app.test/onboarding?signed_in=1");
const ginaId = (await meOf(gina)).user.id;
const gina2 = new Browser();
await googleLogin(gina2);
assert.equal((await meOf(gina2)).user.id, ginaId, "same Google account → same user");
nextIdentity = { sub: "g-bob", email: "bob@other.com", name: "Bob", email_verified: false };
g = await googleLogin(new Browser());
assert.match(g.res.headers.get("location")!, /\/login\?google=error/, "unverified email can't take over an existing account");
nextIdentity = { sub: "g-bob", email: "bob@other.com", name: "Bob", email_verified: true };
const bobG = new Browser();
await googleLogin(bobG);
assert.equal((await meOf(bobG)).user.email, "bob@other.com");
assert.equal((await meOf(bobG)).workspace.doc.agents[0].name, "Rex", "verified email links to the existing account");
ok("Sign in with Google: identity-only scopes, stable accounts, linking only via verified email");

console.log("\nALL API TESTS PASSED");
process.exit(0);
