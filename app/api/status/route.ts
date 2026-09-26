import { toolContext, withCookie } from "@/lib/server/context";
import { googleConfigured } from "@/lib/server/google";
import { providerStatus } from "@/lib/server/providers";
import { toolStatus } from "@/lib/server/tools";
import type { LiveStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which AI providers and integrations can run for real for this browser. */
export async function GET(req: Request) {
  const { ctx, setCookie } = await toolContext(req);
  const body: LiveStatus = {
    providers: providerStatus(),
    tools: toolStatus(ctx),
    google: { configured: googleConfigured(), email: ctx.google?.email },
  };
  return withCookie(Response.json(body), setCookie);
}
