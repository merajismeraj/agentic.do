"use client";

import { AlertCircle, ArrowRight, CheckCircle2, Clock, Gauge, Hand, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApprovalCard } from "@/components/approval-card";
import { Composer } from "@/components/composer";
import { lastRunOf } from "@/components/routine-row";
import { AgentAvatar, Card, Meter, ProviderLogo, ToolLogo } from "@/components/ui";
import { providerById } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { ago, clock, cn, greeting } from "@/lib/utils";

export default function Home() {
  const { state, mode, live } = useStore();
  const router = useRouter();
  const demo = mode !== "account";
  const weekAgo = Date.now() - 7 * 86_400_000;
  const doneThisWeek = state.activity.filter((a) => a.at >= weekAgo).length;
  const liveBrains = state.brains.filter((b) => b.enabled && live?.providers[b.providerId]?.live).length;
  const pending = state.approvals.filter((a) => a.status === "pending");
  const first = state.user.name.split(" ")[0];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = [...state.routines].filter((r) => r.enabled).sort((a, b) => a.nextRunMinute - b.nextRunMinute);
  const done = state.activity.length;
  const avgUsage = state.brains.length
    ? Math.round(state.brains.filter((b) => b.enabled).reduce((s, b) => s + b.usage, 0) / Math.max(1, state.brains.filter((b) => b.enabled).length))
    : 0;

  return (
    <div>
      <div className="mb-6">
        <div className="text-sm text-muted">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight sm:text-[32px]">
          {greeting()}, {first || "there"}.
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          Your team handled <span className="font-medium text-fg">{done} things</span> since yesterday.{" "}
          {pending.length ? (
            <>
              <Link href="/app/inbox" className="font-medium text-accent hover:underline">
                {pending.length} need{pending.length === 1 ? "s" : ""} you
              </Link>
              .
            </>
          ) : (
            "Nothing needs you right now."
          )}
        </p>
      </div>

      <Composer
        onSent={(a) => router.push(`/app/agents/${a.id}`)}
        suggestions={["Brief me on today", "Draft follow-ups from yesterday's calls", "What's blocked in engineering?", "Research new inbound leads"]}
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {demo ? (
          <>
            {/* Sample figures for the demo workspace. */}
            <Stat icon={<Clock size={15} />} label="Hours saved this week" value="11.5h" delta="+2.3h" />
            <Stat icon={<CheckCircle2 size={15} />} label="Tasks completed" value={String(done + 37)} delta="+18%" />
          </>
        ) : (
          <>
            <Stat icon={<CheckCircle2 size={15} />} label="Done this week" value={String(doneThisWeek)} hint="runs & actions" />
            <Stat icon={<Clock size={15} />} label="Waiting on you" value={String(pending.length)} hint={pending.length === 1 ? "approval" : "approvals"} />
          </>
        )}
        <Stat icon={<Sparkles size={15} />} label="Active teammates" value={`${state.agents.filter((a) => a.status !== "paused").length}/${state.agents.length}`} />
        {demo ? (
          <Stat icon={<Gauge size={15} />} label="AI capacity used" value={`${avgUsage}%`} hint={`across ${state.brains.length} subscriptions`} />
        ) : (
          <Stat icon={<Gauge size={15} />} label="Live AI accounts" value={`${liveBrains}/${state.brains.length}`} hint={liveBrains ? "running for real" : "add an API key"} />
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <section>
          <SectionHead title="Needs you" href="/app/inbox" count={pending.length} />
          {pending.length ? (
            <div className="space-y-3">
              {pending.slice(0, 3).map((a) => (
                <ApprovalCard key={a.id} approval={a} compact />
              ))}
              {pending.length > 3 && (
                <Link href="/app/inbox" className="block rounded-xl border border-dashed border-line-strong py-3 text-center text-sm text-muted hover:text-fg">
                  +{pending.length - 3} more waiting
                </Link>
              )}
            </div>
          ) : (
            <Card className="flex items-center gap-3 p-5 text-sm text-muted">
              <CheckCircle2 className="text-ok" size={20} /> You're all caught up. Your team will ping you when something needs a decision.
            </Card>
          )}

          <SectionHead title="Team activity" className="mt-10" />
          <Card className="divide-y divide-line">
            {state.activity.slice(0, 7).map((ev) => {
              const agent = state.agents.find((a) => a.id === ev.agentId);
              return (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-3">
                  {agent && <AgentAvatar agent={agent} size={26} />}
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{agent?.name}</span> <span className="text-fg-2">{ev.text}</span>
                  </div>
                  {ev.toolId && <ToolLogo id={ev.toolId} size={18} className="rounded" />}
                  <span className="w-14 shrink-0 text-right text-xs text-muted">{ago(ev.at)}</span>
                </div>
              );
            })}
            {!state.activity.length && <div className="p-5 text-sm text-muted">Activity from your teammates shows up here.</div>}
          </Card>
        </section>

        <aside className="space-y-8">
          <section>
            <SectionHead title="Today's schedule" href="/app/schedule" />
            <Card className="p-2">
              {today.length ? (
                today.map((r) => {
                  const agent = state.agents.find((a) => a.id === r.agentId);
                  const past = r.nextRunMinute < nowMin;
                  // Only claim a routine ran if it actually did today.
                  const last = lastRunOf(state.routineRuns, r.id);
                  const ranToday = last && (last.finishedAt ?? last.scheduledFor) >= Date.now() - nowMin * 60_000 ? last : undefined;
                  return (
                    <Link
                      key={r.id}
                      href={agent ? `/app/agents/${agent.id}` : "/app/schedule"}
                      className={cn("flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2", past && "opacity-55")}
                    >
                      <span className="w-11 font-mono text-xs text-muted tabular-nums">{clock(r.nextRunMinute)}</span>
                      {agent && <AgentAvatar agent={agent} size={22} />}
                      <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                      {ranToday?.status === "failed" ? (
                        <AlertCircle size={14} className="text-danger" aria-label="Failed" />
                      ) : ranToday?.needsApproval ? (
                        <Hand size={14} className="text-warn" aria-label="Waiting for approval" />
                      ) : ranToday ? (
                        <CheckCircle2 size={14} className="text-ok" aria-label="Done" />
                      ) : null}
                    </Link>
                  );
                })
              ) : (
                <div className="p-3 text-sm text-muted">No routines yet.</div>
              )}
            </Card>
          </section>

          <section>
            <SectionHead title={demo ? "AI capacity" : "AI accounts"} href="/app/brains" />
            {!demo ? (
              <Card className="divide-y divide-line">
                {state.brains.map((b) => {
                  const info = live?.providers[b.providerId];
                  return (
                    <Link key={b.providerId} href="/app/brains" className={cn("flex items-center gap-2 px-4 py-3 text-sm hover:bg-surface-2", !b.enabled && "opacity-40")}>
                      <ProviderLogo id={b.providerId} size={18} className="rounded-md" />
                      <span className="font-medium">{providerById(b.providerId).name}</span>
                      <span className="ml-auto text-xs">
                        {info?.live ? (
                          <span className="text-ok">Live</span>
                        ) : info && !info.liveCapable ? (
                          <span className="text-muted">No API</span>
                        ) : (
                          <span className="text-warn">Add API key</span>
                        )}
                      </span>
                    </Link>
                  );
                })}
                {!state.brains.length && (
                  <Link href="/app/brains" className="block px-4 py-3 text-sm text-accent hover:underline">
                    Connect an AI account →
                  </Link>
                )}
              </Card>
            ) : (
            <Card className="space-y-3.5 p-4">
              {state.brains.map((b) => (
                <div key={b.providerId} className={cn(!b.enabled && "opacity-40")}>
                  <div className="mb-1.5 flex items-center gap-2 text-sm">
                    <ProviderLogo id={b.providerId} size={18} className="rounded-md" />
                    <span className="font-medium">{providerById(b.providerId).name}</span>
                    <span className="text-xs text-muted">{b.plan}</span>
                    <span className="ml-auto text-xs text-muted tabular-nums">{b.usage}%</span>
                  </div>
                  <Meter value={b.usage} />
                </div>
              ))}
              {state.brains.some((b) => b.usage >= 90) && (
                <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                  {state.brains.filter((b) => b.usage >= 90).map((b) => providerById(b.providerId).name).join(", ")} is near its limit —
                  work is auto-routing to your other subscriptions.
                </p>
              )}
            </Card>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, delta, hint }: { icon: React.ReactNode; label: string; value: string; delta?: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {delta && <span className="text-xs font-medium text-ok">{delta}</span>}
        {hint && <span className="truncate text-xs text-muted">{hint}</span>}
      </div>
    </Card>
  );
}

function SectionHead({ title, href, count, className }: { title: string; href?: string; count?: number; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center gap-2", className)}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {!!count && <span className="rounded-full bg-accent-soft px-1.5 text-xs font-semibold text-accent-ink">{count}</span>}
      {href && (
        <Link href={href} className="ml-auto flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          View all <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}
