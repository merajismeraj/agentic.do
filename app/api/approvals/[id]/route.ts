import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { workspaceContext } from "@/lib/server/keys";
import { toolByName } from "@/lib/server/tools";
import { claimApproval, getApproval, logActivity, requireWorkspace, setApprovalResult } from "@/lib/server/workspace";
import type { Approval } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Approve or discard a queued action. The action executed is the one stored
 * when the teammate proposed it; the browser can only edit the text fields the
 * tool marks as editable.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const { id } = await params;
    const { decision, edits } = (await req.json()) as { decision?: string; edits?: Approval["preview"] };
    if (decision !== "approved" && decision !== "rejected") throw new HttpError(400, "decision must be approved or rejected");

    const existing = await getApproval(ws.id, id);
    if (!existing) throw new HttpError(404, "Approval not found");

    if (decision === "rejected") {
      const a = await claimApproval(ws.id, id, "rejected");
      if (!a) throw new HttpError(409, "Already decided");
      await logActivity(ws.id, { agentId: a.agentId, toolId: a.toolId, text: `Discarded: ${a.title}` });
      return Response.json({ status: "rejected" });
    }

    // Apply the user's edits to the stored call, only for fields the tool allows.
    const tool = existing.call ? toolByName(existing.call.tool) : undefined;
    if (existing.call && (!tool || tool.kind !== "write")) throw new HttpError(400, "This action can't be executed");
    let call = existing.call;
    let preview = existing.preview;
    if (call && tool && edits?.length) {
      const input = { ...call.input };
      for (const f of edits) {
        const key = tool.editable?.[f.label];
        if (key && typeof f.value === "string" && typeof input[key] === "string") input[key] = f.value.slice(0, 20_000);
      }
      call = { tool: call.tool, input };
      preview = tool.preview?.(input) ?? preview;
    }

    const a = await claimApproval(ws.id, id, "approved", preview, call);
    if (!a) throw new HttpError(409, "Already decided");

    if (!a.call || !tool) {
      await logActivity(ws.id, { agentId: a.agentId, toolId: a.toolId, text: `Done: ${a.title}` });
      return Response.json({ status: "approved", ok: true, live: false, result: "Done", preview });
    }

    const { ctx } = await workspaceContext(ws);
    try {
      const r = await tool.run(a.call.input, ctx);
      await setApprovalResult(ws.id, id, r.summary);
      await logActivity(ws.id, { agentId: a.agentId, toolId: a.toolId, text: r.summary });
      return Response.json({ status: "approved", ok: r.ok, live: r.live, result: r.summary, preview });
    } catch (e) {
      const msg = `Failed: ${(e as Error).message}`;
      await setApprovalResult(ws.id, id, msg);
      await logActivity(ws.id, { agentId: a.agentId, toolId: a.toolId, text: msg });
      return Response.json({ status: "approved", ok: false, live: tool.isLive(ctx), result: msg, preview }, { status: 502 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
