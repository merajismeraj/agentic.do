import { errorResponse, requireUser } from "@/lib/server/auth";
import { createSite, listSites } from "@/lib/server/aa/sites";
import { requireWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sites this workspace tracks. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    return Response.json({ sites: await listSites(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Add a site. The response carries the server secret once; only its hash is kept. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const ws = await requireWorkspace(user.id);
    const { name, domain } = (await req.json()) as { name?: string; domain?: string };
    return Response.json({ site: await createSite(ws.id, name ?? "", domain ?? "") });
  } catch (e) {
    return errorResponse(e);
  }
}
