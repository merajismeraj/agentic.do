import { HttpError } from "@/lib/server/auth";
import { siteBySecret } from "@/lib/server/aa/sites";
import { verifyForSite } from "@/lib/server/aa/verify";
import { limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/**
 * Server-to-server verification for a tracked site's edge or backend
 * (Cloudflare Worker, Next.js proxy, Nginx auth_request…).
 *
 *   POST /api/aa/verify
 *   Authorization: Bearer aa_sk_…
 *   { "method": "GET", "url": "https://shop.example/p/1", "headers": { … }, "ip": "203.0.113.9" }
 *
 * Returns the trust tier, the default policy decision and a verification token
 * (vt) to embed in the page for the SDK: <script src=".../aa.js" data-site=… data-vt=…>.
 */
export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const site = await siteBySecret(auth.replace(/^Bearer\s+/i, ""));
    if (!site) throw new HttpError(401, "Invalid site secret");
    if (limited(`aa-verify:${site.id}`, 6000, 60_000)) throw new HttpError(429, "Slow down");
    const body = (await req.json()) as { method?: string; url?: string; headers?: Record<string, string>; ip?: string };
    if (typeof body.url !== "string" || !body.headers || typeof body.headers !== "object") throw new HttpError(400, "url and headers are required");
    let host: string;
    try {
      host = new URL(body.url).host;
    } catch {
      throw new HttpError(400, "url must be absolute");
    }
    // A signature is bound to @authority, so only this site's own host can be verified with its secret.
    if (host !== site.domain && !host.endsWith(`.${site.domain}`)) throw new HttpError(400, `url host must be ${site.domain}`);
    const v = await verifyForSite(site, { method: body.method ?? "GET", url: body.url, headers: body.headers, ip: body.ip ?? null });
    return Response.json({
      tier: v.tier,
      decision: v.decision,
      verification: v.verify.status === "invalid" ? { status: "invalid", reason: v.verify.reason } : { status: v.verify.status },
      agent: v.agent,
      external: v.external,
      declared: v.declared,
      vt: v.vt,
    });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
