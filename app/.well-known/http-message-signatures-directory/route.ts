import { DIRECTORY_MEDIA_TYPE } from "@/lib/aa/verifier";
import { directoryKeys } from "@/lib/server/aa/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This deployment's Web Bot Auth directory: every active key of every
 * non-suspended registered agent. Agents send `Signature-Agent: "<APP_URL>"`
 * and any compliant verifier (Cloudflare, Akamai, ours) can fetch it here.
 */
export async function GET() {
  return new Response(JSON.stringify({ keys: await directoryKeys() }), {
    headers: { "content-type": DIRECTORY_MEDIA_TYPE, "cache-control": "public, max-age=60", "access-control-allow-origin": "*" },
  });
}
