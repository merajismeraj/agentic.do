import { cookieHeader, exchangeCode, readCookie, safeReturn, sessionCookie, STATE_COOKIE } from "@/lib/server/google";

export const runtime = "nodejs";

/** Google redirects here after consent. Verifies state, stores the sealed session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const [nonce, rawBack] = (readCookie(req, STATE_COOKIE) ?? "").split(".");
  const back = safeReturn(rawBack ? decodeURIComponent(rawBack) : null);
  const land = (q: string) => {
    const res = new Response(null, { status: 302, headers: { Location: new URL(`${back}?${q}`, url.origin).toString() } });
    res.headers.append("Set-Cookie", cookieHeader(STATE_COOKIE, "", 0));
    return res;
  };

  if (url.searchParams.get("error")) return land(`google=denied`);
  const code = url.searchParams.get("code");
  if (!code || !nonce || url.searchParams.get("state") !== nonce) return land("google=invalid_state");

  try {
    const session = await exchangeCode(code, url.origin);
    const res = land("google=connected");
    res.headers.append("Set-Cookie", sessionCookie(session));
    return res;
  } catch (e) {
    return land(`google=error&message=${encodeURIComponent((e as Error).message.slice(0, 160))}`);
  }
}
