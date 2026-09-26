import { randomBytes } from "node:crypto";
import { cookie, currentUser } from "@/lib/server/auth";
import { authUrl, googleConfigured, safeReturn, STATE_COOKIE, type OAuthPurpose } from "@/lib/server/google";

export const runtime = "nodejs";

/** Starts Google OAuth. `?purpose=login` signs in; `?purpose=connect` links Gmail + Calendar. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const purpose: OAuthPurpose = url.searchParams.get("purpose") === "connect" ? "connect" : "login";
  const back = safeReturn(url.searchParams.get("return"), purpose === "login" ? "/app" : "/app/integrations");
  const go = (path: string) => Response.redirect(new URL(path, url.origin), 302);

  if (!googleConfigured()) return go(`${purpose === "login" ? "/login" : back}?google=not_configured`);
  const user = purpose === "connect" ? await currentUser(req) : null;
  if (purpose === "connect" && !user) return go(`/login?return=${encodeURIComponent(back)}`);

  const nonce = randomBytes(16).toString("base64url");
  const res = new Response(null, { status: 302, headers: { Location: authUrl(url.origin, nonce, purpose, user?.email) } });
  res.headers.append("Set-Cookie", cookie(STATE_COOKIE, `${nonce}.${purpose}.${encodeURIComponent(back)}`, 600));
  return res;
}
