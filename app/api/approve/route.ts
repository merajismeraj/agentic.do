import { toolContext, withCookie } from "@/lib/server/context";
import { toolByName } from "@/lib/server/tools";

export const runtime = "nodejs";

/** Executes a write action the user approved. */
export async function POST(req: Request) {
  const { tool, input, timeZone } = (await req.json()) as { tool?: string; input?: Record<string, unknown>; timeZone?: string };
  const def = tool ? toolByName(tool) : undefined;
  if (!def || def.kind !== "write") return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  const { ctx, setCookie } = await toolContext(req, timeZone);
  try {
    return withCookie(Response.json(await def.run(input ?? {}, ctx)), setCookie);
  } catch (e) {
    return withCookie(Response.json({ ok: false, live: def.isLive(ctx), summary: (e as Error).message }, { status: 502 }), setCookie);
  }
}
