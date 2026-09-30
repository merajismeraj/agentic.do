import { databaseUrl, db } from "@/lib/server/db";
import { googleConfigured } from "@/lib/server/google";
import { emailConfigured } from "@/lib/server/mailer";

export const dynamic = "force-dynamic";

/** Deployment check: which pieces are configured and whether the database answers. Never returns secrets. */
export async function GET() {
  let database: { ok: boolean; error?: string };
  try {
    await (await db()).query("select 1");
    database = { ok: true };
  } catch (e) {
    database = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unreachable" };
  }
  const config = {
    database: databaseUrl() ? "postgres" : "embedded",
    sessionSecret: (process.env.SESSION_SECRET?.trim().length ?? 0) >= 32,
    appUrl: !!process.env.APP_URL?.trim(),
    email: emailConfigured(),
    google: googleConfigured(),
  };
  return Response.json({ ok: database.ok && config.sessionSecret, database, config }, { status: database.ok ? 200 : 503 });
}
