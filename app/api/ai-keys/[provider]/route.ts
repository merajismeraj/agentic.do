import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { deleteAiKey, saveAiKey } from "@/lib/server/keys";
import { liveCapable, verifyKey } from "@/lib/server/providers";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { sealingConfigured } from "@/lib/server/seal";
import { requireWorkspace } from "@/lib/server/workspace";
import { PROVIDERS } from "@/lib/catalog";
import type { ProviderId } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ provider: string }> };

async function provider(ctx: Ctx) {
  const { provider } = await ctx.params;
  if (!PROVIDERS.some((p) => p.id === provider)) throw new HttpError(404, "Unknown AI provider");
  return provider as ProviderId;
}

/**
 * Saves this workspace's API key for a provider, after checking it with the
 * provider. The key is sealed at rest and never returned to the browser.
 */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const id = await provider(ctx);
    if (!liveCapable(id)) throw new HttpError(400, "This provider has no public API, so it can't run live yet.");
    if (!sealingConfigured()) throw new HttpError(503, "The server can't store keys securely yet (SESSION_SECRET isn't set).");
    if (limited(`ai-key:${user.id}:${clientIp(req)}`, 20, 60 * 60_000)) throw new HttpError(429, "Too many key checks. Try again in a bit.");
    const { apiKey } = (await req.json()) as { apiKey?: string };
    const key = (apiKey ?? "").trim();
    if (key.length < 16 || key.length > 400 || /\s/.test(key)) throw new HttpError(400, "That doesn't look like an API key.");
    const problem = await verifyKey(id, key);
    if (problem) throw new HttpError(400, problem);
    await saveAiKey(ws, id, key);
    return Response.json({ ok: true, hint: `…${key.slice(-4)}` });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    await deleteAiKey(ws, await provider(ctx));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
