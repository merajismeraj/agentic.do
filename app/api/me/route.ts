import { currentUser, errorResponse } from "@/lib/server/auth";
import { getWorkspace, listActivity, listApprovals, listMessages, listRoutineRuns } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the app needs on load for the signed-in user. */
export async function GET(req: Request) {
  try {
    const user = await currentUser(req);
    if (!user) return Response.json({ user: null }, { status: 401 });
    const ws = await getWorkspace(user.id);
    if (!ws) return Response.json({ user, workspace: null });
    const [messages, approvals, activity, routineRuns] = await Promise.all([listMessages(ws.id), listApprovals(ws.id), listActivity(ws.id), listRoutineRuns(ws.id)]);
    return Response.json({ user, workspace: { doc: ws.doc, version: ws.version }, messages, approvals, activity, routineRuns });
  } catch (e) {
    return errorResponse(e);
  }
}
