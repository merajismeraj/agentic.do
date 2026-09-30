import { schedulerHealth } from "@/lib/server/cron-sync";
import { databaseUrl, db } from "@/lib/server/db";
import { emailConfigured } from "@/lib/server/mailer";
import { sealingConfigured } from "@/lib/server/seal";

export const dynamic = "force-dynamic";

/** Deployment check: which pieces are configured and whether the database answers. Never returns secrets. */
export async function GET() {
  const set = (k: string) => !!process.env[k]?.trim();
  let database: { ok: boolean; error?: string };
  try {
    await (await db()).query("select 1");
    database = { ok: true };
  } catch (e) {
    database = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unreachable" };
  }
  const config = {
    database: databaseUrl() ? "postgres" : "embedded",
    sessionSecret: sealingConfigured(),
    cronSecret: set("CRON_SECRET"),
    appUrl: set("APP_URL"),
    email: emailConfigured(),
    google: set("GOOGLE_CLIENT_ID") && set("GOOGLE_CLIENT_SECRET"),
    slack: set("SLACK_CLIENT_ID") && set("SLACK_CLIENT_SECRET"),
  };
  const scheduler = !database.ok
    ? null
    : process.env.VERCEL || process.env.SCHEDULER?.trim().toLowerCase() === "off"
      ? { mode: "external-cron", ...(await schedulerHealth().catch((e) => ({ error: (e as Error).message }))) }
      : { mode: "in-process" };
  return Response.json({ ok: database.ok && config.sessionSecret, database, config, scheduler }, { status: database.ok ? 200 : 503 });
}
