import "server-only";
import { HttpError, requireUser, type User } from "./auth";
import { db } from "./db";

/**
 * Super admins: confirmed accounts whose email is in SUPER_ADMIN_EMAILS. The
 * confirmation matters: otherwise anyone could sign up with an admin's address
 * before they do.
 */
const listed = (v: string | undefined, email: string) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

export const isSuperAdmin = (u: Pick<User, "email" | "emailVerified"> | null | undefined) => !!u?.emailVerified && listed(process.env.SUPER_ADMIN_EMAILS, u.email);

/** Registry reviewers (approve agents to T3): AA_ADMIN_EMAILS, plus super admins. Confirmed emails only. */
export const isRegistryReviewer = (u: Pick<User, "email" | "emailVerified"> | null | undefined) =>
  !!u?.emailVerified && (listed(process.env.AA_ADMIN_EMAILS, u.email) || listed(process.env.SUPER_ADMIN_EMAILS, u.email));

/** 404 rather than 403, so the admin area doesn't reveal itself. */
export async function requireSuperAdmin(req: Request) {
  const user = await requireUser(req);
  if (!isSuperAdmin(user)) throw new HttpError(404, "Not found");
  return user;
}

const APP_KINDS = "('web_app', 'mobile_app', 'api')";

export interface AdminAccountRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  signIn: "password" | "google" | "both";
  createdAt: string;
  lastSignInAt: string | null;
  sites: number;
  apps: number;
  agents: number;
  sessions7d: number;
  lastEventAt: string | null;
}

export type AdminSort = "created" | "sessions" | "properties" | "active";
const ORDER: Record<AdminSort, string> = {
  created: `u.created_at desc`,
  sessions: `coalesce(act.sessions7d, 0) desc, u.created_at desc`,
  properties: `(coalesce(p.sites, 0) + coalesce(p.apps, 0)) desc, u.created_at desc`,
  active: `act.last_at desc nulls last, u.created_at desc`,
};

export async function adminOverview(opts: { q?: string; page?: number; pageSize?: number; sort?: AdminSort } = {}) {
  const d = await db();
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50));
  const page = Math.max(1, opts.page ?? 1);
  const q = (opts.q ?? "").trim().slice(0, 100);
  const sort: AdminSort = opts.sort && opts.sort in ORDER ? opts.sort : "created";
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const where = q ? `where u.email ilike $1 or u.name ilike $1` : "";
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const [totals] = (
    await d.query<{
      accounts: number;
      verified: number;
      new7d: number;
      sites: number;
      apps: number;
      activeProperties: number;
      sessions7d: number;
      agents: number;
    }>(
      `select
        (select count(*)::int from users) as accounts,
        (select count(*)::int from users where email_verified_at is not null) as verified,
        (select count(*)::int from users where created_at > $1) as "new7d",
        (select count(*)::int from aa_sites where kind not in ${APP_KINDS}) as sites,
        (select count(*)::int from aa_sites where kind in ${APP_KINDS}) as apps,
        (select count(distinct site_id)::int from aa_sessions where last_at > $1) as "activeProperties",
        (select count(*)::int from aa_sessions where last_at > $1) as "sessions7d",
        (select count(*)::int from aa_agents) as agents`,
      [since7],
    )
  ).rows;

  const matched = (await d.query<{ n: number }>(`select count(*)::int as n from users u ${where}`, q ? [like] : [])).rows[0]?.n ?? 0;
  const params: unknown[] = q ? [like] : [];
  params.push(since7, pageSize, (page - 1) * pageSize);
  const p = (i: number) => `$${(q ? 1 : 0) + i}`;
  const { rows: accounts } = await d.query<AdminAccountRow>(
    `select u.id, u.name, u.email, (u.email_verified_at is not null) as "emailVerified",
       case when u.google_sub is not null and u.password_hash is not null then 'both' when u.google_sub is not null then 'google' else 'password' end as "signIn",
       u.created_at as "createdAt",
       (select max(s.created_at) from sessions s where s.user_id = u.id) as "lastSignInAt",
       coalesce(p.sites, 0)::int as sites, coalesce(p.apps, 0)::int as apps,
       coalesce(ag.n, 0)::int as agents,
       coalesce(act.sessions7d, 0)::int as "sessions7d", act.last_at as "lastEventAt"
     from users u
     left join workspaces w on w.owner_id = u.id
     left join (select workspace_id, count(*) filter (where kind not in ${APP_KINDS}) as sites, count(*) filter (where kind in ${APP_KINDS}) as apps
                from aa_sites group by workspace_id) p on p.workspace_id = w.id
     left join (select workspace_id, count(*) as n from aa_agents group by workspace_id) ag on ag.workspace_id = w.id
     left join (select st.workspace_id, count(*) filter (where ss.last_at > ${p(1)}) as sessions7d, max(ss.last_at) as last_at
                from aa_sessions ss join aa_sites st on st.id = ss.site_id group by st.workspace_id) act on act.workspace_id = w.id
     ${where}
     order by ${ORDER[sort]}
     limit ${p(2)} offset ${p(3)}`,
    params,
  );
  return { totals: totals!, accounts, page, pageSize, matched, pages: Math.max(1, Math.ceil(matched / pageSize)), sort, q };
}

export async function adminAccount(userId: string) {
  const d = await db();
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const account = (
    await d.query<Omit<AdminAccountRow, "sites" | "apps" | "agents" | "sessions7d" | "lastEventAt">>(
      `select u.id, u.name, u.email, (u.email_verified_at is not null) as "emailVerified",
         case when u.google_sub is not null and u.password_hash is not null then 'both' when u.google_sub is not null then 'google' else 'password' end as "signIn",
         u.created_at as "createdAt", (select max(s.created_at) from sessions s where s.user_id = u.id) as "lastSignInAt"
       from users u where u.id = $1`,
      [userId],
    )
  ).rows[0];
  if (!account) throw new HttpError(404, "Account not found");
  const { rows: properties } = await d.query<{
    id: string;
    name: string;
    kind: string;
    domain: string;
    appId: string | null;
    createdAt: string;
    sessions7d: number;
    sessions30d: number;
    humans7d: number;
    agents7d: number;
    lastEventAt: string | null;
  }>(
    `select st.id, st.name, st.kind, st.domain, st.app_id as "appId", st.created_at as "createdAt",
       count(ss.id) filter (where ss.last_at > $2)::int as "sessions7d",
       count(ss.id) filter (where ss.last_at > $3)::int as "sessions30d",
       count(ss.id) filter (where ss.last_at > $2 and ss.label = 'human')::int as "humans7d",
       count(ss.id) filter (where ss.last_at > $2 and (ss.label = 'agent' or ss.tier in ('T2', 'T3', 'T4')))::int as "agents7d",
       max(ss.last_at) as "lastEventAt"
     from aa_sites st join workspaces w on w.id = st.workspace_id
     left join aa_sessions ss on ss.site_id = st.id
     where w.owner_id = $1
     group by st.id order by st.created_at`,
    [userId, since7, since30],
  );
  const { rows: agents } = await d.query<{ id: string; name: string; operator: string; status: string; createdAt: string }>(
    `select a.id, a.name, a.operator, a.status, a.created_at as "createdAt"
     from aa_agents a join workspaces w on w.id = a.workspace_id where w.owner_id = $1 order by a.created_at`,
    [userId],
  );
  return { account, properties, agents };
}
