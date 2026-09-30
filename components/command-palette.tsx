"use client";

import { Activity, ArrowRight, Blocks, BrainCircuit, CalendarClock, CornerDownLeft, Home, Inbox, LibraryBig, Search, ShieldCheck, Sparkles, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { assign } from "@/lib/engine";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AgentAvatar, Kbd } from "./ui";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({ open, onClose, onHire }: { open: boolean; onClose: () => void; onHire: () => void }) {
  const { state, send } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const list: Item[] = [];
    const query = q.trim();

    if (query.length > 2) {
      const target = assign(state, query);
      if (target) {
        list.push({
          id: "ask",
          group: "Delegate",
          label: `“${query}”`,
          hint: `Assign to ${target.name}`,
          icon: <AgentAvatar agent={target} size={20} />,
          run: () => {
            send(target.id, query);
            router.push(`/app/agents/${target.id}`);
            onClose();
          },
        });
      }
    }

    const pages: Item[] = [
      { id: "analytics", group: "Go to", label: "Agent analytics", icon: <Activity size={16} />, run: go("/app/analytics") },
      { id: "registry", group: "Go to", label: "Agent registry", icon: <ShieldCheck size={16} />, run: go("/app/analytics/agents") },
      { id: "home", group: "Go to", label: "Teammates home", icon: <Home size={16} />, run: go("/app/teammates") },
      { id: "inbox", group: "Go to", label: "Approvals", icon: <Inbox size={16} />, run: go("/app/inbox") },
      { id: "team", group: "Go to", label: "Teammates", icon: <Users size={16} />, run: go("/app/agents") },
      { id: "routines", group: "Go to", label: "Routines", icon: <CalendarClock size={16} />, run: go("/app/schedule") },
      { id: "brains", group: "Go to", label: "AI accounts", icon: <BrainCircuit size={16} />, run: go("/app/brains") },
      { id: "integrations", group: "Go to", label: "Integrations", icon: <Blocks size={16} />, run: go("/app/integrations") },
      { id: "memory", group: "Go to", label: "Context & memory", icon: <LibraryBig size={16} />, run: go("/app/memory") },
    ];
    const actions: Item[] = [
      { id: "hire", group: "Actions", label: "Hire a teammate", icon: <UserPlus size={16} />, run: () => { onClose(); onHire(); } },
      { id: "connect-ai", group: "Actions", label: "Connect another AI subscription", icon: <Sparkles size={16} />, run: go("/app/brains") },
    ];
    const agents: Item[] = state.agents.map((a) => ({
      id: a.id,
      group: "Teammates",
      label: a.name,
      hint: a.role,
      icon: <AgentAvatar agent={a} size={20} />,
      run: go(`/app/agents/${a.id}`),
    }));

    const match = (i: Item) => !query || `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return [...list, ...[...actions, ...agents, ...pages].filter(match)];
  }, [q, state, router, onClose, onHire, send]);

  useEffect(() => setIdx(0), [q]);

  if (!open) return null;

  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-pop relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(items.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter") items[idx]?.run();
            }}
            placeholder="Type a command, or describe work to delegate…"
            className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[50vh] overflow-auto p-2">
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <div className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{g}</div>
              {items
                .filter((i) => i.group === g)
                .map((i) => {
                  const n = items.indexOf(i);
                  return (
                    <button
                      key={i.id}
                      onMouseMove={() => setIdx(n)}
                      onClick={i.run}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm",
                        n === idx ? "bg-surface-2 text-fg" : "text-fg-2",
                      )}
                    >
                      <span className="flex size-5 items-center justify-center text-muted">{i.icon}</span>
                      <span className="truncate">{i.label}</span>
                      {i.hint && <span className="ml-auto shrink-0 text-xs text-muted">{i.hint}</span>}
                      {n === idx && (i.id === "ask" ? <CornerDownLeft size={14} className="text-muted" /> : <ArrowRight size={14} className="text-muted" />)}
                    </button>
                  );
                })}
            </div>
          ))}
          {!items.length && <div className="px-3 py-8 text-center text-sm text-muted">No matches. Try describing a task instead.</div>}
        </div>
      </div>
    </div>
  );
}
