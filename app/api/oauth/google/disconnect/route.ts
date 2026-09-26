import { cookieHeader, GOOGLE_COOKIE, readSession, revoke } from "@/lib/server/google";

export const runtime = "nodejs";

/** Revokes Google access and forgets the session. */
export async function POST(req: Request) {
  const session = readSession(req);
  if (session) await revoke(session);
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", cookieHeader(GOOGLE_COOKIE, "", 0));
  return res;
}
