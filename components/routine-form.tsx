"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { Field, input } from "./agent-config";
import { AgentAvatar, Button } from "./ui";

const CADENCES = ["Weekdays", "Every day", "Mondays", "Fridays", "Hourly", "When something new arrives"];

export function RoutineForm({ agentId, onDone }: { agentId?: string; onDone: () => void }) {
  const { state, update, toast } = useStore();
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState(CADENCES[0]);
  const [time, setTime] = useState("09:00");
  const [who, setWho] = useState(agentId ?? state.agents[0]?.id);
  const timed = !cadence.startsWith("When") && cadence !== "Hourly";

  const save = () => {
    if (!title.trim() || !who) return;
    const [h, m] = time.split(":").map(Number);
    update((s) => ({
      ...s,
      routines: [
        ...s.routines,
        {
          id: uid(),
          agentId: who,
          title: title.trim(),
          cadence: timed ? `${cadence} · ${time}` : cadence,
          nextRunMinute: timed ? h * 60 + m : 9 * 60,
          enabled: true,
        },
      ],
    }));
    toast("Routine scheduled");
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
                onClick={() => setWho(a.id)}
                className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[13px] ${who === a.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-2"}`}
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
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="How often">
          <select className={input} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {CADENCES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="At">
          <input type="time" className={input} value={time} disabled={!timed} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={!title.trim()}>
          Schedule
        </Button>
      </div>
    </div>
  );
}
