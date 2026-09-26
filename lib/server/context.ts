import "server-only";
import { googleAuth } from "./google";
import type { ToolContext } from "./tools";

/** Builds per-request tool credentials. `setCookie` must be sent back when present. */
export async function toolContext(req: Request, timeZone?: string): Promise<{ ctx: ToolContext; setCookie?: string }> {
  const { auth, setCookie } = await googleAuth(req);
  return { ctx: { google: auth, timeZone: timeZone || "UTC" }, setCookie };
}

export function withCookie(res: Response, setCookie?: string) {
  if (setCookie) res.headers.append("Set-Cookie", setCookie);
  return res;
}
