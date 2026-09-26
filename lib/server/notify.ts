import "server-only";
import { createHash } from "node:crypto";
import type { NotificationPrefs } from "../types";
import { newId } from "./auth";
import { db } from "./db";
import { appUrl, emailConfigured, sendEmail } from "./mailer";

/**
 * Email alerts for unattended work, via an outbox table:
 * enqueue (deduplicated) → flush (claim, group per person, send, retry).
 */

export type NotificationKind = "approval" | "failure" | "test";

export interface ApprovalPayload {
  agentName: string;
  routineTitle?: string;
  title: string;
  summary: string;
  preview: { label: string; value: string }[];
}
export interface FailurePayload {
  agentName: string;
  routineTitle: string;
  error: string;
}

const MAX_ATTEMPTS = 5;

export const prefsOf = (p: NotificationPrefs | undefined): NotificationPrefs => ({ approvals: p?.approvals ?? true, failures: p?.failures ?? true });

export async function enqueueNotification(n: { userId: string; workspaceId: string; kind: NotificationKind; dedupeKey: string; payload: unknown }) {
  await (await db()).query(
    `insert into notifications (id, user_id, workspace_id, kind, dedupe_key, payload) values ($1,$2,$3,$4,$5,$6)
     on conflict (dedupe_key) do nothing`,
    [newId(), n.userId, n.workspaceId, n.kind, n.dedupeKey, JSON.stringify(n.payload)],
  );
}

interface Row {
  id: string;
  user_id: string;
  kind: NotificationKind;
  payload: ApprovalPayload & FailurePayload;
  email: string;
  name: string;
}

export interface FlushResult {
  emails: number;
  sent: number;
  failed: number;
}

/**
 * Sends pending alerts: one email per person, grouping everything queued for
 * them. Rows are claimed first so concurrent flushers never double-send.
 */
export async function flushNotifications(opts: { userId?: string } = {}): Promise<FlushResult> {
  const result: FlushResult = { emails: 0, sent: 0, failed: 0 };
  const d = await db();

  if (!emailConfigured()) {
    // Nothing can be delivered; park them so they don't pile up and send stale alerts later.
    await d.query(
      `update notifications set attempts = $1, last_error = 'Email is not configured' where sent_at is null and attempts < $1 ${opts.userId ? "and user_id = $2" : ""}`,
      opts.userId ? [MAX_ATTEMPTS, opts.userId] : [MAX_ATTEMPTS],
    );
    return result;
  }

  const { rows } = await d.query<Row>(
    `with claimed as (
       update notifications set claimed_at = now(), attempts = attempts + 1
       where id in (
         select id from notifications
         where sent_at is null and attempts < $1 and (claimed_at is null or claimed_at < now() - interval '5 minutes')
         ${opts.userId ? "and user_id = $2" : ""}
         order by created_at limit 500
         for update skip locked)
       returning id, user_id, kind, payload, created_at)
     select c.id, c.user_id, c.kind, c.payload, u.email, u.name from claimed c join users u on u.id = c.user_id order by c.created_at`,
    opts.userId ? [MAX_ATTEMPTS, opts.userId] : [MAX_ATTEMPTS],
  );

  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  for (const items of byUser.values()) {
    const ids = items.map((i) => i.id);
    const mail = compose(items);
    result.emails++;
    const res = await sendEmail({
      to: items[0].email,
      ...mail,
      idempotencyKey: `alerts-${createHash("sha256").update(ids.slice().sort().join(",")).digest("hex").slice(0, 40)}`,
    });
    if (res.ok) {
      result.sent += ids.length;
      await d.query("update notifications set sent_at = now(), last_error = null where id = any($1::text[])", [ids]);
    } else {
      result.failed += ids.length;
      await d.query(
        `update notifications set claimed_at = null, last_error = $2, attempts = case when $3 then attempts else $4 end where id = any($1::text[])`,
        [ids, res.error.slice(0, 500), res.retryable, MAX_ATTEMPTS],
      );
    }
  }
  return result;
}

/* ------------------------------ Templates -------------------------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function compose(items: Pick<Row, "kind" | "payload" | "name">[]) {
  const approvals = items.filter((i) => i.kind === "approval");
  const failures = items.filter((i) => i.kind === "failure");
  const test = items.some((i) => i.kind === "test");
  const first = items[0].payload;

  const subject =
    items.length === 1 && approvals.length === 1
      ? `${first.agentName} needs your OK: ${clip(first.title, 70)}`
      : items.length === 1 && failures.length === 1
        ? `“${clip(first.routineTitle, 60)}” didn't run`
        : test && items.length === 1
          ? "Test alert from agentic.do"
          : `${items.length} things need you in agentic.do`;

  const base = appUrl();
  const blocks: { html: string; text: string }[] = [];

  for (const a of approvals) {
    const p = a.payload;
    const fields = p.preview.slice(0, 3);
    blocks.push({
      html: `<tr><td style="padding:16px 20px;border:1px solid #e7e5e0;border-radius:12px;background:#fff">
  <div style="font-size:13px;color:#71717a">${esc(p.agentName)} wants to act${p.routineTitle ? ` · from “${esc(p.routineTitle)}”` : ""}</div>
  <div style="font-size:16px;font-weight:600;color:#18181b;margin:4px 0 6px">${esc(p.title)}</div>
  <div style="font-size:13px;color:#52525b;margin-bottom:10px">${esc(p.summary)}</div>
  ${fields
    .map(
      (f) =>
        `<div style="font-size:13px;margin:4px 0"><span style="color:#71717a">${esc(f.label)}:</span> <span style="color:#18181b;white-space:pre-wrap">${esc(clip(f.value, 400))}</span></div>`,
    )
    .join("")}
</td></tr><tr><td style="height:12px"></td></tr>`,
      text: `• ${p.agentName} wants your OK: ${p.title}\n${fields.map((f) => `  ${f.label}: ${clip(f.value, 200)}`).join("\n")}`,
    });
  }
  for (const f of failures) {
    const p = f.payload;
    blocks.push({
      html: `<tr><td style="padding:16px 20px;border:1px solid #fbd5d5;border-radius:12px;background:#fff">
  <div style="font-size:13px;color:#dc2626">Scheduled routine failed</div>
  <div style="font-size:16px;font-weight:600;color:#18181b;margin:4px 0 6px">${esc(p.agentName)} couldn't run “${esc(p.routineTitle)}”</div>
  <div style="font-size:13px;color:#52525b">${esc(clip(p.error, 400))}</div>
</td></tr><tr><td style="height:12px"></td></tr>`,
      text: `• ${p.agentName} couldn't run “${p.routineTitle}”: ${clip(p.error, 300)}`,
    });
  }
  if (test)
    blocks.push({
      html: `<tr><td style="padding:16px 20px;border:1px solid #e7e5e0;border-radius:12px;background:#fff;font-size:14px;color:#18181b">Alerts are working. You'll hear from us when a teammate needs your approval or a scheduled routine fails.</td></tr><tr><td style="height:12px"></td></tr>`,
      text: "Alerts are working. You'll hear from us when a teammate needs your approval or a scheduled routine fails.",
    });

  const cta = approvals.length ? { href: `${base}/app/inbox`, label: approvals.length === 1 ? "Review & approve" : `Review ${approvals.length} approvals` } : { href: `${base}/app/schedule`, label: "Open routines" };
  const greeting = `Hi ${esc(items[0].name?.split(" ")[0] || "there")},`;

  const html = `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="font-size:15px;font-weight:600;color:#18181b;padding-bottom:20px">agentic<span style="color:#5b4cff">.do</span></td></tr>
<tr><td style="font-size:15px;color:#18181b;padding-bottom:16px">${greeting} ${items.length === 1 ? "one thing needs you." : `${items.length} things need you.`}</td></tr>
${blocks.map((b) => b.html).join("\n")}
<tr><td style="padding:8px 0 24px"><a href="${esc(cta.href)}" style="display:inline-block;background:#5b4cff;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">${esc(cta.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#a1a1aa">Nothing is sent on your behalf until you approve it. <a href="${esc(base)}/app/settings" style="color:#71717a">Alert settings</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = `${items[0].name?.split(" ")[0] ? `Hi ${items[0].name.split(" ")[0]},` : "Hi,"}\n\n${blocks.map((b) => b.text).join("\n\n")}\n\n${cta.label}: ${cta.href}\n\nNothing is sent on your behalf until you approve it.\nAlert settings: ${base}/app/settings\n`;
  return { subject, html, text };
}
