"use client";

import { CalendarClock, Plus, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader, openHire } from "@/components/shell";
import { AgentAvatar, Badge, Button, Card, Empty, ProviderLogo, Switch, ToolLogo } from "@/components/ui";
import { AUTONOMY, providerById } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function AgentsPage() {
  const { state, update } = useStore();

  return (
    <div>
      <PageHeader
        title="Teammates"
        subtitle="Each teammate owns a job, uses your tools, and thinks with the AI you choose."
        actions={
          <Button variant="primary" onClick={openHire}>
            <Plus size={16} /> Hire teammate
          </Button>
        }
      />

      {state.agents.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {state.agents.map((a) => {
            const routines = state.routines.filter((r) => r.agentId === a.id);
            const pending = state.approvals.filter((x) => x.agentId === a.id && x.status === "pending").length;
            const missing = a.tools.filter((t) => !state.connected.includes(t)).length;
            return (
              <Card key={a.id} className={cn("group relative flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop", a.status === "paused" && "opacity-65")}>
                <Link href={`/app/agents/${a.id}`} className="absolute inset-0 rounded-2xl" aria-label={`Open ${a.name}`} />
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={a} size={44} showStatus />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-sm text-muted">{a.role}</div>
                  </div>
                  <div className="relative z-10">
                    <Switch
                      label={a.status === "paused" ? "Resume" : "Pause"}
                      checked={a.status !== "paused"}
                      onChange={(on) =>
                        update((s) => ({ ...s, agents: s.agents.map((x) => (x.id === a.id ? { ...x, status: on ? "idle" : "paused" } : x)) }))
                      }
                    />
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-fg-2">{a.instructions}</p>
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <Badge tone={a.autonomy === "auto" ? "accent" : "neutral"}>{AUTONOMY[a.autonomy].label}</Badge>
                  {pending > 0 && <Badge tone="warn">{pending} awaiting you</Badge>}
                  {missing > 0 && <Badge tone="danger">{missing} tool{missing > 1 ? "s" : ""} not connected</Badge>}
                </div>
                <div className="mt-auto flex items-center gap-3 border-t border-line pt-3.5 text-xs text-muted" style={{ marginTop: 16 }}>
                  <span className="flex -space-x-1">
                    {a.tools.slice(0, 5).map((t) => (
                      <ToolLogo key={t} id={t} size={18} className="rounded-full ring-2 ring-surface" />
                    ))}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarClock size={13} /> {routines.length}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {a.brain === "auto" ? (
                      <>
                        <Sparkles size={13} className="text-accent" /> Auto-route
                      </>
                    ) : (
                      <>
                        <ProviderLogo id={a.brain} size={16} className="rounded-full" /> {providerById(a.brain).name}
                      </>
                    )}
                  </span>
                </div>
              </Card>
            );
          })}
          <button
            onClick={openHire}
            className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <Plus size={20} /> Hire another teammate
          </button>
        </div>
      ) : (
        <Empty
          icon={<Users size={20} />}
          title="No teammates yet"
          body="Hire from a template — Chief of Staff is a great first hire."
          action={<Button variant="primary" onClick={openHire}>Hire your first teammate</Button>}
        />
      )}
    </div>
  );
}
