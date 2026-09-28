import { errorResponse, requireUser } from "@/lib/server/auth";
import { revokeKey } from "@/lib/server/aa/registry";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";

/** Revoke a key. It leaves the public directory at once; verifiers see it within their cache TTL. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; kid: string }> }) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const { id, kid } = await params;
    await revokeKey(ws.id, id, kid);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
