import { currentUser } from "@/lib/server/auth";
import { googleAuthFor, googleConfigured } from "@/lib/server/google";
import { providerStatus } from "@/lib/server/providers";
import { toolStatus } from "@/lib/server/tools";
import { getWorkspace } from "@/lib/server/workspace";
import type { LiveStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What can run for real. Signed-out visitors (the demo) never run live. */
export async function GET(req: Request) {
  const user = await currentUser(req);
  const ws = user ? await getWorkspace(user.id) : null;
  const google = ws ? await googleAuthFor(ws.id) : undefined;
  const providers = providerStatus();
  if (!user) for (const p of Object.values(providers)) p.live = false;
  const tools = toolStatus({ google, timeZone: "UTC" });
  if (!user) for (const k of Object.keys(tools)) tools[k] = false;
  const body: LiveStatus = { providers, tools, google: { configured: googleConfigured(), email: google?.email } };
  return Response.json(body);
}
