import { randomBytes } from "node:crypto";
import { cookie } from "@/lib/server/auth";
import { authUrl, googleConfigured, safeReturn, STATE_COOKIE } from "@/lib/server/google";

export const runtime = "nodejs";

/** Starts "Continue with Google". */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = safeReturn(url.searchParams.get("return"));
  if (!googleConfigured()) return Response.redirect(new URL("/login?google=not_configured", url.origin), 302);
  const nonce = randomBytes(16).toString("base64url");
  const res = new Response(null, { status: 302, headers: { Location: authUrl(url.origin, nonce) } });
  res.headers.append("Set-Cookie", cookie(STATE_COOKIE, `${nonce}.${encodeURIComponent(back)}`, 600));
  return res;
}
