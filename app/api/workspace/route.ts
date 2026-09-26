import { errorResponse, requireUser } from "@/lib/server/auth";
import type { Message } from "@/lib/types";
import { saveDoc, validateDoc } from "@/lib/server/workspace";

export const runtime = "nodejs";

/**
 * Saves the workspace document. `baseVersion` must match the stored version
 * (409 with the current doc otherwise). Creates the workspace on first save.
 */
export async function PUT(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as { doc?: unknown; baseVersion?: number | null; init?: { messages?: Message[] } };
    const doc = validateDoc(body.doc);
    // Only a few short agent-authored welcome messages may be seeded at creation.
    const init = {
      messages: (body.init?.messages ?? [])
        .slice(0, 5)
        .filter((m) => m.author === "agent" && typeof m.text === "string" && typeof m.threadId === "string")
        .map((m) => ({ id: m.id, threadId: m.threadId.slice(0, 64), author: "agent" as const, agentId: m.agentId, text: m.text.slice(0, 4000), at: Date.now() })),
    };
    const r = await saveDoc(user.id, doc, body.baseVersion ?? null, init);
    return r.ok ? Response.json({ version: r.version }) : Response.json({ error: "conflict", doc: r.doc, version: r.version }, { status: 409 });
  } catch (e) {
    return errorResponse(e);
  }
}
