import { adminOverview, requireSuperAdmin, type AdminSort } from "@/lib/server/admin";
import { errorResponse } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Super admin: totals and a page of accounts. ?q=search&page=1&sort=created|sessions|properties|active */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const u = new URL(req.url).searchParams;
    return Response.json(await adminOverview({ q: u.get("q") ?? "", page: Number(u.get("page")) || 1, sort: (u.get("sort") as AdminSort) ?? "created" }));
  } catch (e) {
    return errorResponse(e);
  }
}
