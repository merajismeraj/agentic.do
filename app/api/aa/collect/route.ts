import { MAX_BATCH_BYTES } from "@/lib/aa/events";
import { HttpError } from "@/lib/server/auth";
import { collect } from "@/lib/server/aa/ingest";
import { requestIp } from "@/lib/server/aa/util";
import { limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/**
 * Receives SDK batches from any site that embeds aa.js. Public by design (the
 * site key is public), so it's size-capped, rate-limited and stores only
 * sanitized, content-free events.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
  try {
    const ip = requestIp(req);
    if (limited(`aa-collect:${ip ?? "local"}`, 240, 60_000)) throw new HttpError(429, "Slow down");
    const text = await req.text();
    if (text.length > MAX_BATCH_BYTES) throw new HttpError(413, "Batch too large");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
    // The public URL as the client addressed it: a signature binds @authority to that host.
    const url = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host) url.host = host;
    if (req.headers.get("x-forwarded-proto") === "https") url.protocol = "https:";
    const r = await collect(body, { ip, ua: req.headers.get("user-agent"), request: { method: "POST", url: url.toString(), headers: req.headers } });
    return reply({ ok: true, duplicate: r.duplicate });
  } catch (e) {
    if (e instanceof HttpError) return reply({ error: e.message }, e.status);
    console.error(e);
    return reply({ error: "Something went wrong" }, 500);
  }
}
