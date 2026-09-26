import { destroySession } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", await destroySession(req));
  return res;
}
