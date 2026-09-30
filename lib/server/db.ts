import "server-only";

/**
 * Postgres access. Uses `DATABASE_URL` (any Postgres) when set; otherwise an
 * embedded PGlite database in `.data/pglite` (or in memory for tests via
 * `PGLITE_DIR=memory://`). Both expose the same `query(sql, params)` shape.
 */

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

const SCHEMA = /* sql */ `
create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null default '',
  password_hash text,
  google_sub text unique,
  created_at timestamptz not null default now()
);

alter table users add column if not exists email_verified_at timestamptz;

create table if not exists auth_tokens (
  id text primary key,               -- sha256 of the emailed token
  user_id text not null references users(id) on delete cascade,
  purpose text not null,             -- 'verify' | 'reset'
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists auth_tokens_user on auth_tokens(user_id, purpose);

create table if not exists sessions (
  id text primary key,               -- sha256 of the cookie token
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user on sessions(user_id);

create table if not exists workspaces (
  id text primary key,
  owner_id text not null unique references users(id) on delete cascade,
  doc jsonb not null default '{}',   -- unused since Teammates moved to srk
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Agent analytics & verification (aa_*) ------------------------------------

create table if not exists aa_sites (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  domain text not null,
  site_key text not null unique,        -- public, used by the SDK
  secret_hash text not null,            -- sha256 of the server-side secret (verify API)
  created_at timestamptz not null default now()
);
create index if not exists aa_sites_ws on aa_sites(workspace_id);

create table if not exists aa_agents (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  operator text not null,
  contact text not null,
  purpose text not null,                -- search | assistant | shopping | research | monitoring | other
  actuation text not null,              -- hosted_browser | user_browser | api
  principal_model text not null,        -- consumer_delegated | enterprise | autonomous
  rate_per_min integer not null default 60,
  homepage text not null default '',
  status text not null default 'pending', -- pending | approved | suspended
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists aa_agents_ws on aa_agents(workspace_id);

create table if not exists aa_keys (
  kid text primary key,                 -- RFC 7638 JWK thumbprint
  agent_id text not null references aa_agents(id) on delete cascade,
  jwk jsonb not null,                   -- public key only
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists aa_keys_agent on aa_keys(agent_id);

create table if not exists aa_nonces (
  key text primary key,                 -- keyid + nonce
  expires_at timestamptz not null
);

create table if not exists aa_requests (
  id text primary key,
  site_id text not null references aa_sites(id) on delete cascade,
  at timestamptz not null default now(),
  method text not null,
  path text not null,
  tier text not null,
  decision text not null,
  verify_status text not null,          -- absent | invalid | valid
  verify_reason text,
  keyid text,
  directory text,
  agent_id text,
  declared text,
  ua text,
  ip_hash text
);
create index if not exists aa_requests_site on aa_requests(site_id, at desc);
create index if not exists aa_requests_agent on aa_requests(agent_id, at desc);

create table if not exists aa_sessions (
  site_id text not null references aa_sites(id) on delete cascade,
  id text not null,                     -- SDK session id
  started_at timestamptz not null,
  last_at timestamptz not null,
  tier text not null default 'T0',
  agent_id text,
  p_agent real not null default 0.25,
  label text not null default 'uncertain',
  hybrid boolean not null default false,
  pages integer not null default 0,
  score jsonb,                          -- evidence, segments, tasks, features
  ua text,
  ip_hash text,
  primary key (site_id, id)
);
create index if not exists aa_sessions_recent on aa_sessions(site_id, last_at desc);
-- Attribution (where the session came from); first_touch = this browser's first channel/source/medium/campaign.
alter table aa_sessions add column if not exists channel text;
alter table aa_sessions add column if not exists source text;
alter table aa_sessions add column if not exists medium text;
alter table aa_sessions add column if not exists campaign text;
alter table aa_sessions add column if not exists referrer text;
alter table aa_sessions add column if not exists landing text;
alter table aa_sessions add column if not exists first_touch jsonb;

create table if not exists aa_batches (
  site_id text not null references aa_sites(id) on delete cascade,
  session_id text not null,
  seq integer not null,
  events jsonb not null,                -- raw behavioural events, kept 30 days
  received_at timestamptz not null default now(),
  primary key (site_id, session_id, seq)
);
create index if not exists aa_batches_age on aa_batches(received_at);

`;

/**
 * The Postgres URL: DATABASE_URL, else what the Supabase or Neon Vercel integrations
 * inject — POSTGRES_URL, or a prefixed copy such as `agentic_POSTGRES_URL` (pooled).
 */
export function databaseUrl(env: Record<string, string | undefined> = process.env) {
  const pick = (k: string | undefined) => (k ? env[k]?.trim() : undefined) || undefined;
  return pick("DATABASE_URL") ?? pick("POSTGRES_URL") ?? pick(Object.keys(env).sort().find((k) => /^[A-Za-z0-9]+_POSTGRES_URL$/.test(k)));
}

/**
 * Accepts the URLs Supabase hands out (including Prisma's `?pgbouncer=true`): TLS is
 * configured in code, and ORM-only parameters mean nothing to node-postgres.
 */
export function pgUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL isn't a valid URL. If the password has characters like @ # / ?, URL-encode them.");
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.searchParams.get("sslmode") === "disable";
  for (const k of ["sslmode", "pgbouncer", "connection_limit", "pool_timeout", "schema", "supa"]) u.searchParams.delete(k);
  return { connectionString: u.toString(), local };
}

let ready: Promise<Db> | null = null;

export function db(): Promise<Db> {
  // Cache across hot reloads in dev.
  const g = globalThis as unknown as { __agenticDb?: Promise<Db> };
  if (!ready)
    ready = g.__agenticDb ??= connect().catch((e) => {
      // Don't cache a failed connection: the next request retries.
      ready = null;
      g.__agenticDb = undefined;
      throw e;
    });
  return ready;
}

async function connect(): Promise<Db> {
  const url = databaseUrl();
  let base: Db;

  if (!url && process.env.VERCEL) {
    throw new Error("DATABASE_URL is required on Vercel (the embedded database can't persist on serverless). Connect the Supabase integration or set DATABASE_URL to your pooler connection string.");
  }

  if (url) {
    const { Pool } = await import("pg");
    const { connectionString, local } = pgUrl(url);
    const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
    const pool = new Pool({
      connectionString,
      // Serverless: few connections per instance; the Supabase pooler multiplexes the rest.
      max: process.env.VERCEL ? 3 : 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: local ? undefined : ca ? { ca } : { rejectUnauthorized: false },
    });
    pool.on("error", (e) => console.error("pg pool error", e));
    const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
      query: async <T,>(s: string, p?: unknown[]) => ({ rows: (await c.query(s, p)).rows as T[] }),
      transaction: () => {
        throw new Error("nested transactions are not supported");
      },
    });
    base = {
      query: wrap(pool).query,
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const out = await fn(wrap(client));
          await client.query("commit");
          return out;
        } catch (e) {
          await client.query("rollback");
          throw e;
        } finally {
          client.release();
        }
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR?.trim() || ".data/pglite";
    if (!dir.startsWith("memory://")) (await import("node:fs")).mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    base = {
      query: async <T,>(s: string, p?: unknown[]) => ({ rows: (await lite.query<T>(s, p)).rows }),
      transaction: (fn) =>
        lite.transaction((tx) =>
          fn({
            query: async <T,>(s: string, p?: unknown[]) => ({ rows: (await tx.query<T>(s, p)).rows }),
            transaction: () => {
              throw new Error("nested transactions are not supported");
            },
          }),
        ),
    };
  }

  // PGlite's query() takes one statement; exec() takes many. Run the schema statement by statement for both.
  for (const stmt of SCHEMA.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await base.query(stmt);
  return base;
}
