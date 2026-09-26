import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { tick } from "@/lib/server/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduler entry point for an external cron (Supabase pg_cron + pg_net, or
 * any HTTP cron). Requires `Authorization: Bearer $CRON_SECRET`.
 *
 * Responds 202 immediately and runs the pass after the response, because
 * cron HTTP clients time out quickly (pg_net defaults to 2 s) while a pass
 * can take minutes. Duplicate or overlapping calls are safe: every
 * occurrence is claimed exactly once in the database.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const pass = () =>
    tick().then(
      (r) => r.started && console.log(`[scheduler] cron pass ran ${r.started} routine(s): ${r.done} done, ${r.failed} failed`),
      (e) => console.error("[scheduler] cron pass failed", e),
    );
  try {
    after(pass);
  } catch {
    // Outside a request scope (tests, custom servers): run inline.
    await pass();
  }
  return Response.json({ accepted: true }, { status: 202 });
}

export const POST = GET;
