import { cookie, createSession, currentUser, HttpError, readCookie, upsertGoogleUser } from "@/lib/server/auth";
import { exchangeCode, GOOGLE_SCOPES, safeReturn, STATE_COOKIE } from "@/lib/server/google";
import { getWorkspace, setConnection } from "@/lib/server/workspace";

export const runtime = "nodejs";

/** Google redirects here for both sign-in and Gmail/Calendar connection. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const [nonce, purpose, rawBack] = (readCookie(req, STATE_COOKIE) ?? "").split(".");
  const back = safeReturn(rawBack ? decodeURIComponent(rawBack) : null, purpose === "connect" ? "/app/integrations" : "/app");
  const land = (path: string, query: string, extraCookie?: string) => {
    const res = new Response(null, { status: 302, headers: { Location: new URL(`${path}?${query}`, url.origin).toString() } });
    res.headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
    if (extraCookie) res.headers.append("Set-Cookie", extraCookie);
    return res;
  };
  const failPath = purpose === "connect" ? back : "/login";

  if (url.searchParams.get("error")) return land(failPath, "google=denied");
  const code = url.searchParams.get("code");
  if (!code || !nonce || url.searchParams.get("state") !== nonce) return land(failPath, "google=invalid_state");

  try {
    const { identity, tokens, scope } = await exchangeCode(code, url.origin);

    if (purpose === "login") {
      const user = await upsertGoogleUser(identity);
      return land(back, "signed_in=1", await createSession(user.id));
    }

    const user = await currentUser(req);
    if (!user) return land("/login", "google=signed_out");
    const ws = await getWorkspace(user.id);
    if (!ws) return land("/onboarding", "google=no_workspace");
    if (!tokens) throw new Error("Google didn't return a refresh token; remove agentic.do's access in your Google account and try again");
    const granted = scope.split(" ");
    const missing = GOOGLE_SCOPES.filter((s) => s.startsWith("https://") && !granted.includes(s));
    await setConnection(ws.id, "google", identity.email, tokens);
    return land(back, missing.length ? "google=partial" : "google=connected");
  } catch (e) {
    const msg = e instanceof HttpError || e instanceof Error ? e.message : "Unknown error";
    return land(failPath, `google=error&message=${encodeURIComponent(msg.slice(0, 160))}`);
  }
}
