import "server-only";
import { previousOccurrence, scheduleOf } from "../schedule";
import { routinePrompt, runTeammate } from "./runner";
import { allWorkspaces, claimRoutineRun, failStaleRuns, finishRoutineRun } from "./workspace";

/** How late a run may still start (e.g. after a deploy or a missed tick). Older occurrences are skipped, not replayed. */
export const CATCH_UP_MS = 90 * 60_000;

export interface TickResult {
  due: number;
  started: number;
  done: number;
  failed: number;
  skippedBusy: number;
}

/**
 * One scheduler pass: finds routine occurrences that are due, claims each
 * exactly once in the database, and runs it. Safe to call from several
 * places at once (cron + in-process loop, many instances).
 */
export async function tick(opts: { now?: number; budgetMs?: number; concurrency?: number } = {}): Promise<TickResult> {
  const now = opts.now ?? Date.now();
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const concurrency = opts.concurrency ?? 4;
  const result: TickResult = { due: 0, started: 0, done: 0, failed: 0, skippedBusy: 0 };

  await failStaleRuns();

  const jobs: (() => Promise<void>)[] = [];
  for await (const ws of allWorkspaces()) {
    const tz = ws.doc.user?.timezone || "UTC";
    for (const routine of ws.doc.routines ?? []) {
      if (!routine.enabled) continue;
      const agent = ws.doc.agents.find((a) => a.id === routine.agentId);
      if (!agent || agent.status === "paused") continue;
      const at = previousOccurrence(scheduleOf(routine), tz, now);
      if (at == null || now - at > CATCH_UP_MS) continue;
      if (routine.createdAt && at < routine.createdAt) continue;
      result.due++;

      jobs.push(async () => {
        if (Date.now() > deadline) {
          result.skippedBusy++; // Unclaimed, so the next tick picks it up while still inside the catch-up window.
          return;
        }
        const runId = await claimRoutineRun(ws.id, routine.id, at, false);
        if (!runId) return; // Another scheduler already has it.
        result.started++;
        try {
          const r = await runTeammate({
            ws,
            agent,
            prompt: routinePrompt(routine.title, true),
            trigger: { routineId: routine.id, title: routine.title, scheduled: true },
            requireLive: true,
          });
          await finishRoutineRun(ws.id, runId, { status: r.error ? "failed" : "done", messageId: r.replyId, error: r.error, needsApproval: r.approvals.length > 0 });
          if (r.error) result.failed++;
          else result.done++;
        } catch (e) {
          result.failed++;
          await finishRoutineRun(ws.id, runId, { status: "failed", error: (e as Error).message });
        }
      });
    }
  }

  // Small worker pool: runs are I/O-bound (model + tool calls).
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) await jobs[next++]();
    }),
  );
  return result;
}
