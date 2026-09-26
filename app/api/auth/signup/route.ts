import { createSession, createUser, errorResponse, findUserByEmail, HttpError, normalizeEmail, sameOrigin, validEmail } from "@/lib/server/auth";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
    if (limited(`signup:${clientIp(req)}`, 10, 60 * 60_000)) throw new HttpError(429, "Too many sign-ups from this network. Try again later.");
    const { email, password, name } = (await req.json()) as { email?: string; password?: string; name?: string };
    if (!email || !validEmail(normalizeEmail(email))) throw new HttpError(400, "Enter a valid email address");
    if (!password || password.length < 10) throw new HttpError(400, "Use at least 10 characters for your password");
    if (password.length > 200) throw new HttpError(400, "That password is too long");
    if (await findUserByEmail(email)) throw new HttpError(409, "An account with this email already exists. Sign in instead.");
    const user = await createUser(email, name?.trim() || normalizeEmail(email).split("@")[0], password);
    const res = Response.json({ user });
    res.headers.append("Set-Cookie", await createSession(user.id));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
