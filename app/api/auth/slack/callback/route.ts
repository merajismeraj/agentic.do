import { cookie, currentUser, readCookie } from "@/lib/server/auth";
import { safeReturn } from "@/lib/server/google";
import { exchangeSlackCode, saveSlack, SLACK_SCOPES, SLACK_STATE_COOKIE } from "@/lib/server/slack";
import { getWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";

/** Slack redirects here after the user approves the install. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const [nonce, rawBack] = (readCookie(req, SLACK_STATE_COOKIE) ?? "").split(".");
  const back = safeReturn(rawBack ? decodeURIComponent(rawBack) : null);
  const land = (path: string, query: string) => {
    const res = new Response(null, { status: 302, headers: { Location: new URL(`${path}?${query}`, url.origin).toString() } });
    res.headers.append("Set-Cookie", cookie(SLACK_STATE_COOKIE, "", 0));
    return res;
  };

  if (url.searchParams.get("error")) return land(back, "slack=denied");
  const code = url.searchParams.get("code");
  if (!code || !nonce || url.searchParams.get("state") !== nonce) return land(back, "slack=invalid_state");

  const user = await currentUser(req);
  if (!user) return land("/login", "slack=signed_out");
  const ws = await getWorkspace(user.id);
  if (!ws) return land("/onboarding", "slack=no_workspace");

  try {
    const install = await exchangeSlackCode(code, url.origin);
    const granted = install.scope.split(",");
    await saveSlack(ws.id, install);
    const missing = SLACK_SCOPES.filter((s) => !granted.includes(s));
    return land(back, `${missing.length ? "slack=partial" : "slack=connected"}&team=${encodeURIComponent(install.teamName)}`);
  } catch (e) {
    return land(back, `slack=error&message=${encodeURIComponent((e as Error).message.slice(0, 160))}`);
  }
}
