import "server-only";

/**
 * Fixed-window limiter for auth endpoints. In-memory, so it's per server
 * instance; swap for Redis/Upstash when running more than one instance.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  h.count++;
  return h.count > max;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
