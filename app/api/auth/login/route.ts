import { createSession, errorResponse, findUserByEmail, HttpError, normalizeEmail, sameOrigin, verifyPassword } from "@/lib/server/auth";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const key = `login:${clientIp(req)}:${normalizeEmail(email ?? "")}`;
    if (limited(key, 8, 15 * 60_000)) throw new HttpError(429, "Too many attempts. Wait 15 minutes and try again.");
    const user = email ? await findUserByEmail(email) : null;
    const ok = await verifyPassword(password ?? "", user?.password_hash);
    if (!user || !ok) {
      if (user && !user.password_hash && user.google_sub) throw new HttpError(401, "This account uses Google sign-in. Continue with Google instead.");
      throw new HttpError(401, "Email or password is incorrect");
    }
    const res = Response.json({ user: { id: user.id, email: user.email, name: user.name } });
    res.headers.append("Set-Cookie", await createSession(user.id));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
