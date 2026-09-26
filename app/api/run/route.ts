import { currentUser, errorResponse, HttpError, sameOrigin } from "@/lib/server/auth";
import { googleAuthFor } from "@/lib/server/google";
import { execute, simulate } from "@/lib/server/run";
import { finishMessage, insertApproval, insertMessage, logActivity, requireWorkspace, safeId, threadHistory } from "@/lib/server/workspace";
import type { Approval, RunEvent, RunRequest, Step } from "@/lib/types";

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
 * which teammate and what to do) and persists the conversation and approvals.
 * Signed out: the no-account demo, which is always simulated.
 */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked");
    const body = (await req.json()) as { agentId?: string; text?: string; messageId?: string; replyId?: string; demo?: RunRequest };
    const user = await currentUser(req);

    if (!user) {
      const demo = body.demo;
      if (!demo?.agent?.id || typeof demo.text !== "string" || !demo.text.trim()) throw new HttpError(401, "Sign in required");
      return new Response(streamOf((emit) => simulate(demo, emit, demo.brains?.length > 0)), { headers: NDJSON });
    }

    const ws = await requireWorkspace(user.id);
    const text = (body.text ?? "").trim().slice(0, 8000);
    const agent = ws.doc.agents.find((a) => a.id === body.agentId);
    if (!agent) throw new HttpError(404, "Teammate not found");
    if (!text) throw new HttpError(400, "Say what you need");
    if (agent.status === "paused") throw new HttpError(409, `${agent.name} is paused`);

    const history = await threadHistory(ws.id, agent.id);
    const now = Date.now();
    const userMsgId = safeId(body.messageId);
    const replyId = safeId(body.replyId);
    await insertMessage(ws.id, { id: userMsgId, threadId: agent.id, author: "user", text, at: now });
    await insertMessage(ws.id, { id: replyId, threadId: agent.id, author: "agent", agentId: agent.id, text: "", at: now + 1, steps: [] });

    const request: RunRequest = {
      agent,
      text,
      threadId: agent.id,
      history,
      brains: ws.doc.brains,
      routing: ws.doc.routing,
      connected: ws.doc.connected,
      memory: ws.doc.memory,
      user: ws.doc.user,
    };
    const ctx = { google: await googleAuthFor(ws.id), timeZone: ws.doc.user.timezone || "UTC" };

    return new Response(
      streamOf(async (emit) => {
        const steps: Step[] = [];
        const approvals: Approval[] = [];
        let finalText = "";
        let mode: "live" | "demo" | undefined;
        let error: string | undefined;

        const record = async (e: RunEvent) => {
          if (e.t === "step") {
            const i = steps.findIndex((s) => s.id === e.step.id);
            if (i === -1) steps.push(e.step);
            else steps[i] = e.step;
          } else if (e.t === "approval") {
            approvals.push(e.approval);
            await insertApproval(ws.id, e.approval);
          } else if (e.t === "text") finalText = e.text;
          else if (e.t === "done") mode = e.mode;
          else if (e.t === "error") error = e.message;
          emit(e);
        };

        // Record events strictly in order; approvals are persisted before the browser hears about them.
        let chain = Promise.resolve();
        try {
          await execute(request, (e) => void (chain = chain.then(() => record(e))), ctx);
        } finally {
          await chain;
          await finishMessage(ws.id, replyId, {
            text: finalText,
            steps: steps.map((s) => ({ ...s, state: "done" as const })),
            approvalIds: approvals.map((a) => a.id),
            mode,
            error,
          });
          await logActivity(ws.id, {
            agentId: agent.id,
            toolId: approvals[0]?.toolId,
            text: approvals.length ? `Prepared “${approvals[0].title}” for approval` : error ? `Couldn't finish: ${text.slice(0, 50)}` : `Completed: ${text.slice(0, 60)}`,
          });
        }
      }),
      { headers: NDJSON },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
