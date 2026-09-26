"use client";

import { useState } from "react";
import { describe, minuteOfDay, nextOccurrence, whenLabel, type Schedule } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { cn, uid } from "@/lib/utils";
import { Field, input } from "./agent-config";
import { AgentAvatar, Button } from "./ui";

type Kind = "weekdays" | "daily" | "weekly" | "hourly" | "interval" | "trigger";

const KINDS: { value: Kind; label: string }[] = [
  { value: "weekdays", label: "Weekdays" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Specific days" },
  { value: "hourly", label: "Every hour" },
  { value: "interval", label: "Every few minutes" },
  { value: "trigger", label: "When something happens" },
];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function RoutineForm({ agentId, onDone }: { agentId?: string; onDone: () => void }) {
  const { state, update, toast } = useStore();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("weekdays");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>([1]);
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("19:00");
  const [minutes, setMinutes] = useState(30);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [triggerLabel, setTriggerLabel] = useState("When a new lead arrives");
  const [who, setWho] = useState(agentId ?? state.agents[0]?.id);

  const schedule: Schedule =
    kind === "weekdays" || kind === "daily"
      ? { kind, time }
      : kind === "weekly"
        ? { kind, days: [...days].sort(), time }
        : kind === "hourly"
          ? { kind, from, to, weekdaysOnly }
          : kind === "interval"
            ? { kind, minutes, from, to, weekdaysOnly }
            : { kind, label: triggerLabel.trim() || "On demand" };

  const tz = state.user.timezone || "UTC";
  const next = nextOccurrence(schedule, tz, Date.now());
  const valid = title.trim() && who && (kind !== "weekly" || days.length > 0) && (kind !== "hourly" && kind !== "interval" ? true : from < to);

  const save = () => {
    if (!valid) return;
    update((s) => ({
      ...s,
      routines: [
        ...s.routines,
        {
          id: uid(),
          agentId: who!,
          title: title.trim(),
          cadence: describe(schedule),
          schedule,
          createdAt: Date.now(),
          nextRunMinute: next ? minuteOfDay(next, tz) : 9 * 60,
          enabled: true,
        },
      ],
    }));
    toast(next ? `Scheduled · first run ${whenLabel(next, tz)}` : "Routine saved");
    onDone();
  };

  return (
    <div className="space-y-4">
      {!agentId && (
        <Field label="Who owns it">
          <div className="flex flex-wrap gap-1.5">
            {state.agents.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setWho(a.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[13px]",
                  who === a.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-2",
                )}
              >
                <AgentAvatar agent={a} size={18} /> {a.name}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="What should happen" hint="Write it like you'd brief a colleague.">
        <input
          autoFocus
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="e.g. Send me a pipeline summary"
        />
      </Field>

      <Field label="How often">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px]",
                kind === k.value ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-2 hover:border-line-strong",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Field>

      {kind === "weekly" && (
        <div className="flex gap-1.5" role="group" aria-label="Days">
          {DAYS.map((d, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={days.includes(i)}
              aria-label={DAY_FULL[i]}
              onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}
              className={cn(
                "size-9 rounded-full border text-sm font-medium",
                days.includes(i) ? "border-accent bg-accent text-accent-fg" : "border-line text-fg-2 hover:border-line-strong",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {(kind === "weekdays" || kind === "daily" || kind === "weekly") && (
        <Field label="At">
          <input type="time" className={cn(input, "w-36")} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      )}

      {(kind === "hourly" || kind === "interval") && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            {kind === "interval" && (
              <Field label="Every">
                <select className={cn(input, "w-32")} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  {[15, 30, 45].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Between">
              <input type="time" className={cn(input, "w-32")} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="And">
              <input type="time" className={cn(input, "w-32")} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" checked={weekdaysOnly} onChange={(e) => setWeekdaysOnly(e.target.checked)} className="accent-[var(--accent)]" />
            Weekdays only
          </label>
        </div>
      )}

      {kind === "trigger" && (
        <Field label="Trigger" hint="Event triggers are coming soon. Until then, use Run now whenever it happens.">
          <input className={input} value={triggerLabel} onChange={(e) => setTriggerLabel(e.target.value)} />
        </Field>
      )}

      <div className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
        {describe(schedule)}
        {next && (
          <span className="text-muted">
            {" "}
            · first run {whenLabel(next, tz)} ({tz})
          </span>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={!valid}>
          Schedule
        </Button>
      </div>
    </div>
  );
}
