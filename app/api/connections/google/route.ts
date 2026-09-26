import { errorResponse, requireUser } from "@/lib/server/auth";
import { revoke, type GoogleTokens } from "@/lib/server/google";
import { deleteConnection, getConnection, requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";

/** Disconnect Gmail + Calendar: revoke at Google and forget the tokens. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const conn = await getConnection<GoogleTokens>(ws.id, "google");
    if (conn) await revoke(conn.secret.refreshToken);
    await deleteConnection(ws.id, "google");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
