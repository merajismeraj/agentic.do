"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { plan } from "./engine";
import { EMPTY } from "./seed";
import type { Agent, Approval, State } from "./types";
import { uid } from "./utils";

const KEY = "agentic.do:v1";

type Updater = (s: State) => State;

interface Store {
  state: State;
  ready: boolean;
  update: (fn: Updater) => void;
  replace: (s: State) => void;
  reset: () => void;
  send: (agentId: string, text: string) => void;
  decide: (approvalId: string, decision: "approved" | "rejected", edited?: Approval["preview"]) => void;
  toast: (text: string) => void;
  toasts: { id: string; text: string }[];
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);

  const update = useCallback((fn: Updater) => setState((s) => fn(s)), []);

  const toast = useCallback((text: string) => {
    const id = uid();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const send = useCallback((agentId: string, text: string) => {
    const s = stateRef.current;
    const agent = s.agents.find((a) => a.id === agentId);
    if (!agent) return;
    const p = plan(s, agent, text, agentId);
    const replyId = uid();
    const now = Date.now();

    setState((st) => ({
      ...st,
      agents: st.agents.map((a) => (a.id === agentId ? { ...a, status: "working" } : a)),
      messages: [
        ...st.messages,
        { id: uid(), threadId: agentId, author: "user", text, at: now },
        { id: replyId, threadId: agentId, author: "agent", agentId, text: "", at: now + 1, steps: p.steps },
      ],
    }));

    const patchReply = (fn: (m: State["messages"][number]) => State["messages"][number]) =>
      setState((st) => ({ ...st, messages: st.messages.map((m) => (m.id === replyId ? fn(m) : m)) }));

    // Walk through the steps so the user can watch the agent work.
    let t = 350;
    p.steps.forEach((step, i) => {
      setTimeout(() => {
        patchReply((m) => ({
          ...m,
          steps: m.steps?.map((x, j) => (j < i ? { ...x, state: "done" } : j === i ? { ...x, state: "running" } : x)),
        }));
      }, t);
      t += step.kind === "tool" ? 900 : 650;
    });

    setTimeout(() => {
      const approvalId = p.approval ? uid() : undefined;
      setState((st) => ({
        ...st,
        agents: st.agents.map((a) => (a.id === agentId ? { ...a, status: "idle" } : a)),
        approvals: p.approval
          ? [{ ...p.approval, id: approvalId!, status: "pending", at: Date.now() }, ...st.approvals]
          : st.approvals,
        activity: [
          {
            id: uid(),
            agentId,
            text: p.approval ? `Prepared “${p.approval.title}” for approval` : `Completed: ${text.slice(0, 60)}`,
            toolId: p.steps.find((x) => x.toolId)?.toolId,
            at: Date.now(),
          },
          ...st.activity,
        ].slice(0, 50),
        messages: st.messages.map((m) =>
          m.id === replyId
            ? { ...m, text: p.finalText, approvalId, steps: m.steps?.map((x) => ({ ...x, state: "done" })) }
            : m,
        ),
      }));
      if (p.approval) toast(`${agent.name} needs your approval`);
    }, t + 300);
  }, [toast]);

  const decide = useCallback<Store["decide"]>((id, decision, edited) => {
    const s = stateRef.current;
    const a = s.approvals.find((x) => x.id === id);
    if (!a) return;
    const agent = s.agents.find((x) => x.id === a.agentId) as Agent | undefined;
    setState((st) => ({
      ...st,
      approvals: st.approvals.map((x) => (x.id === id ? { ...x, status: decision, preview: edited ?? x.preview } : x)),
      activity: [
        {
          id: uid(),
          agentId: a.agentId,
          toolId: a.toolId,
          text: decision === "approved" ? `Done: ${a.title}` : `Discarded: ${a.title}`,
          at: Date.now(),
        },
        ...st.activity,
      ],
    }));
    toast(decision === "approved" ? `✓ ${agent?.name ?? "Agent"} is on it` : "Discarded — agent will learn from this");
  }, [toast]);

  const value = useMemo<Store>(
    () => ({
      state,
      ready,
      update,
      replace: setState,
      reset: () => setState(EMPTY),
      send,
      decide,
      toast,
      toasts,
    }),
    [state, ready, update, send, decide, toast, toasts],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
