"use client";

import { CalendarClock, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RoutineForm } from "@/components/routine-form";
import { RoutineRow } from "@/components/routine-row";
import { PageHeader } from "@/components/shell";
import { AgentAvatar, Button, Card, Empty, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { clock, cn } from "@/lib/utils";

const START = 7 * 60;
const END = 20 * 60;

export default function SchedulePage() {
  const { state, mode } = useStore();
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const pct = (m: number) => `${((Math.min(END, Math.max(START, m)) - START) / (END - START)) * 100}%`;
  const hours = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60);

  return (
    <div>
      <PageHeader
        title="Routines"
        subtitle={mode === "demo" ? "Recurring work your team does on schedule. In the demo, use Run now to see one." : "Recurring work your team does on schedule — while you're in meetings, asleep, or on holiday."}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)} disabled={!state.agents.length}>
            <Plus size={16} /> New routine
          </Button>
        }
      />

      {state.routines.length ? (
        <>
          <Card className="mb-8 overflow-x-auto p-5">
            <div className="mb-4 text-sm font-medium">Today</div>
            <div className="min-w-[640px]">
              <div className="relative mb-2 h-4 text-[11px] text-muted">
                {hours.map((h) => (
                  <span key={h} className="absolute -translate-x-1/2 font-mono tabular-nums" style={{ left: pct(h) }}>
                    {clock(h)}
                  </span>
                ))}
              </div>
              <div className="relative space-y-2 border-t border-line pt-3">
                {hours.map((h) => (
                  <span key={h} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: pct(h) }} />
                ))}
                {now !== null && now > START && now < END && (
                  <span className="absolute top-0 bottom-0 z-10 w-px bg-accent" style={{ left: pct(now) }}>
                    <span className="absolute -top-1 -left-[3px] size-[7px] rounded-full bg-accent" />
                  </span>
                )}
                {state.agents.map((a) => {
                  const rs = state.routines.filter((r) => r.agentId === a.id && r.enabled).sort((x, y) => x.nextRunMinute - y.nextRunMinute);
                  if (!rs.length) return null;
                  // Stack routines that would overlap onto separate lanes (a pill spans roughly 2.5 hours of track).
                  const laneEnds: number[] = [];
                  const lane = new Map<string, number>();
                  for (const r of rs) {
                    let i = laneEnds.findIndex((end) => end <= r.nextRunMinute);
                    if (i === -1) i = laneEnds.push(0) - 1;
                    laneEnds[i] = r.nextRunMinute + 150;
                    lane.set(r.id, i);
                  }
                  return (
                    <div key={a.id} className="relative" style={{ height: laneEnds.length * 42 - 6 }}>
                      {rs.map((r) => (
                        <Link
                          key={r.id}
                          href={`/app/agents/${a.id}`}
                          className={cn(
                            "absolute flex h-9 max-w-52 items-center gap-1.5 rounded-lg border px-1.5 pr-2.5 text-xs font-medium whitespace-nowrap shadow-sm transition-transform hover:z-20 hover:scale-[1.03]",
                            now !== null && r.nextRunMinute < now && "opacity-50",
                          )}
                          style={{
                            top: (lane.get(r.id) ?? 0) * 42,
                            left: pct(r.nextRunMinute),
                            background: `color-mix(in srgb, ${a.color} 10%, var(--surface))`,
                            borderColor: `color-mix(in srgb, ${a.color} 30%, transparent)`,
                          }}
                          title={`${a.name} · ${r.title} · ${r.cadence}`}
                        >
                          <AgentAvatar agent={a} size={22} />
                          <span className="truncate">{r.title}</span>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="divide-y divide-line">
            {state.routines.map((r) => (
              <RoutineRow key={r.id} routine={r} showAgent />
            ))}
          </Card>
        </>
      ) : (
        <Empty
          icon={<CalendarClock size={20} />}
          title="No routines yet"
          body="Routines are how teammates work on schedule — a morning brief, a Friday digest, hourly inbox triage."
          action={state.agents.length ? <Button variant="primary" onClick={() => setAdding(true)}>Create a routine</Button> : undefined}
        />
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New routine">
        <div className="p-5">
          <RoutineForm onDone={() => setAdding(false)} />
        </div>
      </Modal>
    </div>
  );
}
