/**
 * Supabase pg_cron setup for the scheduler, shared by the app (which keeps the
 * job in sync on Vercel) and `npm run cron:supabase`. No "server-only" import,
 * so the CLI can use it too.
 *
 * The secret lives in Supabase Vault and is passed as a bind parameter, so it
 * never appears in the job's SQL, cron.job, or logs.
 */

export const CRON_JOB = "agentic-scheduler-tick";
export const CRON_SECRET_NAME = "agentic_cron_secret";
export const DEFAULT_EVERY = "* * * * *";

type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;

export function tickUrlFor(appUrl: string, { allowHttp = false } = {}) {
  const u = new URL(appUrl);
  if (u.protocol !== "https:" && !allowHttp) throw new Error("APP_URL must be https:// so the secret isn't sent in clear text.");
  u.pathname = "/api/cron/tick";
  u.search = "";
  u.hash = "";
  const url = u.toString();
  if (/['\\]/.test(url)) throw new Error("APP_URL contains characters that aren't allowed.");
  return url;
}

/** The SQL pg_cron runs each tick. It reads the secret from Vault; it contains none. */
export function tickCommand(tickUrl: string) {
  return `select net.http_get(
  url := '${tickUrl}',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${CRON_SECRET_NAME}')),
  timeout_milliseconds := 10000
);`;
}

export function validEvery(every: string) {
  return /^(\*|\d+|\*\/\d+)(\s+(\*|[\d,\-/]+|\*\/\d+)){4}$/.test(every.trim());
}

/**
 * Makes the job match `tickUrl`, `secret` and `every`, changing only what differs.
 * Idempotent and safe to run concurrently (cron.schedule upserts by job name).
 */
export async function ensureCronJob(query: Query, opts: { secret: string; tickUrl: string; every?: string }) {
  const every = opts.every ?? DEFAULT_EVERY;
  if (opts.secret.length < 24) throw new Error("CRON_SECRET must be at least 24 characters.");
  if (!validEvery(every)) throw new Error(`Invalid cron expression "${every}".`);
  const changed: string[] = [];

  const ext = await query<{ extname: string }>("select extname from pg_extension where extname in ('pg_cron', 'pg_net')");
  const have = new Set(ext.rows.map((r) => r.extname));
  if (!have.has("pg_cron")) {
    await query("create extension if not exists pg_cron with schema pg_catalog");
    changed.push("enabled pg_cron");
  }
  if (!have.has("pg_net")) {
    await query("create extension if not exists pg_net with schema extensions");
    changed.push("enabled pg_net");
  }
  await query("grant usage on schema cron to postgres").catch(() => {});

  const stored = await query<{ id: string; secret: string | null }>(
    "select id, decrypted_secret as secret from vault.decrypted_secrets where name = $1",
    [CRON_SECRET_NAME],
  );
  if (!stored.rows[0]) {
    try {
      await query("select vault.create_secret($1, $2, $3)", [opts.secret, CRON_SECRET_NAME, "agentic.do scheduler"]);
    } catch {
      // Another instance created it first; fall through to update.
      const again = await query<{ id: string }>("select id from vault.secrets where name = $1", [CRON_SECRET_NAME]);
      if (!again.rows[0]) throw new Error("Couldn't store CRON_SECRET in Vault");
      await query("select vault.update_secret($1, $2)", [again.rows[0].id, opts.secret]);
    }
    changed.push("stored secret in Vault");
  } else if (stored.rows[0].secret !== opts.secret) {
    await query("select vault.update_secret($1, $2)", [stored.rows[0].id, opts.secret]);
    changed.push("rotated secret in Vault");
  }

  const command = tickCommand(opts.tickUrl);
  const job = await query<{ schedule: string; command: string; active: boolean }>(
    "select schedule, command, active from cron.job where jobname = $1",
    [CRON_JOB],
  );
  const j = job.rows[0];
  if (!j || j.schedule !== every || j.command !== command || !j.active) {
    await query("select cron.schedule($1, $2, $3)", [CRON_JOB, every, command]);
    changed.push(j ? "updated job" : "scheduled job");
  }
  return { changed, tickUrl: opts.tickUrl, every };
}

export async function removeCronJob(query: Query) {
  await query("select cron.unschedule(jobid) from cron.job where jobname = $1", [CRON_JOB]);
}

/** For /api/health: is the job there, and how did its recent runs and HTTP calls go? */
export async function cronStatus(query: Query) {
  const ext = await query<{ n: number }>("select count(*)::int as n from pg_extension where extname = 'pg_cron'");
  if (!ext.rows[0]?.n) return { installed: false as const };
  const job = await query<{ jobid: number; schedule: string; active: boolean }>(
    "select jobid, schedule, active from cron.job where jobname = $1",
    [CRON_JOB],
  );
  if (!job.rows[0]) return { installed: false as const };
  const run = await query<{ status: string; start_time: string }>(
    "select status, start_time from cron.job_run_details where jobid = $1 order by start_time desc limit 1",
    [job.rows[0].jobid],
  ).catch(() => ({ rows: [] }));
  return {
    installed: true as const,
    schedule: job.rows[0].schedule,
    active: job.rows[0].active,
    lastRun: run.rows[0] ? { status: run.rows[0].status, at: run.rows[0].start_time } : null,
  };
}
