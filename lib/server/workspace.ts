import "server-only";
import { newId } from "./auth";
import { db, type Db } from "./db";

/**
 * A workspace owns a user's sites and registered agents. Every account gets
 * one on first use.
 */
export interface Workspace {
  id: string;
  ownerId: string;
}

export async function getWorkspace(userId: string, conn?: Db): Promise<Workspace | null> {
  const { rows } = await (conn ?? (await db())).query<Workspace>(`select id, owner_id as "ownerId" from workspaces where owner_id = $1`, [userId]);
  return rows[0] ?? null;
}

export async function requireWorkspace(userId: string) {
  return ensureWorkspace(userId);
}

export async function ensureWorkspace(userId: string): Promise<Workspace> {
  const existing = await getWorkspace(userId);
  if (existing) return existing;
  await (await db()).query("insert into workspaces (id, owner_id, doc) values ($1, $2, '{}') on conflict (owner_id) do nothing", [newId(), userId]);
  return (await getWorkspace(userId))!;
}
