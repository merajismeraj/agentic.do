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
  doc jsonb not null,                -- teammates, routines, AI accounts, context, profile
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  thread_id text not null,
  author text not null,
  agent_id text,
  text text not null default '',
  steps jsonb,
  approval_ids jsonb,
  mode text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists messages_thread on messages(workspace_id, thread_id, created_at);

create table if not exists approvals (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  agent_id text not null,
  thread_id text,
  tool_id text not null,
  title text not null,
  summary text not null,
  preview jsonb not null,
  call jsonb,                         -- the exact tool call executed on approval
  status text not null default 'pending',
  result text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists approvals_ws on approvals(workspace_id, created_at desc);

create table if not exists activity (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  agent_id text not null,
  tool_id text,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_ws on activity(workspace_id, created_at desc);

alter table messages add column if not exists trigger jsonb;

create table if not exists routine_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  routine_id text not null,
  scheduled_for timestamptz not null,
  manual boolean not null default false,
  status text not null default 'running',
  message_id text,
  error text,
  needs_approval boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (workspace_id, routine_id, scheduled_for)   -- one run per occurrence, however many schedulers tick
);
create index if not exists routine_runs_ws on routine_runs(workspace_id, started_at desc);

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind text not null,                  -- 'approval' | 'failure' | 'test'
  dedupe_key text not null unique,     -- one alert per approval / failed run, ever
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index if not exists notifications_pending on notifications(user_id) where sent_at is null;

create table if not exists connections (
  workspace_id text not null references workspaces(id) on delete cascade,
  provider text not null,
  account text not null,
  secret text not null,               -- sealed (AES-256-GCM) credentials
  updated_at timestamptz not null default now(),
  primary key (workspace_id, provider)
);
`;

let ready: Promise<Db> | null = null;

export function db(): Promise<Db> {
  // Cache across hot reloads in dev.
  const g = globalThis as unknown as { __agenticDb?: Promise<Db> };
  if (!ready) ready = g.__agenticDb ?? (g.__agenticDb = connect());
  return ready;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  let base: Db;

  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 5 });
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
