import "server-only";
import type { Activity, Approval, Message, State } from "../types";
import { HttpError, newId } from "./auth";
import { db, type Db } from "./db";
import { seal, unseal } from "./seal";

/** The part of a workspace the UI edits directly; everything else is server-written. */
export type WorkspaceDoc = Pick<State, "user" | "brains" | "routing" | "connected" | "agents" | "routines" | "memory">;
export const DOC_KEYS = ["user", "brains", "routing", "connected", "agents", "routines", "memory"] as const;

export interface Workspace {
  id: string;
  doc: WorkspaceDoc;
  version: number;
}

const MAX_DOC_BYTES = 512 * 1024;

export function validateDoc(input: unknown): WorkspaceDoc {
  if (!input || typeof input !== "object") throw new HttpError(400, "Invalid workspace");
  const d = input as Record<string, unknown>;
  const arrays = ["brains", "connected", "agents", "routines", "memory"] as const;
  for (const k of arrays) if (!Array.isArray(d[k])) throw new HttpError(400, `Invalid workspace: ${k}`);
  if (!d.user || typeof d.user !== "object") throw new HttpError(400, "Invalid workspace: user");
  if (!["auto", "cost", "quality"].includes(d.routing as string)) throw new HttpError(400, "Invalid workspace: routing");
  const doc = Object.fromEntries(DOC_KEYS.map((k) => [k, d[k]])) as unknown as WorkspaceDoc;
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) throw new HttpError(413, "Workspace is too large");
  return doc;
}

export async function getWorkspace(userId: string, conn?: Db): Promise<Workspace | null> {
  const { rows } = await (conn ?? (await db())).query<{ id: string; doc: WorkspaceDoc; version: number }>(
    "select id, doc, version from workspaces where owner_id = $1",
    [userId],
  );
  return rows[0] ?? null;
}

export async function requireWorkspace(userId: string) {
  const ws = await getWorkspace(userId);
  if (!ws) throw new HttpError(404, "Finish onboarding first");
  return ws;
}

/**
 * Optimistic concurrency: the write only lands if `baseVersion` is still
 * current, so two tabs can't silently overwrite each other.
 */
export async function saveDoc(userId: string, doc: WorkspaceDoc, baseVersion: number | null, init?: { messages?: Message[] }) {
  return (await db()).transaction(async (tx) => {
    const current = await getWorkspace(userId, tx);
    if (!current) {
      const id = newId();
      await tx.query("insert into workspaces (id, owner_id, doc) values ($1, $2, $3)", [id, userId, JSON.stringify(doc)]);
      for (const m of init?.messages ?? []) await insertMessage(id, { ...m, id: safeId(m.id) }, tx);
      return { ok: true as const, id, version: 1 };
    }
    if (baseVersion !== current.version) return { ok: false as const, doc: current.doc, version: current.version };
    const { rows } = await tx.query<{ version: number }>(
      "update workspaces set doc = $1, version = version + 1, updated_at = now() where id = $2 and version = $3 returning version",
      [JSON.stringify(doc), current.id, baseVersion],
    );
    if (!rows[0]) return { ok: false as const, doc: current.doc, version: current.version };
    return { ok: true as const, id: current.id, version: rows[0].version };
  });
}

/** Client-proposed ids are accepted only if they look like our ids. */
export const safeId = (id: unknown) => (typeof id === "string" && /^[A-Za-z0-9_-]{6,32}$/.test(id) ? id : newId());

/* ------------------------------ Messages --------------------------- */

interface MessageRow {
  id: string;
  thread_id: string;
  author: "user" | "agent";
  agent_id: string | null;
  text: string;
  steps: Message["steps"] | null;
  approval_ids: string[] | null;
  mode: Message["mode"] | null;
  error: string | null;
  created_at: Date;
}

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  threadId: r.thread_id,
  author: r.author,
  agentId: r.agent_id ?? undefined,
  text: r.text,
  at: new Date(r.created_at).getTime(),
  steps: r.steps ?? undefined,
  approvalIds: r.approval_ids ?? undefined,
  approvalId: r.approval_ids?.[0],
  mode: r.mode ?? undefined,
  error: r.error ?? undefined,
});

export async function insertMessage(workspaceId: string, m: Message, conn?: Db) {
  await (conn ?? (await db())).query(
    `insert into messages (id, workspace_id, thread_id, author, agent_id, text, steps, approval_ids, mode, error, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      m.id,
      workspaceId,
      m.threadId,
      m.author,
      m.agentId ?? null,
      m.text,
      m.steps ? JSON.stringify(m.steps) : null,
      m.approvalIds ? JSON.stringify(m.approvalIds) : null,
      m.mode ?? null,
      m.error ?? null,
      new Date(m.at),
    ],
  );
}

export async function finishMessage(workspaceId: string, id: string, patch: Pick<Message, "text" | "steps" | "approvalIds" | "mode" | "error">) {
  await (await db()).query(
    "update messages set text = $3, steps = $4, approval_ids = $5, mode = $6, error = $7 where workspace_id = $1 and id = $2",
    [workspaceId, id, patch.text, JSON.stringify(patch.steps ?? []), JSON.stringify(patch.approvalIds ?? []), patch.mode ?? null, patch.error ?? null],
  );
}

export async function listMessages(workspaceId: string, limit = 600) {
  const { rows } = await (await db()).query<MessageRow>(
    "select * from (select * from messages where workspace_id = $1 order by created_at desc limit $2) m order by created_at asc",
    [workspaceId, limit],
  );
  return rows.map(toMessage);
}

export async function threadHistory(workspaceId: string, threadId: string, limit = 20) {
  const { rows } = await (await db()).query<MessageRow>(
    "select * from (select * from messages where workspace_id = $1 and thread_id = $2 order by created_at desc limit $3) m order by created_at asc",
    [workspaceId, threadId, limit],
  );
  return rows.filter((r) => r.text.trim()).map((r) => ({ role: r.author === "user" ? ("user" as const) : ("assistant" as const), text: r.text }));
}

/* ------------------------------ Approvals -------------------------- */

interface ApprovalRow {
  id: string;
  agent_id: string;
  thread_id: string | null;
  tool_id: string;
  title: string;
  summary: string;
  preview: Approval["preview"];
  call: Approval["call"] | null;
  status: Approval["status"];
  result: string | null;
  created_at: Date;
}

const toApproval = (r: ApprovalRow): Approval => ({
  id: r.id,
  agentId: r.agent_id,
  threadId: r.thread_id ?? undefined,
  toolId: r.tool_id,
  title: r.title,
  summary: r.summary,
  preview: r.preview,
  call: r.call ?? undefined,
  status: r.status,
  result: r.result ?? undefined,
  at: new Date(r.created_at).getTime(),
});

export async function insertApproval(workspaceId: string, a: Approval) {
  await (await db()).query(
    `insert into approvals (id, workspace_id, agent_id, thread_id, tool_id, title, summary, preview, call, status, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [a.id, workspaceId, a.agentId, a.threadId ?? null, a.toolId, a.title, a.summary, JSON.stringify(a.preview), a.call ? JSON.stringify(a.call) : null, a.status, new Date(a.at)],
  );
}

export async function listApprovals(workspaceId: string, limit = 200) {
  const { rows } = await (await db()).query<ApprovalRow>("select * from approvals where workspace_id = $1 order by created_at desc limit $2", [workspaceId, limit]);
  return rows.map(toApproval);
}

/**
 * Atomically moves a pending approval to its decision. Returns null if it
 * doesn't exist in this workspace or was already decided (no double-sends).
 */
export async function claimApproval(workspaceId: string, id: string, status: "approved" | "rejected", preview?: Approval["preview"], call?: Approval["call"]) {
  const { rows } = await (await db()).query<ApprovalRow>(
    `update approvals set status = $3, decided_at = now(),
       preview = coalesce($4::jsonb, preview), call = coalesce($5::jsonb, call)
     where workspace_id = $1 and id = $2 and status = 'pending' returning *`,
    [workspaceId, id, status, preview ? JSON.stringify(preview) : null, call ? JSON.stringify(call) : null],
  );
  return rows[0] ? toApproval(rows[0]) : null;
}

export async function getApproval(workspaceId: string, id: string) {
  const { rows } = await (await db()).query<ApprovalRow>("select * from approvals where workspace_id = $1 and id = $2", [workspaceId, id]);
  return rows[0] ? toApproval(rows[0]) : null;
}

export async function setApprovalResult(workspaceId: string, id: string, result: string) {
  await (await db()).query("update approvals set result = $3 where workspace_id = $1 and id = $2", [workspaceId, id, result]);
}

/* ------------------------------ Activity --------------------------- */

export async function logActivity(workspaceId: string, a: Omit<Activity, "id" | "at">) {
  const row: Activity = { ...a, id: newId(), at: Date.now() };
  await (await db()).query("insert into activity (id, workspace_id, agent_id, tool_id, text, created_at) values ($1,$2,$3,$4,$5,$6)", [
    row.id,
    workspaceId,
    row.agentId,
    row.toolId ?? null,
    row.text,
    new Date(row.at),
  ]);
  return row;
}

export async function listActivity(workspaceId: string, limit = 50) {
  const { rows } = await (await db()).query<{ id: string; agent_id: string; tool_id: string | null; text: string; created_at: Date }>(
    "select * from activity where workspace_id = $1 order by created_at desc limit $2",
    [workspaceId, limit],
  );
  return rows.map((r): Activity => ({ id: r.id, agentId: r.agent_id, toolId: r.tool_id ?? undefined, text: r.text, at: new Date(r.created_at).getTime() }));
}

/* ------------------------------ Connections ------------------------ */

export async function getConnection<T>(workspaceId: string, provider: string): Promise<{ account: string; secret: T } | null> {
  const { rows } = await (await db()).query<{ account: string; secret: string }>(
    "select account, secret from connections where workspace_id = $1 and provider = $2",
    [workspaceId, provider],
  );
  if (!rows[0]) return null;
  const secret = unseal<T>(rows[0].secret);
  return secret ? { account: rows[0].account, secret } : null;
}

export async function setConnection(workspaceId: string, provider: string, account: string, secret: unknown) {
  await (await db()).query(
    `insert into connections (workspace_id, provider, account, secret) values ($1,$2,$3,$4)
     on conflict (workspace_id, provider) do update set account = excluded.account, secret = excluded.secret, updated_at = now()`,
    [workspaceId, provider, account, seal(secret)],
  );
}

export async function deleteConnection(workspaceId: string, provider: string) {
  await (await db()).query("delete from connections where workspace_id = $1 and provider = $2", [workspaceId, provider]);
}
