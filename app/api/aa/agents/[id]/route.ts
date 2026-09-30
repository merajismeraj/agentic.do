import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { deleteAgent, getAgent, setAgentStatus, type AgentStatus } from "@/lib/server/aa/registry";
import { isRegistryReviewer } from "@/lib/server/admin";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Review decision by a registry reviewer (AA_ADMIN_EMAILS or SUPER_ADMIN_EMAILS, confirmed email): approve (T3) or suspend.
 * Operators can't approve their own agents, but can suspend them.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const { status, note } = (await req.json()) as { status?: AgentStatus; note?: string };
    if (status !== "approved" && status !== "suspended" && status !== "pending") throw new HttpError(400, "status must be approved, suspended or pending");
    if (!isRegistryReviewer(user)) {
      const ws = await requireWorkspace(user.id);
      const own = await getAgent(id, ws.id);
      if (!own) throw new HttpError(404, "Agent not found");
      if (status !== "suspended") throw new HttpError(403, "Only registry reviewers can approve agents");
    }
    await setAgentStatus(id, status, note);
    return Response.json({ agent: await getAgent(id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    await deleteAgent(ws.id, (await params).id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
