import { currentUser } from "@/lib/server/auth";
import { googleConfigured } from "@/lib/server/google";
import { workspaceContext } from "@/lib/server/keys";
import { slackConfigured } from "@/lib/server/slack";
import { emailConfigured } from "@/lib/server/mailer";
import { providerStatus } from "@/lib/server/providers";
import { toolStatus } from "@/lib/server/tools";
import { getWorkspace } from "@/lib/server/workspace";
import type { LiveStatus, ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What can run for real for this account: its own keys (plus server-wide
 * ones only where SHARED_AI_KEYS allows). Signed-out visitors never run live.
 * Keys themselves are never returned — only their last four characters.
 */
export async function GET(req: Request) {
  const user = await currentUser(req);
  const ws = user ? await getWorkspace(user.id) : null;
  const wc = ws ? await workspaceContext(ws) : null;
  const access = wc?.access ?? { keys: {}, info: {}, shared: false };
  const google = wc?.ctx.google;
  const slack = wc?.ctx.slack;
  const base = providerStatus(access.keys);
  const providers = Object.fromEntries(
    Object.entries(base).map(([id, p]) => [id, { ...p, key: access.info[id as ProviderId], liveCapable: id !== "copilot" }]),
  ) as LiveStatus["providers"];
  const tools = toolStatus({ google, slack, timeZone: "UTC", shared: access.shared });
  const body: LiveStatus = {
    providers,
    tools,
    sharedKeys: access.shared,
    google: { configured: googleConfigured(), email: google?.email },
    slack: { configured: slackConfigured(), team: slack?.team },
    email: { configured: emailConfigured() },
  };
  return Response.json(body);
}
