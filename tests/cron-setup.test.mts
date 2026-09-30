import assert from "node:assert/strict";
import { CRON_JOB, ensureCronJob, tickCommand, tickUrlFor } from "../lib/cron-setup.ts";

/** A tiny in-memory stand-in for Supabase's pg_extension, Vault and pg_cron. */
function fakeSupabase() {
  const s = { ext: new Set<string>(), secrets: new Map<string, { id: string; secret: string }>(), jobs: new Map<string, { schedule: string; command: string; active: boolean }>(), log: [] as string[] };
  const query = async <T,>(sql: string, p: unknown[] = []) => {
    const q = sql.replace(/\s+/g, " ").trim();
    s.log.push(q.split(" ").slice(0, 3).join(" "));
    let rows: unknown[] = [];
    if (q.startsWith("select extname from pg_extension")) rows = [...s.ext].map((extname) => ({ extname }));
    else if (q.startsWith("create extension if not exists pg_cron")) s.ext.add("pg_cron");
    else if (q.startsWith("create extension if not exists pg_net")) s.ext.add("pg_net");
    else if (q.startsWith("grant usage")) {}
    else if (q.startsWith("select id, decrypted_secret")) rows = s.secrets.has(p[0] as string) ? [s.secrets.get(p[0] as string)] : [];
    else if (q.startsWith("select vault.create_secret")) s.secrets.set(p[1] as string, { id: "v1", secret: p[0] as string });
    else if (q.startsWith("select vault.update_secret")) {
      for (const v of s.secrets.values()) if (v.id === p[0]) v.secret = p[1] as string;
    }
    else if (q.startsWith("select schedule, command, active from cron.job")) rows = s.jobs.has(p[0] as string) ? [s.jobs.get(p[0] as string)] : [];
    else if (q.startsWith("select cron.schedule")) s.jobs.set(p[0] as string, { schedule: p[1] as string, command: p[2] as string, active: true });
    else throw new Error(`unexpected SQL: ${q}`);
    return { rows: rows as T[] };
  };
  return { s, query };
}

const secret = "a".repeat(32);
const tickUrl = tickUrlFor("https://agentic.do/");
assert.equal(tickUrl, "https://agentic.do/api/cron/tick");
assert.throws(() => tickUrlFor("http://agentic.do"), /https/);
assert.equal(tickUrlFor("https://evil.example/x'); drop table users; --?a='b#'"), "https://evil.example/api/cron/tick", "only the origin is kept, so no quote reaches the SQL");

const { s, query } = fakeSupabase();
let r = await ensureCronJob(query, { secret, tickUrl });
assert.deepEqual(r.changed, ["enabled pg_cron", "enabled pg_net", "stored secret in Vault", "scheduled job"]);
assert.equal(s.jobs.get(CRON_JOB)!.command, tickCommand(tickUrl));
assert.ok(!s.jobs.get(CRON_JOB)!.command.includes(secret), "the secret never appears in the job");
console.log("✓ first run enables extensions, stores the secret in Vault, schedules the job");

s.log.length = 0;
r = await ensureCronJob(query, { secret, tickUrl });
assert.deepEqual(r.changed, []);
assert.ok(!s.log.some((l) => /create|vault\.|cron\.schedule/.test(l)), "no writes when in sync");
console.log("✓ re-running is a read-only no-op");

r = await ensureCronJob(query, { secret: "b".repeat(32), tickUrl });
assert.deepEqual(r.changed, ["rotated secret in Vault"]);
assert.equal(s.secrets.get("agentic_cron_secret")!.secret, "b".repeat(32));
r = await ensureCronJob(query, { secret: "b".repeat(32), tickUrl: tickUrlFor("https://www.agentic.do"), every: "*/2 * * * *" });
assert.deepEqual(r.changed, ["updated job"]);
assert.equal(s.jobs.get(CRON_JOB)!.schedule, "*/2 * * * *");
console.log("✓ a new CRON_SECRET or APP_URL is picked up on the next boot");

await assert.rejects(ensureCronJob(query, { secret: "short", tickUrl }), /24 characters/);
await assert.rejects(ensureCronJob(query, { secret, tickUrl, every: "every minute" }), /Invalid cron/);
console.log("✓ rejects weak secrets and bad schedules");
console.log("All cron setup checks passed.");
