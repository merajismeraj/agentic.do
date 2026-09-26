"use client";

import { Check, Sparkles } from "lucide-react";
import { AUTONOMY, INTEGRATIONS, providerById } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { Agent, Autonomy } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProviderLogo, ToolLogo } from "./ui";

export type AgentDraft = Pick<Agent, "name" | "role" | "emoji" | "color" | "instructions" | "tools" | "brain" | "autonomy">;

const EMOJIS = ["🧭", "📥", "🎯", "🛠️", "💬", "📊", "🧲", "🔭", "🦉", "⚡️", "🌱", "🧠"];

export function AgentConfig({ draft, onChange }: { draft: AgentDraft; onChange: (d: AgentDraft) => void }) {
  const { state } = useStore();
  const set = <K extends keyof AgentDraft>(k: K, v: AgentDraft[K]) => onChange({ ...draft, [k]: v });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
        <Field label="Avatar">
          <div className="flex flex-wrap gap-1 sm:w-28">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => set("emoji", e)}
                className={cn("size-8 rounded-lg text-base hover:bg-surface-2", draft.emoji === e && "bg-accent-soft ring-1 ring-accent")}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Name">
          <input className={input} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ava" />
        </Field>
        <Field label="Role">
          <input className={input} value={draft.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Chief of Staff" />
        </Field>
      </div>

      <Field label="Job description" hint="Plain English. What should they own, how often, and what's off-limits?">
        <textarea
          className={cn(input, "min-h-28 resize-y py-2 leading-relaxed")}
          value={draft.instructions}
          onChange={(e) => set("instructions", e.target.value)}
        />
      </Field>

      <Field label="Tools they can use" hint="Unconnected tools will prompt a one-click connect.">
        <div className="flex flex-wrap gap-1.5">
          {INTEGRATIONS.map((i) => {
            const on = draft.tools.includes(i.id);
            const connected = state.connected.includes(i.id);
            return (
              <button
                key={i.id}
                onClick={() => set("tools", on ? draft.tools.filter((t) => t !== i.id) : [...draft.tools, i.id])}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[13px] transition-colors",
                  on ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-2 hover:border-line-strong",
                )}
                title={connected ? "Connected" : "Not connected yet"}
              >
                <ToolLogo id={i.id} size={18} className="rounded-full" />
                {i.name}
                {on && !connected && <span className="size-1.5 rounded-full bg-warn" />}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Brain" hint="Auto picks the best of your subscriptions for each task and fails over when one hits its limit.">
        <div className="flex flex-wrap gap-1.5">
          <BrainChip active={draft.brain === "auto"} onClick={() => set("brain", "auto")}>
            <span className="flex size-[18px] items-center justify-center rounded-full bg-accent text-white">
              <Sparkles size={11} />
            </span>
            Auto-route
          </BrainChip>
          {state.brains.map((b) => (
            <BrainChip key={b.providerId} active={draft.brain === b.providerId} onClick={() => set("brain", b.providerId)}>
              <ProviderLogo id={b.providerId} size={18} className="rounded-full" />
              {providerById(b.providerId).name}
            </BrainChip>
          ))}
        </div>
      </Field>

      <Field label="Autonomy">
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(AUTONOMY) as Autonomy[]).map((k) => (
            <button
              key={k}
              onClick={() => set("autonomy", k)}
              className={cn(
                "relative rounded-xl border p-3 text-left transition-colors",
                draft.autonomy === k ? "border-accent bg-accent-soft/60" : "border-line hover:border-line-strong",
              )}
            >
              {draft.autonomy === k && <Check size={14} className="absolute top-3 right-3 text-accent" />}
              <div className="text-sm font-medium">{AUTONOMY[k].label}</div>
              <div className="mt-0.5 text-xs leading-snug text-muted">{AUTONOMY[k].hint}</div>
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function BrainChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[13px] transition-colors",
        active ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-2 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

export const input =
  "w-full rounded-lg border border-line bg-surface px-3 h-9 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/15";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[13px] font-medium">{label}</div>
      {children}
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </label>
  );
}
