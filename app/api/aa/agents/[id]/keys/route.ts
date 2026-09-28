import { errorResponse, requireUser } from "@/lib/server/auth";
import { addKey } from "@/lib/server/aa/registry";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";

/** Add a public key (rotation: add the new key, switch signing, then revoke the old one). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const { publicJwk } = (await req.json()) as { publicJwk?: unknown };
    return Response.json({ kid: await addKey(ws.id, (await params).id, publicJwk) });
  } catch (e) {
    return errorResponse(e);
  }
}
