import { randomBytes } from "node:crypto";
import { authUrl, cookieHeader, googleConfigured, safeReturn, STATE_COOKIE } from "@/lib/server/google";

export const runtime = "nodejs";

/** Starts Google sign-in. `?return=/app/...` is where to land afterwards. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const back = safeReturn(url.searchParams.get("return"));
  if (!googleConfigured()) return Response.redirect(new URL(`${back}?google=not_configured`, url.origin), 302);

  const nonce = randomBytes(16).toString("base64url");
  const res = new Response(null, { status: 302, headers: { Location: authUrl(url.origin, nonce) } });
  res.headers.append("Set-Cookie", cookieHeader(STATE_COOKIE, `${nonce}.${encodeURIComponent(back)}`, 600));
  return res;
}
