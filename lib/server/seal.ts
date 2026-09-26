import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Authenticated encryption (AES-256-GCM) for values stored in cookies, so
 * OAuth tokens are unreadable and tamper-proof on the client.
 */

function key() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

export function sealingConfigured() {
  return (process.env.SESSION_SECRET?.trim().length ?? 0) >= 32;
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(body.toString("utf8")) as T;
  } catch {
    return null;
  }
}
