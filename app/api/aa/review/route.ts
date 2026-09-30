import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { listAgentsForReview } from "@/lib/server/aa/registry";
import { isRegistryReviewer } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Registry review queue, for AA_ADMIN_EMAILS (or SUPER_ADMIN_EMAILS) with a confirmed email only. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!isRegistryReviewer(user)) throw new HttpError(403, "Registry reviewers only");
    return Response.json({ agents: await listAgentsForReview() });
  } catch (e) {
    return errorResponse(e);
  }
}
