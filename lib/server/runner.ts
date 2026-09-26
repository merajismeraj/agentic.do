import "server-only";
import type { Agent, Approval, Message, RunEvent, RunRequest, Step } from "../types";
import { newId } from "./auth";
import { googleAuthFor } from "./google";
import { execute } from "./run";
import { finishMessage, insertApproval, insertMessage, logActivity, threadHistory, type Workspace } from "./workspace";

export interface TeammateRun {
  replyId: string;
  text: string;
  approvals: Approval[];
  error?: string;
}

/**
 * Runs a teammate against a stored workspace and persists everything it does:
 * the user's message (if any), the reply with its steps, approvals and an
 * activity entry. Shared by chat (`/api/run`) and the scheduler.
 */
export async function runTeammate(opts: {
  ws: Workspace;
  agent: Agent;
  /** What the model is asked to do. */
  prompt: string;
  /** The visible user message; omitted for scheduled runs. */
  userMessage?: { id: string; text: string };
  replyId?: string;
  trigger?: Message["trigger"];
  emit?: (e: RunEvent) => void;
  /** Fail instead of simulating when no provider can run live (scheduled runs). */
  requireLive?: boolean;
}): Promise<TeammateRun> {
  const { ws, agent, prompt, trigger } = opts;
  const emit = opts.emit ?? (() => {});
  const history = await threadHistory(ws.id, agent.id);
  const now = Date.now();
  const replyId = opts.replyId ?? newId();

  if (opts.userMessage) await insertMessage(ws.id, { id: opts.userMessage.id, threadId: agent.id, author: "user", text: opts.userMessage.text, at: now, trigger });
  await insertMessage(ws.id, { id: replyId, threadId: agent.id, author: "agent", agentId: agent.id, text: "", at: now + 1, steps: [], trigger });

  const request: RunRequest = {
    agent,
    text: prompt,
    threadId: agent.id,
    history,
    brains: ws.doc.brains,
    routing: ws.doc.routing,
    connected: ws.doc.connected,
    memory: ws.doc.memory,
    user: ws.doc.user,
  };
  const ctx = { google: await googleAuthFor(ws.id), timeZone: ws.doc.user.timezone || "UTC" };

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

  // Record events strictly in order; approvals are persisted before anyone hears about them.
  let chain = Promise.resolve();
  try {
    await execute(request, (e) => void (chain = chain.then(() => record(e))), ctx, { requireLive: opts.requireLive });
  } catch (e) {
    error = (e as Error).message || "Run failed";
    await chain;
    await record({ t: "error", message: error });
  } finally {
    await chain;
    await finishMessage(ws.id, replyId, {
      text: finalText,
      steps: steps.map((s) => ({ ...s, state: "done" as const })),
      approvalIds: approvals.map((a) => a.id),
      mode,
      error,
    });
    const label = trigger ? `“${trigger.title}”` : prompt.slice(0, 60);
    await logActivity(ws.id, {
      agentId: agent.id,
      toolId: approvals[0]?.toolId,
      text: approvals.length
        ? `Prepared “${approvals[0].title}” for approval`
        : error
          ? `Couldn't finish ${trigger ? label : `: ${label}`}`
          : trigger?.scheduled
            ? `Ran ${label} on schedule`
            : `Completed: ${label}`,
    });
  }
  return { replyId, text: finalText, approvals, error };
}

/** The instruction a routine gives its teammate. */
export function routinePrompt(title: string, scheduled: boolean) {
  return `${scheduled ? "It's time for your scheduled routine" : "Run your routine now"}: “${title}”. Do the work with your tools, then report back concisely. Anything that would leave the company must go through approval.`;
}
