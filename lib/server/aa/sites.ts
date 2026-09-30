import "server-only";
import { HttpError, newId } from "../auth";
import { db } from "../db";
import { sha256, token } from "./util";

/** Sites and apps an account can track, combined. */
export const MAX_PROPERTIES = 100;

export const PROPERTY_KINDS = ["website", "web_app", "mobile_app", "api"] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];
export const isApp = (kind: PropertyKind) => kind !== "website";

export interface Site {
  id: string;
  workspaceId: string;
  name: string;
  kind: PropertyKind;
  /** Host whose requests are verified (for apps: the API host the app talks to). */
  domain: string;
  /** Mobile apps: bundle id / package name, e.g. com.acme.shop. */
  appId: string | null;
  siteKey: string;
  createdAt: string;
}

const COLS = `id, workspace_id as "workspaceId", name, kind, domain, app_id as "appId", site_key as "siteKey", created_at as "createdAt"`;

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

/** Reverse-DNS bundle id / package name: com.acme.shop */
export function normalizeAppId(input: string | undefined) {
  const v = (input ?? "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/.test(v) || v.length > 155) throw new HttpError(400, "Enter a bundle ID or package name like com.acme.shop");
  return v;
}

export interface NewProperty {
  name?: string;
  domain?: string;
  kind?: string;
  appId?: string;
}

/** Creates a site or app; the secret is returned once and only its hash is stored. */
export async function createSite(workspaceId: string, input: NewProperty) {
  const name = (input.name ?? "").trim().slice(0, 80);
  if (!name) throw new HttpError(400, "Name is required");
  const kind = (input.kind ?? "website") as PropertyKind;
  if (!PROPERTY_KINDS.includes(kind)) throw new HttpError(400, "Choose website, web app, mobile app or API");
  const domain = normalizeDomain(input.domain ?? "");
  const appId = kind === "mobile_app" ? normalizeAppId(input.appId) : null;
  const site = { id: newId(), siteKey: token("aa_pk", 12), secret: token("aa_sk") };

  await (await db()).transaction(async (tx) => {
    // Lock the workspace so parallel requests can't overshoot the limit.
    await tx.query("select id from workspaces where id = $1 for update", [workspaceId]);
    const { rows } = await tx.query<{ n: number }>("select count(*)::int as n from aa_sites where workspace_id = $1", [workspaceId]);
    if ((rows[0]?.n ?? 0) >= MAX_PROPERTIES) throw new HttpError(400, `An account can track up to ${MAX_PROPERTIES} sites and apps. Remove one to add another.`);
    await tx.query("insert into aa_sites (id, workspace_id, name, kind, domain, app_id, site_key, secret_hash) values ($1, $2, $3, $4, $5, $6, $7, $8)", [
      site.id,
      workspaceId,
      name,
      kind,
      domain,
      appId,
      site.siteKey,
      sha256(site.secret),
    ]);
  });
  return { ...(await getSite(workspaceId, site.id))!, secret: site.secret };
}

export async function renameSite(workspaceId: string, id: string, name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new HttpError(400, "Name is required");
  const { rows } = await (await db()).query("update aa_sites set name = $1 where workspace_id = $2 and id = $3 returning id", [clean, workspaceId, id]);
  if (!rows.length) throw new HttpError(404, "Site not found");
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
