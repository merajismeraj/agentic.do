import { sendPasswordReset } from "@/lib/server/account";
import { errorResponse, findUserByEmail, HttpError, normalizeEmail, sameOrigin, validEmail } from "@/lib/server/auth";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/**
 * Emails a reset link if the account exists. The response is identical either
 * way so this can't be used to discover who has an account.
 */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
    const { email } = (await req.json()) as { email?: string };
    const e = normalizeEmail(email ?? "");
    if (!validEmail(e)) throw new HttpError(400, "Enter a valid email address");
    if (limited(`forgot-ip:${clientIp(req)}`, 10, 60 * 60_000) || limited(`forgot:${e}`, 3, 60 * 60_000))
      throw new HttpError(429, "Too many reset requests. Check your inbox, or try again in an hour.");
    const user = await findUserByEmail(e);
    if (user) {
      const r = await sendPasswordReset(user);
      if (!r.ok) console.error(`[auth] reset email to user ${user.id} failed: ${r.error}`);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
