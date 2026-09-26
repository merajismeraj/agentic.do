import { randomBytes } from "node:crypto";
import { cookie, currentUser } from "@/lib/server/auth";
import { safeReturn } from "@/lib/server/google";
import { SLACK_STATE_COOKIE, slackAuthUrl, slackConfigured } from "@/lib/server/slack";

export const runtime = "nodejs";

/** Starts "Add to Slack" for the signed-in user's workspace. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = safeReturn(url.searchParams.get("return"));
  const go = (path: string) => Response.redirect(new URL(path, url.origin), 302);
  if (!slackConfigured()) return go(`${back}?slack=not_configured`);
  if (!(await currentUser(req))) return go(`/login?return=${encodeURIComponent(back)}`);

  const nonce = randomBytes(16).toString("base64url");
  const res = new Response(null, { status: 302, headers: { Location: slackAuthUrl(url.origin, nonce) } });
  res.headers.append("Set-Cookie", cookie(SLACK_STATE_COOKIE, `${nonce}.${encodeURIComponent(back)}`, 600));
  return res;
}
