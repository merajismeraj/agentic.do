import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/server/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduler entry point for serverless hosts (e.g. Vercel Cron, which sends
 * `Authorization: Bearer $CRON_SECRET`). Refuses to run without a secret.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await tick());
}

export const POST = GET;
