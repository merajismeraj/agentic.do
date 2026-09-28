import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { deleteSite, getSite, rotateSecret } from "@/lib/server/aa/sites";
import { siteOverview } from "@/lib/server/aa/stats";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Analytics for one site: ?days=1..90 (default 7). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const site = await getSite(ws.id, (await params).id);
    if (!site) throw new HttpError(404, "Site not found");
    const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
    return Response.json({ site, overview: await siteOverview(site.id, days) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** { action: "rotate_secret" } returns a new server secret once. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const { action } = (await req.json()) as { action?: string };
    if (action !== "rotate_secret") throw new HttpError(400, "Unknown action");
    return Response.json({ secret: await rotateSecret(ws.id, (await params).id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    await deleteSite(ws.id, (await params).id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
