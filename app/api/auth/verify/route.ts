import { verifyEmail } from "@/lib/server/account";
import { errorResponse, HttpError, sameOrigin } from "@/lib/server/auth";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** Confirms an email from the emailed link (POSTed by the page, so link prefetchers don't consume it). */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
    if (limited(`verify:${clientIp(req)}`, 30, 60 * 60_000)) throw new HttpError(429, "Too many attempts. Try again later.");
    const { token } = (await req.json()) as { token?: string };
    const userId = token ? await verifyEmail(token) : null;
    if (!userId) throw new HttpError(400, "This link is invalid, expired or already used. Request a new one from Settings.");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
