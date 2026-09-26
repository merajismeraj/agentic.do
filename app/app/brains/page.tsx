"use client";

import { ArrowRight, KeyRound, Plus, Sparkles, Unplug } from "lucide-react";
import { useState } from "react";
import { ConnectBrain } from "@/components/connect";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, Meter, ProviderLogo, Segmented, Switch } from "@/components/ui";
import { PROVIDERS, providerById } from "@/lib/catalog";
import { route } from "@/lib/engine";
import { useStore } from "@/lib/store";
import type { ProviderId, State } from "@/lib/types";
import { cn } from "@/lib/utils";

const MODES: { value: State["routing"]; label: string; hint: string }[] = [
  { value: "auto", label: "Balanced", hint: "Best fit for the task, weighted by remaining capacity." },
  { value: "quality", label: "Best quality", hint: "Always the strongest model for the job, until it hits its limit." },
  { value: "cost", label: "Stretch limits", hint: "Spread work across subscriptions so none run out mid-week." },
];

const SAMPLES = ["Draft a reply to Priya about the contract", "Research what competitors launched this week", "Why is the checkout PR failing?"];

export default function BrainsPage() {
  const { state, update, live } = useStore();
  const liveCount = state.brains.filter((b) => live?.providers[b.providerId]?.live).length;
  const [connecting, setConnecting] = useState<ProviderId | null>(null);
  const connected = new Set(state.brains.map((b) => b.providerId));
  const available = PROVIDERS.filter((p) => !connected.has(p.id));

  return (
    <div>
      <PageHeader
        title="AI accounts"
        subtitle="Bring every AI subscription you already pay for. Your team pools them and routes each task to the best one."
      />

      {live && (
        <Card className={cn("mb-6 flex items-start gap-3 p-4 text-sm", liveCount ? "border-ok/30 bg-ok-soft/40" : "border-warn/30 bg-warn-soft/40")}>
          <KeyRound size={16} className={cn("mt-0.5 shrink-0", liveCount ? "text-ok" : "text-warn")} />
          <div className="leading-relaxed">
            {liveCount ? (
              <>
                <span className="font-medium">{liveCount} of {state.brains.length} accounts run live.</span> The rest run in demo mode until an API key is added.
              </>
            ) : (
              <>
                <span className="font-medium">Teammates are running in demo mode.</span> Chat subscriptions can't be called by other apps, so live runs use each
                provider's API key.
              </>
            )}{" "}
            Set <code className="rounded bg-surface-2 px-1 font-mono text-xs">ANTHROPIC_API_KEY</code>,{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-xs">OPENAI_API_KEY</code>,{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-xs">GEMINI_API_KEY</code>,{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-xs">XAI_API_KEY</code>… in <code className="rounded bg-surface-2 px-1 font-mono text-xs">.env.local</code> (see{" "}
            <code className="rounded bg-surface-2 px-1 font-mono text-xs">.env.example</code>).
          </div>
        </Card>
      )}

      <Card className="mb-8 overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} className="text-accent" /> Smart routing
            </div>
            <p className="mt-1 text-sm text-muted">{MODES.find((m) => m.value === state.routing)?.hint}</p>
            <Segmented
              className="mt-4"
              value={state.routing}
              onChange={(v) => update((s) => ({ ...s, routing: v }))}
              options={MODES.map((m) => ({ value: m.value, label: m.label }))}
            />
            <div className="mt-5 flex items-center gap-3">
              <div className="flex -space-x-1.5">
                {state.brains.filter((b) => b.enabled).map((b) => (
                  <ProviderLogo key={b.providerId} id={b.providerId} size={26} className="rounded-full ring-2 ring-surface" />
                ))}
              </div>
              <span className="text-sm text-muted">
                {state.brains.filter((b) => b.enabled).length} subscriptions in your pool
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/60 p-4">
            <div className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Live preview · where would this go?</div>
            <div className="space-y-2.5">
              {SAMPLES.map((s) => {
                const d = route(state.brains, { brain: "auto" }, s, state.routing);
                return (
                  <div key={s} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-fg-2">{s}</span>
                    <ArrowRight size={13} className="shrink-0 text-muted" />
                    {d ? (
                      <span className="flex shrink-0 items-center gap-1.5 font-medium">
                        <ProviderLogo id={d.providerId} size={18} className="rounded-md" /> {providerById(d.providerId).name}
                      </span>
                    ) : (
                      <span className="text-muted">No AI connected</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <h2 className="mb-3 text-[15px] font-semibold">Connected</h2>
      <div className="mb-10 grid gap-3 md:grid-cols-2">
        {state.brains.map((b) => {
          const p = providerById(b.providerId);
          const set = (patch: Partial<typeof b>) =>
            update((s) => ({ ...s, brains: s.brains.map((x) => (x.providerId === b.providerId ? { ...x, ...patch } : x)) }));
          return (
            <Card key={b.providerId} className={cn("p-5 transition-opacity", !b.enabled && "opacity-60")}>
              <div className="flex items-start gap-3">
                <ProviderLogo id={p.id} size={40} className="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <select
                      value={b.plan}
                      onChange={(e) => set({ plan: e.target.value })}
                      className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-xs outline-none"
                    >
                      {p.plans.map((pl) => (
                        <option key={pl}>{pl}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    {live?.providers[p.id]?.live ? (
                      <>
                        <Badge tone="ok">Live</Badge> {live.providers[p.id].model}
                      </>
                    ) : (
                      <>
                        {live && <Badge>Demo</Badge>} {p.models.join(" · ")}
                      </>
                    )}
                  </div>
                </div>
                <Switch label="Use in pool" checked={b.enabled} onChange={(v) => set({ enabled: v })} />
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted">Plan limit used</span>
                  <span className={cn("font-medium tabular-nums", b.usage >= 90 && "text-danger")}>
                    {b.usage}% · resets in {b.resetsIn}
                  </span>
                </div>
                <Meter value={b.usage} />
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                {p.strengths.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
                <button
                  onClick={() => update((s) => ({ ...s, brains: s.brains.filter((x) => x.providerId !== b.providerId) }))}
                  className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-danger-soft hover:text-danger"
                >
                  <Unplug size={12} /> Disconnect
                </button>
              </div>
            </Card>
          );
        })}
        {!state.brains.length && (
          <Card className="p-6 text-sm text-muted md:col-span-2">Nothing connected yet — pick any subscription below. Most people start with the one they use daily.</Card>
        )}
      </div>

      {available.length > 0 && (
        <>
          <h2 className="mb-3 text-[15px] font-semibold">Add a subscription</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {available.map((p) => (
              <button
                key={p.id}
                onClick={() => setConnecting(p.id)}
                className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <ProviderLogo id={p.id} size={34} className="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted">{p.plans.slice(0, 2).join(", ")}</div>
                </div>
                <Plus size={16} className="text-muted group-hover:text-fg" />
              </button>
            ))}
          </div>
        </>
      )}

      <ConnectBrain id={connecting} onClose={() => setConnecting(null)} />
    </div>
  );
}
