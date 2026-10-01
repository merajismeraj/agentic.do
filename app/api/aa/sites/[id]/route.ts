import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { deleteSite, getSite, renameSite, rotateSecret } from "@/lib/server/aa/sites";
import { siteOverview } from "@/lib/server/aa/stats";
import { db } from "@/lib/server/db";
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
    // ?check=1: is the script installed? (Polled by the install screen.)
    if (new URL(req.url).searchParams.get("check")) {
      const d = await db();
      const s = (
        await d.query<{ last: string | null; n: number }>(
          "select max(last_at) as last, count(*) filter (where last_at > now() - interval '1 day')::int as n from aa_sessions where site_id = $1",
          [site.id],
        )
      ).rows[0];
      const r = (await d.query<{ last: string | null }>("select max(at) as last from aa_requests where site_id = $1", [site.id])).rows[0];
      return Response.json({ lastEventAt: s?.last ?? null, sessions24h: s?.n ?? 0, lastVerifiedRequestAt: r?.last ?? null });
    }
    const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
    return Response.json({ site, overview: await siteOverview(site.id, days) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** { action: "rotate_secret" } returns a new server secret once; { action: "rename", name } renames. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const { action, name } = (await req.json()) as { action?: string; name?: string };
    const id = (await params).id;
    if (action === "rename") {
      await renameSite(ws.id, id, name ?? "");
      return Response.json({ site: await getSite(ws.id, id) });
    }
    if (action !== "rotate_secret") throw new HttpError(400, "Unknown action");
    return Response.json({ secret: await rotateSecret(ws.id, id) });
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
