import assert from "node:assert/strict";
const R = new URL("../", import.meta.url).href;
process.env.SESSION_SECRET = "x".repeat(40);
process.env.GOOGLE_CLIENT_ID = "cid";
process.env.GOOGLE_CLIENT_SECRET = "csecret";

const calls: { url: string; init?: RequestInit }[] = [];
const idToken = `h.${Buffer.from(JSON.stringify({ email: "alex@northstar.com" })).toString("base64url")}.s`;
let tokenCalls = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url === "https://oauth2.googleapis.com/token") {
    tokenCalls++;
    const p = new URLSearchParams(String(init?.body));
    if (p.get("grant_type") === "authorization_code") return json({ access_token: "at1", expires_in: 3600, refresh_token: "rt1", id_token: idToken });
    return json({ access_token: "at2", expires_in: 3600 });
  }
  if (url.startsWith("https://oauth2.googleapis.com/revoke")) return json({});
  if (url.includes("/gmail/v1/users/me/messages?")) return json({ messages: [{ id: "m1", threadId: "t1" }] });
  if (url.includes("/gmail/v1/users/me/messages/m1")) return json({ snippet: "Can we close 7.2?", payload: { headers: [{ name: "From", value: "Priya <priya@northwind.com>" }, { name: "Subject", value: "MSA" }, { name: "Date", value: "Mon" }, { name: "Message-ID", value: "<abc@mail>" }] } });
  if (url.endsWith("/gmail/v1/users/me/messages/send")) return json({ id: "s1", threadId: "t1" });
  if (url.includes("/calendar/v3/calendars/primary/events?sendUpdates")) return json({ id: "e1", htmlLink: "https://cal/e1" });
  if (url.includes("/calendar/v3/calendars/primary/events?")) return json({ items: [
    { summary: "Late call", start: { dateTime: "2026-10-01T23:30:00Z" }, end: { dateTime: "2026-10-02T00:00:00Z" } },   // Oct 2 in Kolkata
    { summary: "Standup", start: { dateTime: "2026-10-01T04:00:00Z" }, end: { dateTime: "2026-10-01T04:15:00Z" } },      // Oct 1 09:30 Kolkata
    { summary: "Offsite", start: { date: "2026-10-01" }, end: { date: "2026-10-02" } },
  ] });
  throw new Error("unmocked " + url);
}) as typeof fetch;

const cookiesFrom = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]);
const req = (url: string, cookie = "", init: RequestInit = {}) => new Request(url, { ...init, headers: { cookie, ...(init.headers ?? {}) } });

const start = await import(R + "app/api/oauth/google/start/route.ts");
const callback = await import(R + "app/api/oauth/google/callback/route.ts");
const status = await import(R + "app/api/status/route.ts");
const approve = await import(R + "app/api/approve/route.ts");
const disconnect = await import(R + "app/api/oauth/google/disconnect/route.ts");
const tools = await import(R + "lib/server/tools.ts");
const g = await import(R + "lib/server/seal.ts");

// 1. start: redirects to Google with state + offline access; rejects open redirects
let res = start.GET(req("http://app.test/api/oauth/google/start?return=//evil.com"));
const loc = new URL(res.headers.get("location")!);
assert.equal(loc.origin, "https://accounts.google.com");
assert.equal(loc.searchParams.get("access_type"), "offline");
assert.equal(loc.searchParams.get("redirect_uri"), "http://app.test/api/oauth/google/callback");
assert.ok(loc.searchParams.get("scope")!.includes("gmail.send"));
const stateCookie = cookiesFrom(res)[0];
assert.ok(stateCookie.includes(encodeURIComponent(encodeURIComponent("/app/integrations"))) || stateCookie.includes("%2Fapp%2Fintegrations"), "open redirect sanitized: " + stateCookie);
const nonce = loc.searchParams.get("state")!;
res = start.GET(req("http://app.test/api/oauth/google/start?return=/app/agents/abc"));
const state2 = cookiesFrom(res)[0];
const nonce2 = new URL(res.headers.get("location")!).searchParams.get("state")!;
console.log("✓ start redirects to Google, sanitizes return path");

// 2. callback: bad state rejected, good state stores sealed session
res = await callback.GET(req(`http://app.test/api/oauth/google/callback?code=c&state=wrong`, state2));
assert.match(res.headers.get("location")!, /google=invalid_state/);
res = await callback.GET(req(`http://app.test/api/oauth/google/callback?code=c&state=${nonce2}`, state2));
assert.equal(res.headers.get("location"), "http://app.test/app/agents/abc?google=connected");
const session = cookiesFrom(res).find((c) => c.startsWith("agentic_google="))!;
assert.ok(session && !session.includes("rt1"), "session cookie is sealed");
assert.ok(res.headers.getSetCookie().some((c) => c.startsWith("agentic_google=") && c.includes("HttpOnly")));
res = await callback.GET(req(`http://app.test/api/oauth/google/callback?error=access_denied&state=${nonce}`, stateCookie));
assert.match(res.headers.get("location")!, /google=denied/);
console.log("✓ callback verifies state, stores encrypted httpOnly session");

// 3. status sees the live session
let st = await (await status.GET(req("http://app.test/api/status", session))).json();
assert.equal(st.google.email, "alex@northstar.com");
assert.equal(st.tools.gmail, true); assert.equal(st.tools.gcal, true);
st = await (await status.GET(req("http://app.test/api/status"))).json();
assert.equal(st.tools.gmail, false);
console.log("✓ status: live with session, demo without");

// 4. tampered cookie ignored; expired token refreshed and re-sealed
st = await (await status.GET(req("http://app.test/api/status", session.slice(0, -4) + "AAAA"))).json();
assert.equal(st.google.email, undefined);
const expired = "agentic_google=" + g.seal({ email: "alex@northstar.com", refreshToken: "rt1", accessToken: "old", expiresAt: Date.now() - 1000 });
const before = tokenCalls;
const r4 = await status.GET(req("http://app.test/api/status", expired));
assert.equal(tokenCalls, before + 1);
assert.ok(r4.headers.getSetCookie()[0]?.startsWith("agentic_google="), "refreshed session re-set");
console.log("✓ tampered cookie rejected; expired token refreshed");

// 5. tools against Google APIs
const ctx = { google: { email: "alex@northstar.com", accessToken: "at1" }, timeZone: "Asia/Kolkata" };
const search = await tools.toolByName("gmail_search")!.run({ query: "from:priya" }, ctx);
assert.equal(search.live, true);
assert.equal((search.data as any[])[0].message_id, "<abc@mail>");
const cal = await tools.toolByName("calendar_list_events")!.run({ day: "2026-10-01" }, ctx);
assert.deepEqual((cal.data as any).events.map((e: any) => `${e.start} ${e.title}`), ["09:30 Standup", "all day Offsite"]);
await tools.toolByName("calendar_create_event")!.run({ title: "Close 7.2", start: "2026-10-01T23:45", duration_minutes: 30, guests: ["priya@northwind.com"] }, ctx);
const created = JSON.parse(String(calls.at(-1)!.init!.body));
assert.deepEqual(created.start, { dateTime: "2026-10-01T23:45:00", timeZone: "Asia/Kolkata" });
assert.deepEqual(created.end, { dateTime: "2026-10-02T00:15:00", timeZone: "Asia/Kolkata" });
assert.equal(created.attendees[0].email, "priya@northwind.com");
console.log("✓ Gmail search, calendar day filter in user timezone, event across midnight");

// 6. approve route sends real email with reply threading and safe headers
res = await approve.POST(req("http://app.test/api/approve", session, { method: "POST", body: JSON.stringify({ tool: "gmail_send", timeZone: "UTC", input: { to: "priya@northwind.com\r\nBcc: evil@x.com", subject: "Re: MSA – 7.2", body: "Thursday works.\nAlex", thread_id: "t1", message_id: "<abc@mail>" } }) }));
const out = await res.json();
assert.equal(out.ok, true); assert.equal(out.live, true);
const sendCall = calls.find((c) => c.url.endsWith("/messages/send"))!;
const payload = JSON.parse(String(sendCall.init!.body));
assert.equal(payload.threadId, "t1");
const raw = Buffer.from(payload.raw, "base64url").toString();
const [head, b64] = raw.split("\r\n\r\n");
assert.ok(!/\r\nBcc:/i.test(head), "header injection blocked");
assert.match(head, /In-Reply-To: <abc@mail>/);
assert.match(head, /Subject: =\?UTF-8\?B\?/);
assert.equal(Buffer.from(b64, "base64").toString(), "Thursday works.\nAlex");
assert.equal((sendCall.init!.headers as any).Authorization, "Bearer at1");
res = await approve.POST(req("http://app.test/api/approve", "", { method: "POST", body: JSON.stringify({ tool: "gmail_send", input: { to: "a@b.c", subject: "s", body: "b" } }) }));
assert.equal((await res.json()).live, false);
console.log("✓ approve sends via Gmail (threaded, UTF-8, no header injection); demo without session");

// 7. disconnect revokes and clears
res = await disconnect.POST(req("http://app.test/api/oauth/google/disconnect", session, { method: "POST" }));
assert.ok(calls.some((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke?token=rt1")));
assert.match(res.headers.getSetCookie()[0], /Max-Age=0/);
console.log("✓ disconnect revokes token and clears cookie");
console.log("\nALL GOOGLE TESTS PASSED");
