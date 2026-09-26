import { toolByName } from "@/lib/server/tools";

export const runtime = "nodejs";

/** Executes a write action the user approved. */
export async function POST(req: Request) {
  const { tool, input } = (await req.json()) as { tool?: string; input?: Record<string, unknown> };
  const def = tool ? toolByName(tool) : undefined;
  if (!def || def.kind !== "write") return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  try {
    const result = await def.run(input ?? {});
    return Response.json(result);
  } catch (e) {
    return Response.json({ ok: false, live: def.isLive(), summary: (e as Error).message }, { status: 502 });
  }
}
