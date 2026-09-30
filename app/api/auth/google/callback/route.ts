import { cookie, createSession, HttpError, readCookie, upsertGoogleUser } from "@/lib/server/auth";
import { exchangeCode, safeReturn, STATE_COOKIE } from "@/lib/server/google";

export const runtime = "nodejs";

/** Google redirects here after "Continue with Google". */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const [nonce, rawBack] = (readCookie(req, STATE_COOKIE) ?? "").split(".");
  const back = safeReturn(rawBack ? decodeURIComponent(rawBack) : null);
  const land = (path: string, query: string, extraCookie?: string) => {
    const res = new Response(null, { status: 302, headers: { Location: new URL(`${path}?${query}`, url.origin).toString() } });
    res.headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
    if (extraCookie) res.headers.append("Set-Cookie", extraCookie);
    return res;
  };

  if (url.searchParams.get("error")) return land("/login", "google=denied");
  const code = url.searchParams.get("code");
  if (!code || !nonce || url.searchParams.get("state") !== nonce) return land("/login", "google=invalid_state");

  try {
    const user = await upsertGoogleUser(await exchangeCode(code, url.origin));
    return land(back, "signed_in=1", await createSession(user.id));
  } catch (e) {
    const msg = e instanceof HttpError || e instanceof Error ? e.message : "Unknown error";
    return land("/login", `google=error&message=${encodeURIComponent(msg.slice(0, 160))}`);
  }
}
