import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { listAgentsForReview } from "@/lib/server/aa/registry";
import { isAaAdmin } from "@/lib/server/aa/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Registry review queue, for AA_ADMIN_EMAILS only. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!isAaAdmin(user.email)) throw new HttpError(403, "Registry reviewers only");
    return Response.json({ agents: await listAgentsForReview() });
  } catch (e) {
    return errorResponse(e);
  }
}
