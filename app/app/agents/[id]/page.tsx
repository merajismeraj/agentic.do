"use client";

import { CalendarClock, MessageSquare, Plus, Settings2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AgentConfig, type AgentDraft } from "@/components/agent-config";
import { ApprovalCard } from "@/components/approval-card";
import { Composer } from "@/components/composer";
import { RoutineForm } from "@/components/routine-form";
import { Steps } from "@/components/steps";
import { AgentAvatar, Badge, Button, Card, Modal, ProviderLogo, Rich, Segmented, Switch, ToolLogo } from "@/components/ui";
import { AUTONOMY, integrationById, providerById } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { Agent } from "@/lib/types";
import { ago, cn } from "@/lib/utils";

type Tab = "chat" | "routines" | "settings";

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const router = useRouter();
  const agent = state.agents.find((a) => a.id === id);
  const [tab, setTab] = useState<Tab>("chat");

  useEffect(() => {
    if (!agent) router.replace("/app/agents");
  }, [agent, router]);
  if (!agent) return null;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <AgentAvatar agent={agent} size={56} showStatus />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {agent.role}
              <span>·</span>
              {agent.status === "working" ? (
                <span className="shimmer-text font-medium">Working…</span>
              ) : agent.status === "paused" ? (
                "Paused"
              ) : (
                "Available"
              )}
            </div>
          </div>
        </div>
        <Segmented
          className="sm:ml-auto"
          value={tab}
          onChange={setTab}
          options={[
            { value: "chat", label: <span className="flex items-center gap-1.5"><MessageSquare size={13} /> Chat</span> },
            { value: "routines", label: <span className="flex items-center gap-1.5"><CalendarClock size={13} /> Routines</span> },
            { value: "settings", label: <span className="flex items-center gap-1.5"><Settings2 size={13} /> Settings</span> },
          ]}
        />
      </div>

      {tab === "chat" && <Chat agent={agent} onTab={setTab} />}
      {tab === "routines" && <Routines agent={agent} />}
      {tab === "settings" && <SettingsTab key={agent.id} agent={agent} />}
    </div>
  );
}

function Chat({ agent, onTab }: { agent: Agent; onTab: (t: Tab) => void }) {
  const { state } = useStore();
  const thread = state.messages.filter((m) => m.threadId === agent.id);
  const end = useRef<HTMLDivElement>(null);
  const last = thread[thread.length - 1];
  const lastSig = last ? `${last.id}:${last.text.length}:${last.steps?.filter((s) => s.state === "done").length}` : "";

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastSig]);

  const missing = agent.tools.filter((t) => !state.connected.includes(t));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[60vh] flex-col">
        {missing.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
            {agent.name} can't reach {missing.map((t) => integrationById(t)?.name).join(", ")} yet.
            <Link href="/app/integrations" className="font-medium underline">
              Connect
            </Link>
          </div>
        )}
        <div className="flex-1 space-y-6">
          {!thread.length && (
            <div className="flex flex-col items-center py-12 text-center">
              <AgentAvatar agent={agent} size={64} />
              <div className="mt-4 text-lg font-semibold">Hi, I'm {agent.name} 👋</div>
              <p className="mt-1 max-w-md text-sm text-muted">
                I'm your {agent.role.toLowerCase()}. Give me a task, or set me up with a routine so I work on schedule.
              </p>
              <Button variant="soft" size="sm" className="mt-4" onClick={() => onTab("routines")}>
                <CalendarClock size={14} /> Add a routine
              </Button>
            </div>
          )}
          {thread.map((m) =>
            m.author === "user" ? (
              <div key={m.id} className="animate-rise flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-bg">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="animate-rise flex gap-3">
                <AgentAvatar agent={agent} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline gap-2 text-sm">
                    <span className="font-semibold">{agent.name}</span>
                    <span className="text-xs text-muted">{ago(m.at)}</span>
                    {m.mode === "demo" && (
                      <Link href="/app/brains" title="No API key configured — this run used demo data">
                        <Badge>Demo</Badge>
                      </Link>
                    )}
                    {m.mode === "live" && <Badge tone="ok">Live</Badge>}
                  </div>
                  {m.steps && (m.steps.length > 0 || (!m.text && !m.error)) && <Steps steps={m.steps} />}
                  {m.text && <Rich text={m.text} />}
                  {m.error && (
                    <div className="mt-1 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                      Something went wrong: {m.error}
                    </div>
                  )}
                  {(m.approvalIds ?? (m.approvalId ? [m.approvalId] : [])).map((aid) => {
                    const a = state.approvals.find((x) => x.id === aid);
                    return a ? (
                      <div key={aid} className="mt-3">
                        <ApprovalCard approval={a} />
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            ),
          )}
          <div ref={end} />
        </div>
        <div className="sticky bottom-0 mt-8 bg-gradient-to-t from-bg from-70% to-transparent pt-6 pb-4">
          <Composer
            agent={agent}
            autoFocus
            suggestions={thread.length ? [] : starterPrompts(agent)}
          />
        </div>
      </div>

      <aside className="hidden space-y-4 lg:block">
        <About agent={agent} />
      </aside>
    </div>
  );
}

function starterPrompts(agent: Agent) {
  const r = agent.role.toLowerCase();
  if (r.includes("chief")) return ["Brief me on today", "Prep me for my next meeting", "What did I promise people this week?"];
  if (r.includes("inbox")) return ["Triage my inbox", "Draft replies to anything urgent", "Unsubscribe me from the noise"];
  if (r.includes("sales")) return ["Research new inbound leads", "Which deals are stuck?", "Draft follow-ups for stalled deals"];
  if (r.includes("engineering")) return ["Write today's standup", "What's blocked?", "Draft release notes"];
  if (r.includes("support")) return ["Triage open tickets", "Any churn-risk customers?"];
  if (r.includes("finance")) return ["How's revenue this week?", "Chase failed payments"];
  return ["What can you do for me?", "Summarise this week"];
}

function About({ agent }: { agent: Agent }) {
  const { state } = useStore();
  const routines = state.routines.filter((r) => r.agentId === agent.id);
  return (
    <>
      <Card className="p-4">
        <div className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Job</div>
        <p className="text-[13px] leading-relaxed text-fg-2">{agent.instructions || "No job description yet."}</p>
      </Card>
      <Card className="space-y-4 p-4 text-sm">
        <Row label="Brain">
          {agent.brain === "auto" ? (
            <span className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-accent" /> Auto-route
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <ProviderLogo id={agent.brain} size={16} className="rounded" /> {providerById(agent.brain).name}
            </span>
          )}
        </Row>
        <Row label="Autonomy">{AUTONOMY[agent.autonomy].label}</Row>
        <div>
          <div className="mb-2 text-xs text-muted">Tools</div>
          <div className="space-y-1.5">
            {agent.tools.map((t) => {
              const on = state.connected.includes(t);
              return (
                <div key={t} className="flex items-center gap-2">
                  <ToolLogo id={t} size={18} className="rounded" />
                  <span className={cn(!on && "text-muted")}>{integrationById(t)?.name}</span>
                  {on ? <span className="ml-auto size-1.5 rounded-full bg-ok" /> : <Badge tone="warn" className="ml-auto">Connect</Badge>}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Routines</div>
        {routines.length ? (
          routines.map((r) => (
            <div key={r.id} className="py-1.5 text-sm">
              <div className={cn("font-medium", !r.enabled && "text-muted line-through")}>{r.title}</div>
              <div className="text-xs text-muted">{r.cadence}</div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">None yet.</p>
        )}
      </Card>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function Routines({ agent }: { agent: Agent }) {
  const { state, update } = useStore();
  const [adding, setAdding] = useState(false);
  const routines = state.routines.filter((r) => r.agentId === agent.id);
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{agent.name} runs these on schedule, even when you're offline.</p>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> New routine
        </Button>
      </div>
      <Card className="divide-y divide-line">
        {routines.map((r) => (
          <div key={r.id} className="flex items-center gap-4 px-4 py-3.5">
            <CalendarClock size={16} className="text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.title}</div>
              <div className="text-xs text-muted">
                {r.cadence}
                {r.lastResult && ` · Last run: ${r.lastResult}`}
              </div>
            </div>
            <Switch
              label="Enabled"
              checked={r.enabled}
              onChange={(v) => update((s) => ({ ...s, routines: s.routines.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)) }))}
            />
          </div>
        ))}
        {!routines.length && <div className="p-6 text-center text-sm text-muted">No routines yet — add one so {agent.name} works on schedule.</div>}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title={`New routine for ${agent.name}`}>
        <div className="p-5">
          <RoutineForm agentId={agent.id} onDone={() => setAdding(false)} />
        </div>
      </Modal>
    </div>
  );
}

function SettingsTab({ agent }: { agent: Agent }) {
  const { update, toast } = useStore();
  const router = useRouter();
  const [draft, setDraft] = useState<AgentDraft>(agent);
  const dirty = JSON.stringify(pick(draft)) !== JSON.stringify(pick(agent));

  return (
    <div className="max-w-2xl">
      <Card className="p-5 sm:p-6">
        <AgentConfig draft={draft} onChange={setDraft} />
      </Card>
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="danger"
          onClick={() => {
            if (!confirm(`Let ${agent.name} go? Their routines will stop.`)) return;
            update((s) => ({
              ...s,
              agents: s.agents.filter((a) => a.id !== agent.id),
              routines: s.routines.filter((r) => r.agentId !== agent.id),
            }));
            toast(`${agent.name} has left the team`);
            router.push("/app/agents");
          }}
        >
          <Trash2 size={14} /> Let {agent.name} go
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(agent)}>
            Reset
          </Button>
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => {
              update((s) => ({ ...s, agents: s.agents.map((a) => (a.id === agent.id ? { ...a, ...pick(draft) } : a)) }));
              toast("Saved");
            }}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

const pick = (d: AgentDraft): AgentDraft => ({
  name: d.name,
  role: d.role,
  emoji: d.emoji,
  color: d.color,
  instructions: d.instructions,
  tools: d.tools,
  brain: d.brain,
  autonomy: d.autonomy,
});
