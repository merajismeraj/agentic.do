import { isVerified, sendVerification } from "@/lib/server/account";
import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { emailConfigured } from "@/lib/server/mailer";
import { limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** Sends a fresh verification link to the signed-in user. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    if (await isVerified(user.id)) return Response.json({ ok: true, alreadyVerified: true });
    if (!emailConfigured()) throw new HttpError(503, "Email isn't configured on this server yet");
    if (limited(`resend-verify:${user.id}`, 3, 60 * 60_000)) throw new HttpError(429, "We just sent one — check your inbox and spam folder.");
    const r = await sendVerification(user);
    if (!r.ok) throw new HttpError(502, "Couldn't send the email right now. Try again in a minute.");
    return Response.json({ ok: true, to: user.email });
  } catch (e) {
    return errorResponse(e);
  }
}
