"use client";

import { AlertCircle, CalendarClock, CheckCircle2, Hand, Loader2, Play, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nextOccurrence, scheduleOf, whenLabel } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import type { Routine, RoutineRun } from "@/lib/types";
import { ago, cn } from "@/lib/utils";
import { AgentAvatar, Button, Switch } from "./ui";

export function lastRunOf(runs: RoutineRun[] | undefined, routineId: string) {
  return (runs ?? []).filter((r) => r.routineId === routineId).sort((a, b) => (b.finishedAt ?? b.scheduledFor) - (a.finishedAt ?? a.scheduledFor))[0];
}

/** One routine: schedule, next run, last result, and Run now. */
export function RoutineRow({ routine, showAgent }: { routine: Routine; showAgent?: boolean }) {
  const { state, update, runRoutine, mode } = useStore();
  const router = useRouter();
  const agent = state.agents.find((a) => a.id === routine.agentId);
  const schedule = scheduleOf(routine);
  const tz = state.user.timezone || "UTC";
  const next = routine.enabled ? nextOccurrence(schedule, tz, Date.now()) : null;
  const last = lastRunOf(state.routineRuns, routine.id);
  const busy = agent?.status === "working";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap">
      {showAgent && agent ? <AgentAvatar agent={agent} size={30} /> : <CalendarClock size={16} className="text-muted" />}
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium", !routine.enabled && "text-muted")}>{routine.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {showAgent && agent && <span>{agent.name} ·</span>}
          <span>{routine.cadence}</span>
          {schedule.kind === "trigger" ? (
            <span className="inline-flex items-center gap-1 text-fg-2">
              <Zap size={11} /> Runs on demand for now
            </span>
          ) : next ? (
            <span className="text-fg-2">· Next {whenLabel(next, tz)}</span>
          ) : null}
        </div>
        {last && <LastRun run={last} agentId={routine.agentId} />}
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || !agent || agent.status === "paused"}
        onClick={() => {
          runRoutine(routine.id);
          router.push(`/app/agents/${routine.agentId}`);
        }}
        title={mode === "demo" ? "Runs a simulated version in the demo" : "Run this routine now"}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run now
      </Button>
      <Switch
        label="Enabled"
        checked={routine.enabled}
        onChange={(v) => update((s) => ({ ...s, routines: s.routines.map((x) => (x.id === routine.id ? { ...x, enabled: v } : x)) }))}
      />
    </div>
  );
}

function LastRun({ run, agentId }: { run: RoutineRun; agentId: string }) {
  const when = ago(run.finishedAt ?? run.scheduledFor);
  const how = run.manual ? "run manually" : "ran on schedule";
  const cls = "mt-1 inline-flex items-center gap-1 text-xs";
  if (run.status === "running")
    return (
      <span className={cn(cls, "text-accent-ink")}>
        <Loader2 size={11} className="animate-spin" /> Running now
      </span>
    );
  if (run.status === "failed")
    return (
      <span className={cn(cls, "text-danger")} title={run.error}>
        <AlertCircle size={11} /> Failed {when}
        {run.error ? ` — ${run.error.slice(0, 80)}` : ""}
      </span>
    );
  return (
    <Link href={run.needsApproval ? "/app/inbox" : `/app/agents/${agentId}`} className={cn(cls, run.needsApproval ? "text-warn" : "text-ok", "hover:underline")}>
      {run.needsApproval ? <Hand size={11} /> : <CheckCircle2 size={11} />}
      {run.needsApproval ? `Waiting for your approval · ${how} ${when}` : `Done · ${how} ${when}`}
    </Link>
  );
}
