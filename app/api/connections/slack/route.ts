import { errorResponse, requireUser } from "@/lib/server/auth";
import { disconnectSlack } from "@/lib/server/slack";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";

/** Uninstalls the bot (revokes its token at Slack) and forgets it. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    await disconnectSlack(ws.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
