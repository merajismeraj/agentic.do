import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";

/**
 * Accounts and sessions. Passwords use scrypt; the session cookie holds a
 * random token and the database stores only its SHA-256 hash.
 */

export const SESSION_COOKIE = "agentic_session";
const SESSION_DAYS = 30;
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified?: boolean;
}

export const newId = (bytes = 12) => randomBytes(bytes).toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined) {
  if (!stored?.startsWith("scrypt$")) {
    // Spend comparable time so response timing doesn't reveal whether an account exists.
    await scryptAsync(pw, randomBytes(16), 64);
    return false;
  }
  const [, salt, key] = stored.split("$");
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(pw.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

/* ------------------------------ Cookies ---------------------------- */

const secure = () => process.env.NODE_ENV === "production";

export function cookie(name: string, value: string, maxAgeSeconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure() ? "; Secure" : ""}`;
}

export function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

/* ------------------------------ Sessions --------------------------- */

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await (await db()).query("insert into sessions (id, user_id, expires_at) values ($1, $2, $3)", [sha256(token), userId, expires]);
  return cookie(SESSION_COOKIE, token, SESSION_DAYS * 86_400);
}

export async function destroySession(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await (await db()).query("delete from sessions where id = $1", [sha256(token)]);
  return cookie(SESSION_COOKIE, "", 0);
}

export async function currentUser(req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const { rows } = await (await db()).query<User>(
    `select u.id, u.email, u.name, (u.email_verified_at is not null) as "emailVerified" from sessions s join users u on u.id = s.user_id
     where s.id = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

/**
 * Rejects cross-site writes. SameSite=Lax already withholds the cookie from
 * cross-site POSTs; this is defence in depth for browsers that don't.
 */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers and server-to-server calls
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? new URL(req.url).host);
  } catch {
    return false;
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** For mutating endpoints: same-origin + signed in, or throws HttpError. */
export async function requireUser(req: Request): Promise<User> {
  if (req.method !== "GET" && !sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

/* ------------------------------ Users ------------------------------ */

export async function createUser(email: string, name: string, password?: string, googleSub?: string): Promise<User> {
  const id = newId();
  const hash = password ? await hashPassword(password) : null;
  await (await db()).query("insert into users (id, email, name, password_hash, google_sub) values ($1, $2, $3, $4, $5)", [
    id,
    normalizeEmail(email),
    name.trim(),
    hash,
    googleSub ?? null,
  ]);
  return { id, email: normalizeEmail(email), name: name.trim() };
}

export async function findUserByEmail(email: string) {
  const { rows } = await (await db()).query<User & { password_hash: string | null; google_sub: string | null }>(
    "select id, email, name, password_hash, google_sub from users where email = $1",
    [normalizeEmail(email)],
  );
  return rows[0] ?? null;
}

/** Sign in with Google: match by Google account, then by verified email (linking), else create. */
export async function upsertGoogleUser(p: { sub: string; email: string; name: string; emailVerified: boolean }): Promise<User> {
  const d = await db();
  const bySub = await d.query<User>("select id, email, name from users where google_sub = $1", [p.sub]);
  if (bySub.rows[0]) return bySub.rows[0];
  const existing = await findUserByEmail(p.email);
  if (existing) {
    if (!p.emailVerified) throw new HttpError(409, "This Google email isn't verified, so it can't be linked to your existing account");
    const { claimUnverifiedAccount, markVerified } = await import("./account");
    await claimUnverifiedAccount(existing.id);
    await d.query("update users set google_sub = $1 where id = $2", [p.sub, existing.id]);
    await markVerified(existing.id);
    return { id: existing.id, email: existing.email, name: existing.name };
  }
  const user = await createUser(p.email, p.name, undefined, p.sub);
  if (p.emailVerified) await (await import("./account")).markVerified(user.id);
  return user;
}
