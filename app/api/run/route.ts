import { currentUser, errorResponse, HttpError, sameOrigin } from "@/lib/server/auth";
import { simulate } from "@/lib/server/run";
import { routinePrompt, runTeammate } from "@/lib/server/runner";
import { claimRoutineRun, finishRoutineRun, requireWorkspace, safeId } from "@/lib/server/workspace";
import type { RunEvent, RunRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };

function streamOf(work: (emit: (e: RunEvent) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Keep working (and persisting) even if the browser disconnects mid-run.
      const emit = (e: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {}
      };
      try {
        await work(emit);
      } catch (e) {
        emit({ t: "error", message: e instanceof HttpError ? e.message : "Run failed" });
        if (!(e instanceof HttpError)) console.error(e);
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
}

/**
 * Signed in: runs a teammate from the stored workspace (the browser only sends
 * which teammate and what to do, or which routine to run now) and persists the
 * conversation and approvals. Signed out: the no-account demo, always simulated.
 */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
    const body = (await req.json()) as { agentId?: string; text?: string; routineId?: string; messageId?: string; replyId?: string; demo?: RunRequest };
    const user = await currentUser(req);

    if (!user) {
      const demo = body.demo;
      if (!demo?.agent?.id || typeof demo.text !== "string" || !demo.text.trim()) throw new HttpError(401, "Sign in required");
      return new Response(streamOf((emit) => simulate(demo, emit, demo.brains?.length > 0)), { headers: NDJSON });
    }

    const ws = await requireWorkspace(user.id);
    const routine = body.routineId ? ws.doc.routines.find((r) => r.id === body.routineId) : undefined;
    if (body.routineId && !routine) throw new HttpError(404, "Routine not found");
    const agent = ws.doc.agents.find((a) => a.id === (routine?.agentId ?? body.agentId));
    if (!agent) throw new HttpError(404, "Teammate not found");
    if (agent.status === "paused") throw new HttpError(409, `${agent.name} is paused`);
    const text = routine ? routine.title : (body.text ?? "").trim().slice(0, 8000);
    if (!text) throw new HttpError(400, "Say what you need");

    const trigger = routine ? { routineId: routine.id, title: routine.title, scheduled: false } : undefined;
    const runId = routine ? await claimRoutineRun(ws.id, routine.id, Date.now(), true) : null;

    return new Response(
      streamOf(async (emit) => {
        const r = await runTeammate({
          ws,
          agent,
          prompt: routine ? routinePrompt(routine.title, false) : text,
          userMessage: { id: safeId(body.messageId), text: routine ? `Run “${routine.title}” now` : text },
          replyId: safeId(body.replyId),
          trigger,
          emit,
        });
        if (runId)
          await finishRoutineRun(ws.id, runId, { status: r.error ? "failed" : "done", messageId: r.replyId, error: r.error, needsApproval: r.approvals.length > 0 });
      }),
      { headers: NDJSON },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
