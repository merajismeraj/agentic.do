"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Actor classes ----------------------------------------------------- */

export type ActorClass = "verified_agent" | "agent" | "uncertain" | "human";

export const CLASS_META: Record<ActorClass, { label: string; short: string; color: string; blurb: string }> = {
  verified_agent: { label: "Verified agent", short: "Verified", color: "var(--viz-verified)", blurb: "Proved its identity with a Web Bot Auth signature (T2+)" },
  agent: { label: "Likely agent", short: "Agent", color: "var(--viz-agent)", blurb: "Unsigned, but behaviour says an automated actuator" },
  uncertain: { label: "Uncertain", short: "Uncertain", color: "var(--viz-uncertain)", blurb: "Not enough evidence either way" },
  human: { label: "Human", short: "Human", color: "var(--viz-human)", blurb: "Human reading and motor patterns" },
};
export const CLASS_ORDER: ActorClass[] = ["verified_agent", "agent", "uncertain", "human"];

export const TIER_META: Record<string, { name: string; blurb: string }> = {
  T0: { name: "Unknown", blurb: "No declaration; behaviour only" },
  T1: { name: "Declared", blurb: "Announces automation, or a signature we can't vouch for" },
  T2: { name: "Signed", blurb: "Valid signature from a trusted directory" },
  T3: { name: "Registered", blurb: "Signed + operator reviewed in the registry" },
  T4: { name: "Delegated", blurb: "Registered + per-task delegation from a person" },
};

export function ClassDot({ cls, className }: { cls: ActorClass; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: CLASS_META[cls].color }} />;
}

export function ClassLabel({ cls }: { cls: ActorClass }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap">
      <ClassDot cls={cls} />
      {CLASS_META[cls].short}
    </span>
  );
}

export function Legend({ counts }: { counts?: Partial<Record<ActorClass, number>> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {CLASS_ORDER.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5 text-[12px] text-fg-2" title={CLASS_META[c].blurb}>
          <ClassDot cls={c} />
          {CLASS_META[c].label}
          {counts && <span className="tabular-nums text-muted">{counts[c] ?? 0}</span>}
        </span>
      ))}
    </div>
  );
}

/* Formatting --------------------------------------------------------- */

export const pct = (x: number | null | undefined, digits = 0) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`);
export const num = (x: number) => x.toLocaleString();
export const humanize = (s: string) => s.replace(/_/g, " ");

/* KPI tile ----------------------------------------------------------- */

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className="mt-1 text-[26px] leading-8 font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[12px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

/* Daily sessions, stacked by class ------------------------------------ */

type Day = { day: string } & Record<ActorClass, number>;

export function DailyChart({ daily }: { daily: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = daily.map((d) => CLASS_ORDER.reduce((s, c) => s + d[c], 0));
  const max = Math.max(1, ...totals);
  const H = 160;
  const fmt = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const step = daily.length > 14 ? Math.ceil(daily.length / 7) : 1;
  return (
    <div>
      <div className="relative flex items-end gap-[2px] pr-7" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {/* Recessive gridlines */}
        {[0.5, 1].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: f * H }}>
            <span className="absolute -top-2 right-0 bg-surface pl-1 text-[10px] leading-none text-muted tabular-nums">{Math.round(max * f)}</span>
          </div>
        ))}
        {daily.map((d, i) => (
          <div
            key={d.day}
            className="relative flex h-full flex-1 cursor-default flex-col-reverse items-stretch justify-start"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={0}
            aria-label={`${fmt(d.day)}: ${CLASS_ORDER.map((c) => `${d[c]} ${CLASS_META[c].label}`).join(", ")}`}
          >
            {/* Verified agents sit on the baseline, humans on top (column-reverse). */}
            {CLASS_ORDER.map((c, j, arr) =>
                d[c] ? (
                  <div
                    key={c}
                    className={cn("mx-auto w-full max-w-9", j === arr.length - 1 || !arr.slice(j + 1).some((x) => d[x]) ? "rounded-t-[4px]" : "", "mt-[2px]")}
                    style={{ height: Math.max(2, (d[c] / max) * (H - 8)), background: CLASS_META[c].color, opacity: hover == null || hover === i ? 1 : 0.45 }}
                  />
                ) : null,
              )}
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-lg border border-line bg-surface p-2.5 text-[12px] shadow-pop">
                <div className="mb-1 font-medium">{fmt(d.day)}</div>
                {CLASS_ORDER.map((c) => (
                  <div key={c} className="flex items-center gap-1.5 text-fg-2">
                    <ClassDot cls={c} className="size-2" />
                    <span className="flex-1">{CLASS_META[c].label}</span>
                    <span className="tabular-nums">{d[c]}</span>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-line pt-1 text-fg">
                  <span>Total</span>
                  <span className="tabular-nums">{totals[i]}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t border-line pt-1.5 pr-7">
        {daily.map((d, i) => (
          <div key={d.day} className="flex-1 text-center text-[10px] text-muted">
            {i % step === 0 || i === daily.length - 1 ? fmt(d.day) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Horizontal magnitude bars (single hue) ------------------------------ */

export function BarList({ rows }: { rows: { key: string; label: ReactNode; value: number; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 text-[13px]" title={r.hint}>
          <div className="truncate text-fg-2">{r.label}</div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-r-[4px] rounded-l-full bg-accent" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
          </div>
          <div className="text-right tabular-nums">{num(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

/* Copy field --------------------------------------------------------- */

export function CopyField({ value, label, multiline }: { value: string; label?: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <div className="mb-1 text-[12px] font-medium text-muted">{label}</div>}
      <div className="relative">
        <pre className={cn("overflow-x-auto rounded-lg border border-line bg-surface-2 py-2 pr-10 pl-3 font-mono text-[12px] leading-relaxed", !multiline && "whitespace-nowrap")}>{value}</pre>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute top-1.5 right-1.5 rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-fg"
          aria-label="Copy"
        >
          {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}
