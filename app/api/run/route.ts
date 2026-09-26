import { execute } from "@/lib/server/run";
import type { RunEvent, RunRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Streams a teammate run as newline-delimited JSON events. */
export async function POST(req: Request) {
  const body = (await req.json()) as RunRequest;
  if (!body?.agent?.id || typeof body.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "agent and text are required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await execute(body, emit);
      } catch (e) {
        emit({ t: "error", message: (e as Error).message ?? "Run failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
