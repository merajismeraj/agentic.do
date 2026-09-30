/**
 * Installs (or removes) the Supabase pg_cron job that drives the scheduler.
 * On Vercel the app does this itself on boot (see lib/server/cron-sync.ts);
 * use this for other hosts or to install ahead of a deploy.
 *
 *   DIRECT_URL=postgres://… APP_URL=https://your.app CRON_SECRET=… npm run cron:supabase
 *   npm run cron:supabase -- --dry-run     # print what would run, secret redacted
 *   npm run cron:supabase -- --remove      # unschedule the job
 *   npm run cron:supabase -- --every "*\/2 * * * *"
 */
import pg from "pg";
import { CRON_JOB, CRON_SECRET_NAME, DEFAULT_EVERY, ensureCronJob, removeCronJob, tickCommand, tickUrlFor, validEvery } from "../lib/cron-setup.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const remove = args.includes("--remove");
const every = args.includes("--every") ? args[args.indexOf("--every") + 1] : DEFAULT_EVERY;

const die = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// Prefer a session-mode / direct connection for setup; fall back to the pooled one.
const env = (k: string) => process.env[k]?.trim() || undefined;
const rawUrl = env("DIRECT_URL") ?? env("POSTGRES_URL_NON_POOLING") ?? env("DATABASE_URL") ?? env("POSTGRES_URL");
const secret = env("CRON_SECRET");
const appUrl = env("APP_URL");

if (!rawUrl && !dry) die("Set DIRECT_URL (or DATABASE_URL) to your Supabase Postgres connection string.");
if (!remove) {
  if (!secret || secret.length < 24) die("Set CRON_SECRET to a random string of at least 24 characters (e.g. `openssl rand -hex 32`), and the same value on the app.");
  if (!appUrl) die("Set APP_URL to the app's public URL, e.g. https://agentic.example.com");
}
if (!validEvery(every)) die(`--every must be a 5-field cron expression, got "${every}"`);

let tickUrl = "";
if (!remove) {
  try {
    tickUrl = tickUrlFor(appUrl!, { allowHttp: dry });
  } catch (e) {
    die((e as Error).message);
  }
}

if (dry) {
  console.log(`Dry run (${remove ? "remove" : "install"}). Nothing is executed.\n`);
  if (remove) console.log(`select cron.unschedule(jobid) from cron.job where jobname = '${CRON_JOB}';`);
  else {
    console.log("create extension if not exists pg_cron with schema pg_catalog;");
    console.log("create extension if not exists pg_net with schema extensions;");
    console.log(`select vault.create_secret('<CRON_SECRET redacted>', '${CRON_SECRET_NAME}', 'agentic.do scheduler');  -- or vault.update_secret if it exists`);
    console.log(`select cron.schedule('${CRON_JOB}', '${every}', $$\n${tickCommand(tickUrl)}\n$$);`);
  }
  process.exit(0);
}

const u = new URL(rawUrl!);
for (const k of ["sslmode", "pgbouncer", "supa", "connection_limit", "pool_timeout"]) u.searchParams.delete(k);
const client = new pg.Client({ connectionString: u.toString(), ssl: /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? undefined : { rejectUnauthorized: false } });
await client.connect();
const query = async <T,>(sql: string, params?: unknown[]) => ({ rows: (await client.query(sql, params)).rows as T[] });
try {
  if (remove) {
    await removeCronJob(query);
    console.log("✓ Removed. (The Vault secret is kept; delete it in Supabase → Vault if you no longer need it.)");
  } else {
    const r = await ensureCronJob(query, { secret: secret!, tickUrl, every });
    console.log(r.changed.length ? `✓ ${r.changed.join("\n✓ ")}` : "✓ Already up to date");
    console.log(`\n${CRON_JOB}: "${every}" → ${tickUrl}`);
    console.log("Check it with GET <APP_URL>/api/health (scheduler.lastTickAt should advance every minute).");
  }
} catch (e) {
  die(`${(e as Error).message}\nIs this your Supabase database, with pg_cron, pg_net and Vault available?`);
} finally {
  await client.end();
}
