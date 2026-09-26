import { resetPassword } from "@/lib/server/account";
import { createSession, errorResponse, HttpError, sameOrigin } from "@/lib/server/auth";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** Sets a new password from a reset link, signs out everywhere else, and signs in here. */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
    if (limited(`reset:${clientIp(req)}`, 20, 60 * 60_000)) throw new HttpError(429, "Too many attempts. Try again later.");
    const { token, password } = (await req.json()) as { token?: string; password?: string };
    if (!password || password.length < 10) throw new HttpError(400, "Use at least 10 characters for your password");
    if (password.length > 200) throw new HttpError(400, "That password is too long");
    const userId = token ? await resetPassword(token, password) : null;
    if (!userId) throw new HttpError(400, "This reset link is invalid, expired or already used. Request a new one.");
    const res = Response.json({ ok: true });
    res.headers.append("Set-Cookie", await createSession(userId));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
