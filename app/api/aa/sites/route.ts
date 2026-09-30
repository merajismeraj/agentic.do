import { errorResponse, requireUser } from "@/lib/server/auth";
import { createSite, listSites, MAX_PROPERTIES, type NewProperty } from "@/lib/server/aa/sites";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sites and apps this account tracks, and the limit. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    return Response.json({ sites: await listSites(ws.id), limit: MAX_PROPERTIES });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Add a site or app: { name, kind, domain, appId? }. The response carries the server secret once; only its hash is kept. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const body = (await req.json()) as NewProperty;
    return Response.json({ site: await createSite(ws.id, body) });
  } catch (e) {
    return errorResponse(e);
  }
}
