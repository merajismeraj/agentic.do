import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, type User } from "./auth";
import { db } from "./db";
import { appUrl, sendEmail } from "./mailer";

/**
 * Email verification and password reset. Tokens are 256-bit random values;
 * only their SHA-256 is stored, each is single-use, and they expire.
 */

export type TokenPurpose = "verify" | "reset";
const TTL: Record<TokenPurpose, number> = { verify: 24 * 60 * 60_000, reset: 60 * 60_000 };
const sha = (s: string) => createHash("sha256").update(s).digest("base64url");

async function issueToken(userId: string, purpose: TokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  const d = await db();
  // A new link replaces older unused ones of the same kind.
  await d.query("delete from auth_tokens where user_id = $1 and purpose = $2 and used_at is null", [userId, purpose]);
  await d.query("insert into auth_tokens (id, user_id, purpose, expires_at) values ($1,$2,$3,$4)", [sha(token), userId, purpose, new Date(Date.now() + TTL[purpose])]);
  return token;
}

/** Marks a token used and returns its user, or null if unknown, expired, already used, or for another purpose. */
async function consumeToken(token: string, purpose: TokenPurpose) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { rows } = await (await db()).query<{ user_id: string }>(
    `update auth_tokens set used_at = now()
     where id = $1 and purpose = $2 and used_at is null and expires_at > now() returning user_id`,
    [sha(token), purpose],
  );
  return rows[0]?.user_id ?? null;
}

export async function isVerified(userId: string) {
  const { rows } = await (await db()).query<{ v: Date | null }>("select email_verified_at as v from users where id = $1", [userId]);
  return !!rows[0]?.v;
}

export async function markVerified(userId: string) {
  await (await db()).query("update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [userId]);
}

/* ------------------------------ Emails ----------------------------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function transactional(o: { name: string; heading: string; body: string; cta: string; url: string; footer: string }) {
  const hi = `Hi ${o.name.split(" ")[0] || "there"},`;
  const html = `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="font-size:15px;font-weight:600;color:#18181b;padding-bottom:24px">agentic<span style="color:#5b4cff">.do</span></td></tr>
<tr><td style="background:#fff;border:1px solid #e7e5e0;border-radius:14px;padding:28px">
  <div style="font-size:20px;font-weight:600;color:#18181b;margin-bottom:12px">${esc(o.heading)}</div>
  <div style="font-size:15px;line-height:1.55;color:#3f3f46;margin-bottom:22px">${esc(hi)}<br/>${esc(o.body)}</div>
  <a href="${esc(o.url)}" style="display:inline-block;background:#5b4cff;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:9px">${esc(o.cta)}</a>
  <div style="font-size:12px;color:#71717a;margin-top:22px;word-break:break-all">Or paste this link into your browser:<br/>${esc(o.url)}</div>
</td></tr>
<tr><td style="font-size:12px;color:#a1a1aa;padding-top:18px">${esc(o.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${hi}\n\n${o.body}\n\n${o.cta}: ${o.url}\n\n${o.footer}\n`;
  return { html, text };
}

export async function sendVerification(user: User) {
  const token = await issueToken(user.id, "verify");
  const url = `${appUrl()}/verify-email?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Confirm your email for agentic.do",
    idempotencyKey: `verify-${sha(token).slice(0, 32)}`,
    ...transactional({
      name: user.name,
      heading: "Confirm your email",
      body: "One click to confirm this address. We use it for sign-in and password resets. The link works for 24 hours.",
      cta: "Confirm email",
      url,
      footer: "Didn't sign up for agentic.do? You can ignore this email.",
    }),
  });
}

export async function sendPasswordReset(user: User) {
  const token = await issueToken(user.id, "reset");
  const url = `${appUrl()}/reset-password?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Reset your agentic.do password",
    idempotencyKey: `reset-${sha(token).slice(0, 32)}`,
    ...transactional({
      name: user.name,
      heading: "Reset your password",
      body: "Someone (hopefully you) asked to reset your password. The link works for one hour and only once. Resetting signs you out everywhere else.",
      cta: "Choose a new password",
      url,
      footer: "Didn't ask for this? Ignore this email — your password stays the same.",
    }),
  });
}

/* ------------------------------ Flows ------------------------------ */

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, "verify");
  if (!userId) return null;
  await markVerified(userId);
  return userId;
}

/**
 * Sets a new password from a reset link. Also proves the inbox, so the email
 * becomes verified; every existing session and outstanding reset link ends.
 */
export async function resetPassword(token: string, password: string) {
  const userId = await consumeToken(token, "reset");
  if (!userId) return null;
  const d = await db();
  await d.query("update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $1", [userId, await hashPassword(password)]);
  await d.query("delete from sessions where user_id = $1", [userId]);
  await d.query("delete from auth_tokens where user_id = $1 and purpose = 'reset'", [userId]);
  return userId;
}

/**
 * Before a verified Google identity takes over an existing account whose email
 * was never confirmed, drop the old password and sessions: whoever registered
 * that email first may not own it (account pre-hijacking).
 */
export async function claimUnverifiedAccount(userId: string) {
  if (await isVerified(userId)) return;
  const d = await db();
  await d.query("update users set password_hash = null where id = $1", [userId]);
  await d.query("delete from sessions where user_id = $1", [userId]);
  await d.query("delete from auth_tokens where user_id = $1", [userId]);
}
