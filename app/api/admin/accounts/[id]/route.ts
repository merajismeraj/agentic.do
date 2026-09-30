import { adminAccount, requireSuperAdmin } from "@/lib/server/admin";
import { errorResponse } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Super admin: one account with its sites, apps and registered agents. Read-only; never returns keys or secrets. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin(req);
    return Response.json(await adminAccount((await params).id));
  } catch (e) {
    return errorResponse(e);
  }
}
