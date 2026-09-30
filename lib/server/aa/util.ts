import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");
export const token = (prefix: string, bytes = 24) => `${prefix}_${randomBytes(bytes).toString("base64url")}`;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET (32+ characters) is required for agent analytics");
  return s;
}

/** Daily-rotating salted hash, so an IP can't be recovered or tracked across days. */
export function ipHash(ip: string | null | undefined) {
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", secret()).update(`aa-ip:${day}:${ip}`).digest("base64url").slice(0, 16);
}

export function hmac(purpose: string, data: string) {
  return createHmac("sha256", secret()).update(`${purpose}:${data}`).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function requestIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
}

/** Public origin of this deployment (the registry's directory origin). */
export function registryOrigin(req?: Request) {
  const env = process.env.APP_URL?.trim();
  if (env) return new URL(env).origin;
  if (req) {
    const u = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? u.host;
    const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export const trustedExternalDirectories = () =>
  (process.env.AA_TRUSTED_DIRECTORIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
