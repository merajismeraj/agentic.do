/**
 * One-time cleanup: agentic.do used to drive a routines scheduler from Supabase
 * pg_cron. That feature moved to srk, so remove the job (and its Vault secret)
 * if it's still there. Safe to delete this file once it has run in production.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.VERCEL) return;
  try {
    const { databaseUrl, db } = await import("./lib/server/db");
    if (!databaseUrl()) return;
    const d = await db();
    const { rows } = await d.query<{ n: number }>("select count(*)::int as n from pg_extension where extname = 'pg_cron'");
    if (!rows[0]?.n) return;
    const job = await d.query("select cron.unschedule(jobid) from cron.job where jobname = 'agentic-scheduler-tick'");
    await d.query("delete from vault.secrets where name = 'agentic_cron_secret'").catch(() => {});
    if (job.rows.length) console.log("[cleanup] removed the retired Supabase scheduler job");
  } catch (e) {
    console.error("[cleanup] couldn't remove the retired scheduler job:", e instanceof Error ? e.message : e);
  }
}
