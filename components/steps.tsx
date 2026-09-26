"use client";

import { Brain, Check, Hand, Loader2, Route } from "lucide-react";
import { useState } from "react";
import type { Step } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProviderLogo, ToolLogo } from "./ui";

/** Collapsible trace of what the agent did — transparency builds trust. */
export function Steps({ steps }: { steps: Step[] }) {
  const running = steps.some((s) => s.state !== "done");
  const [open, setOpen] = useState(false);
  const show = running || open;
  const current = steps.find((s) => s.state === "running");

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[12px] text-muted hover:text-fg"
        disabled={running}
      >
        {running ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            <span className="shimmer-text font-medium">{current?.label ?? "Starting"}…</span>
          </>
        ) : (
          <>
            <span className="flex -space-x-1">
              {steps
                .filter((s) => s.toolId || s.providerId)
                .slice(0, 5)
                .map((s) =>
                  s.providerId ? (
                    <ProviderLogo key={s.id} id={s.providerId} size={16} className="rounded-full ring-2 ring-surface" />
                  ) : (
                    <ToolLogo key={s.id} id={s.toolId!} size={16} className="rounded-full ring-2 ring-surface" />
                  ),
                )}
            </span>
            {steps.length} steps · {open ? "hide" : "show"} work
          </>
        )}
      </button>
      {show && (
        <ol className="mt-2 ml-1.5 space-y-0 border-l border-line pl-4">
          {steps.map((s) => (
            <li key={s.id} className={cn("relative py-1 text-[13px]", s.state === "pending" && "opacity-40")}>
              <span className="absolute top-1.5 -left-[25px] flex size-[17px] items-center justify-center rounded-full border border-line bg-surface">
                {s.state === "running" ? (
                  <Loader2 size={10} className="animate-spin text-accent" />
                ) : s.state === "done" ? (
                  <Icon step={s} />
                ) : (
                  <span className="size-1 rounded-full bg-muted" />
                )}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-fg-2">
                {s.toolId && <ToolLogo id={s.toolId} size={14} className="rounded" />}
                {s.providerId && <ProviderLogo id={s.providerId} size={14} className="rounded" />}
                {s.label}
              </span>
              {s.detail && s.state === "done" && <span className="text-xs text-muted">{s.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Icon({ step }: { step: Step }) {
  const cls = "text-muted";
  if (step.kind === "route") return <Route size={10} className={cls} />;
  if (step.kind === "think") return <Brain size={10} className={cls} />;
  if (step.kind === "approval") return <Hand size={10} className="text-warn" />;
  return <Check size={10} className="text-ok" />;
}
