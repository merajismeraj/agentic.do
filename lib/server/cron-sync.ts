import "server-only";
import { cronStatus, DEFAULT_EVERY, ensureCronJob, tickUrlFor } from "../cron-setup";
import { databaseUrl, db } from "./db";

/**
 * On Supabase, keeps the pg_cron job that drives /api/cron/tick in step with this
 * deployment's APP_URL and CRON_SECRET: installs it on first boot and re-syncs after
 * either changes. Runs once per process. SUPABASE_CRON=off disables it.
 */
export type CronSync = { ok: true; changed: string[] } | { ok: false; skipped?: string; error?: string };

export function supabaseCronWanted() {
  if (process.env.SUPABASE_CRON?.trim().toLowerCase() === "off") return "SUPABASE_CRON=off";
  if (!databaseUrl()) return "no database";
  if (!process.env.CRON_SECRET?.trim()) return "CRON_SECRET not set";
  if (!process.env.APP_URL?.trim()) return "APP_URL not set";
  return null;
}

async function isSupabase() {
  const { rows } = await (await db()).query<{ n: number }>(
    "select count(*)::int as n from pg_available_extensions where name in ('pg_cron', 'pg_net', 'supabase_vault')",
  );
  return rows[0]?.n === 3;
}

export function syncSupabaseCron(): Promise<CronSync> {
  const g = globalThis as unknown as { __agenticCronSync?: Promise<CronSync> };
  return (g.__agenticCronSync ??= (async (): Promise<CronSync> => {
    const skip = supabaseCronWanted();
    if (skip) return { ok: false, skipped: skip };
    try {
      if (!(await isSupabase())) return { ok: false, skipped: "database is not Supabase (pg_cron, pg_net or Vault unavailable)" };
      const d = await db();
      const r = await ensureCronJob(d.query, {
        secret: process.env.CRON_SECRET!.trim(),
        tickUrl: tickUrlFor(process.env.APP_URL!.trim()),
        every: process.env.SUPABASE_CRON_EVERY?.trim() || DEFAULT_EVERY,
      });
      if (r.changed.length) console.log(`[scheduler] Supabase cron: ${r.changed.join(", ")} → ${r.tickUrl} (${r.every})`);
      return { ok: true, changed: r.changed };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error("[scheduler] Supabase cron sync failed:", error);
      // Let a later request retry.
      setTimeout(() => (g.__agenticCronSync = undefined), 60_000);
      return { ok: false, error };
    }
  })());
}

export async function schedulerHealth() {
  const sync = await syncSupabaseCron();
  const d = await db();
  const beat = await d.query<{ at: string }>("select last_tick_at as at from scheduler_heartbeat where id = 1").catch(() => ({ rows: [] as { at: string }[] }));
  const job = sync.ok ? await cronStatus(d.query).catch((e) => ({ installed: false as const, error: (e as Error).message })) : null;
  return { sync, job, lastTickAt: beat.rows[0]?.at ?? null };
}
