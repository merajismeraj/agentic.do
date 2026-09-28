import { DIRECTORY_MEDIA_TYPE } from "@/lib/aa/verifier";
import { directoryKeys } from "@/lib/server/aa/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-agent Web Bot Auth key directory (JWKS). Usable as a Signature-Agent URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const keys = await directoryKeys((await params).agentId);
  if (!keys.length) return Response.json({ error: "No active keys for this agent" }, { status: 404 });
  return new Response(JSON.stringify({ keys }), {
    headers: { "content-type": DIRECTORY_MEDIA_TYPE, "cache-control": "public, max-age=60", "access-control-allow-origin": "*" },
  });
}
