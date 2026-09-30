/**
 * Installs (or removes) the Supabase pg_cron job that drives the scheduler.
 *
 *   DATABASE_URL=postgres://… APP_URL=https://your.app CRON_SECRET=… npm run cron:supabase
 *   npm run cron:supabase -- --dry-run     # print what would run, secret redacted
 *   npm run cron:supabase -- --remove      # unschedule the job
 *   npm run cron:supabase -- --every "*\/2 * * * *"
 *
 * The secret goes into Supabase Vault via bind parameters, so it never appears
 * in the job's SQL, cron.job, or logs. The job reads it from Vault each run.
 */
import pg from "pg";

const JOB = "agentic-scheduler-tick";
const SECRET_NAME = "agentic_cron_secret";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const remove = args.includes("--remove");
const every = args.includes("--every")
  ? args[args.indexOf("--every") + 1]
  : "* * * * *";

const die = (msg: string) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// Prefer the session-mode connection (Supabase's DIRECT_URL, port 5432) for setup; fall back to DATABASE_URL.
const rawUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
const dbUrl = rawUrl
  ? (() => {
      const u = new URL(rawUrl);
      for (const k of [
        "sslmode",
        "pgbouncer",
        "connection_limit",
        "pool_timeout",
      ])
        u.searchParams.delete(k);
      return u.toString();
    })()
  : undefined;
const secret = process.env.CRON_SECRET?.trim();
const appUrlRaw = process.env.APP_URL?.trim();
if (!dbUrl && !dry)
  die(
    "Set DATABASE_URL to your Supabase Postgres connection string (Project Settings → Database).",
  );
if (!remove) {
  if (!secret || secret.length < 24)
    die(
      "Set CRON_SECRET to a random string of at least 24 characters (e.g. `openssl rand -hex 32`), and set the same value on the app.",
    );
  if (!appUrlRaw)
    die(
      "Set APP_URL to the app's public URL, e.g. https://agentic.example.com",
    );
}
if (!/^(\*|\d+|\*\/\d+)(\s+(\*|[\d,\-\/]+|\*\/\d+)){4}$/.test(every.trim()))
  die(`--every must be a 5-field cron expression, got "${every}"`);

let tickUrl = "";
if (!remove) {
  const u = new URL(appUrlRaw!);
  if (u.protocol !== "https:" && !dry)
    die("APP_URL must be https:// so the secret isn't sent in clear text.");
  u.pathname = "/api/cron/tick";
  u.search = "";
  tickUrl = u.toString();
  if (/['\\]/.test(tickUrl))
    die("APP_URL contains characters that aren't allowed.");
}

// The command pg_cron runs every tick. It contains no secrets.
const command = `select net.http_get(
  url := '${tickUrl}',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${SECRET_NAME}')),
  timeout_milliseconds := 10000
);`;

type Step = {
  sql: string;
  params?: unknown[];
  note: string;
  optional?: boolean;
};
const steps: Step[] = remove
  ? [
      {
        note: "Unschedule job",
        sql: "select cron.unschedule(jobid) from cron.job where jobname = $1",
        params: [JOB],
      },
    ]
  : [
      {
        note: "Enable pg_cron",
        sql: "create extension if not exists pg_cron with schema pg_catalog",
      },
      {
        note: "Enable pg_net",
        sql: "create extension if not exists pg_net with schema extensions",
      },
      {
        note: "Grant cron schema to postgres",
        sql: "grant usage on schema cron to postgres",
        optional: true,
      },
      { note: "Store CRON_SECRET in Vault", sql: "__vault__" },
      {
        note: "Replace any previous job",
        sql: "select cron.unschedule(jobid) from cron.job where jobname = $1",
        params: [JOB],
      },
      {
        note: `Schedule "${every}" → ${tickUrl}`,
        sql: "select cron.schedule($1, $2, $3)",
        params: [JOB, every, command],
      },
    ];

if (dry) {
  console.log(
    `Dry run (${remove ? "remove" : "install"}). Nothing is executed.\n`,
  );
  for (const s of steps) {
    console.log(`-- ${s.note}`);
    if (s.sql === "__vault__")
      console.log(
        `select vault.create_secret('<CRON_SECRET redacted>', '${SECRET_NAME}', 'agentic.do scheduler');  -- or vault.update_secret(id, …) if it exists\n`,
      );
    else
      console.log(
        `${s.sql};${s.params ? `  -- params: ${JSON.stringify(s.params.map((p) => (p === command ? "<command below>" : p)))}` : ""}\n`,
      );
  }
  if (!remove) console.log(`-- Command run every tick:\n${command}`);
  process.exit(0);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: /localhost|127\.0\.0\.1/.test(dbUrl!)
    ? undefined
    : { rejectUnauthorized: false },
});
await client.connect();
try {
  for (const s of steps) {
    try {
      if (s.sql === "__vault__") {
        const existing = await client.query<{ id: string }>(
          "select id from vault.secrets where name = $1",
          [SECRET_NAME],
        );
        if (existing.rows[0])
          await client.query("select vault.update_secret($1, $2)", [
            existing.rows[0].id,
            secret,
          ]);
        else
          await client.query("select vault.create_secret($1, $2, $3)", [
            secret,
            SECRET_NAME,
            "agentic.do scheduler",
          ]);
      } else await client.query(s.sql, s.params);
      console.log(`✓ ${s.note}`);
    } catch (e) {
      if (!s.optional) throw e;
      console.log(`• ${s.note} (skipped: ${(e as Error).message})`);
    }
  }
  if (!remove) {
    const job = await client.query(
      "select jobid, schedule, active from cron.job where jobname = $1",
      [JOB],
    );
    console.log(`\nInstalled: ${JSON.stringify(job.rows[0])}`);
    console.log(
      `Check runs with:\n  select status, return_message, start_time from cron.job_run_details where jobid = ${job.rows[0]?.jobid} order by start_time desc limit 5;`,
    );
    console.log(
      `  select status_code, content, created from net._http_response order by created desc limit 5;  -- expect 202`,
    );
  } else
    console.log(
      "Removed. (The Vault secret is kept; delete it in Supabase → Vault if you no longer need it.)",
    );
} catch (e) {
  die(
    `${(e as Error).message}\nIs DATABASE_URL your Supabase database, with pg_cron, pg_net and Vault available?`,
  );
} finally {
  await client.end();
}
