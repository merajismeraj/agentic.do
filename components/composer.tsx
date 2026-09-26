"use client";

import { ArrowUp, AtSign } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { assign } from "@/lib/engine";
import { useStore } from "@/lib/store";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AgentAvatar, Kbd } from "./ui";

export function Composer({
  agent,
  onSent,
  placeholder,
  suggestions = [],
  autoFocus,
}: {
  /** When set, messages always go to this agent. */
  agent?: Agent;
  onSent?: (agent: Agent) => void;
  placeholder?: string;
  suggestions?: string[];
  autoFocus?: boolean;
}) {
  const { state, send } = useStore();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const mention = useMemo(() => {
    const m = text.match(/@(\w*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [text]);
  const mentionOptions = mention !== null ? state.agents.filter((a) => a.name.toLowerCase().startsWith(mention)) : [];

  const target = agent ?? (text.trim().length > 3 ? assign(state, text) : undefined);

  const submit = (value = text) => {
    const v = value.trim();
    const to = agent ?? assign(state, v);
    if (!v || !to) return;
    send(to.id, v);
    setText("");
    onSent?.(to);
  };

  const pickMention = (a: Agent) => {
    setText((t) => t.replace(/@\w*$/, `@${a.name} `));
    setMenu(null);
    ref.current?.focus();
  };

  return (
    <div>
      <div className="relative rounded-2xl border border-line bg-surface shadow-card transition-all focus-within:border-line-strong focus-within:shadow-pop">
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={text}
          rows={2}
          onChange={(e) => {
            setText(e.target.value);
            setMenu(0);
          }}
          onKeyDown={(e) => {
            if (mentionOptions.length && menu !== null) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMenu((menu + 1) % mentionOptions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMenu((menu - 1 + mentionOptions.length) % mentionOptions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pickMention(mentionOptions[menu]);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? (agent ? `Message ${agent.name}…` : "Delegate anything… e.g. “Prep me for the Northwind call”")}
          className="block max-h-60 min-h-[64px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-2 px-3 pb-2.5">
          {!agent && (
            <button
              onClick={() => {
                setText((t) => (t && !t.endsWith(" ") ? t + " @" : t + "@"));
                setMenu(0);
                ref.current?.focus();
              }}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Mention a teammate"
              title="Mention a teammate"
            >
              <AtSign size={16} />
            </button>
          )}
          {target && !agent && (
            <span className="animate-rise flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-xs text-fg-2">
              <AgentAvatar agent={target} size={18} />
              {target.name} will take this
            </span>
          )}
          <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted sm:flex">
            <Kbd>↵</Kbd> send · <Kbd>⇧↵</Kbd> newline
          </span>
          <button
            onClick={() => submit()}
            disabled={!text.trim()}
            className="ml-auto flex size-8 items-center justify-center rounded-full bg-fg sm:ml-0 text-bg transition-all hover:scale-105 disabled:bg-surface-3 disabled:text-muted"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        </div>

        {mentionOptions.length > 0 && menu !== null && (
          <div className="animate-pop absolute bottom-full left-3 z-20 mb-2 w-64 rounded-xl border border-line bg-surface p-1 shadow-pop">
            {mentionOptions.map((a, i) => (
              <button
                key={a.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(a);
                }}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", i === menu && "bg-surface-2")}
              >
                <AgentAvatar agent={a} size={22} />
                {a.name}
                <span className="ml-auto text-xs text-muted">{a.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
