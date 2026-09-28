import "server-only";
import { HttpError, newId } from "../auth";
import { db } from "../db";
import { sha256, token } from "./util";

export interface Site {
  id: string;
  workspaceId: string;
  name: string;
  domain: string;
  siteKey: string;
  createdAt: string;
}

const COLS = `id, workspace_id as "workspaceId", name, domain, site_key as "siteKey", created_at as "createdAt"`;

export function normalizeDomain(input: string) {
  const raw = input.trim().toLowerCase();
  if (!raw) throw new HttpError(400, "Domain is required");
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).host;
  } catch {
    throw new HttpError(400, "Enter a domain like shop.example.com");
  }
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host) || host.length > 253) throw new HttpError(400, "Enter a domain like shop.example.com");
  return host;
}

/** Creates a site; the secret is returned once and only its hash is stored. */
export async function createSite(workspaceId: string, name: string, domain: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new HttpError(400, "Name is required");
  const d = await db();
  const { rows: count } = await d.query<{ n: number }>("select count(*)::int as n from aa_sites where workspace_id = $1", [workspaceId]);
  if ((count[0]?.n ?? 0) >= 20) throw new HttpError(400, "A workspace can track up to 20 sites");
  const site = { id: newId(), siteKey: token("aa_pk", 12), secret: token("aa_sk") };
  await d.query("insert into aa_sites (id, workspace_id, name, domain, site_key, secret_hash) values ($1, $2, $3, $4, $5, $6)", [
    site.id,
    workspaceId,
    clean,
    normalizeDomain(domain),
    site.siteKey,
    sha256(site.secret),
  ]);
  return { ...(await getSite(workspaceId, site.id))!, secret: site.secret };
}

export async function listSites(workspaceId: string) {
  return (await (await db()).query<Site>(`select ${COLS} from aa_sites where workspace_id = $1 order by created_at`, [workspaceId])).rows;
}

export async function getSite(workspaceId: string, id: string) {
  return (await (await db()).query<Site>(`select ${COLS} from aa_sites where workspace_id = $1 and id = $2`, [workspaceId, id])).rows[0] ?? null;
}

export async function siteByKey(siteKey: string) {
  return (await (await db()).query<Site>(`select ${COLS} from aa_sites where site_key = $1`, [siteKey])).rows[0] ?? null;
}

export async function siteBySecret(secret: string) {
  if (!secret.startsWith("aa_sk_")) return null;
  return (await (await db()).query<Site>(`select ${COLS} from aa_sites where secret_hash = $1`, [sha256(secret)])).rows[0] ?? null;
}

export async function rotateSecret(workspaceId: string, id: string) {
  const secret = token("aa_sk");
  const { rows } = await (await db()).query("update aa_sites set secret_hash = $1 where workspace_id = $2 and id = $3 returning id", [sha256(secret), workspaceId, id]);
  if (!rows.length) throw new HttpError(404, "Site not found");
  return secret;
}

export async function deleteSite(workspaceId: string, id: string) {
  const { rows } = await (await db()).query("delete from aa_sites where workspace_id = $1 and id = $2 returning id", [workspaceId, id]);
  if (!rows.length) throw new HttpError(404, "Site not found");
}
