"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EMPTY } from "./seed";
import type { Agent, Approval, LiveStatus, Message, RunEvent, RunRequest, State } from "./types";
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
  live: LiveStatus | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [live, setLive] = useState<LiveStatus | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setLive(j as LiveStatus))
      .catch(() => {});
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

  const send = useCallback(
    (agentId: string, text: string) => {
      const s = stateRef.current;
      const agent = s.agents.find((a) => a.id === agentId);
      if (!agent) return;
      const replyId = uid();
      const now = Date.now();
      const history = s.messages
        .filter((m) => m.threadId === agentId && m.text)
        .map((m) => ({ role: m.author === "user" ? ("user" as const) : ("assistant" as const), text: m.text }));

      setState((st) => ({
        ...st,
        agents: st.agents.map((a) => (a.id === agentId ? { ...a, status: "working" } : a)),
        messages: [
          ...st.messages,
          { id: uid(), threadId: agentId, author: "user", text, at: now },
          { id: replyId, threadId: agentId, author: "agent", agentId, text: "", at: now + 1, steps: [] },
        ],
      }));

      const patchReply = (fn: (m: Message) => Message) =>
        setState((st) => ({ ...st, messages: st.messages.map((m) => (m.id === replyId ? fn(m) : m)) }));

      const approvals: Approval[] = [];
      let finalText = "";

      const onEvent = (e: RunEvent) => {
        if (e.t === "step") {
          patchReply((m) => {
            const steps = m.steps ?? [];
            const i = steps.findIndex((x) => x.id === e.step.id);
            // Anything still spinning before a new step has finished.
            const settled = steps.map((x) => (x.kind !== "think" && x.state === "running" && x.id !== e.step.id ? { ...x, state: "done" as const } : x));
            return { ...m, steps: i === -1 ? [...settled, e.step] : settled.map((x, j) => (j === i ? e.step : x)) };
          });
        } else if (e.t === "approval") {
          approvals.push(e.approval);
          setState((st) => ({ ...st, approvals: [e.approval, ...st.approvals] }));
          patchReply((m) => ({ ...m, approvalId: m.approvalId ?? e.approval.id, approvalIds: [...(m.approvalIds ?? []), e.approval.id] }));
        } else if (e.t === "text") {
          finalText = e.text;
          patchReply((m) => ({ ...m, text: e.text }));
        } else if (e.t === "done") {
          patchReply((m) => ({ ...m, mode: e.mode, steps: m.steps?.map((x) => ({ ...x, state: "done" })) }));
        } else if (e.t === "error") {
          patchReply((m) => ({ ...m, error: e.message, steps: m.steps?.map((x) => ({ ...x, state: "done" })) }));
        }
      };

      const body: RunRequest = {
        agent,
        text,
        threadId: agentId,
        history,
        brains: s.brains,
        routing: s.routing,
        connected: s.connected,
        memory: s.memory,
        user: s.user,
      };

      (async () => {
        try {
          const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (!res.ok || !res.body) throw new Error(`Run failed (${res.status})`);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (line) onEvent(JSON.parse(line) as RunEvent);
            }
          }
        } catch (err) {
          onEvent({ t: "error", message: (err as Error).message });
        } finally {
          setState((st) => ({
            ...st,
            agents: st.agents.map((a) => (a.id === agentId ? { ...a, status: a.status === "working" ? "idle" : a.status } : a)),
            activity: [
              {
                id: uid(),
                agentId,
                text: approvals.length ? `Prepared “${approvals[0].title}” for approval` : `Completed: ${text.slice(0, 60)}`,
                toolId: approvals[0]?.toolId,
                at: Date.now(),
              },
              ...st.activity,
            ].slice(0, 50),
          }));
          if (approvals.length) toast(`${agent.name} needs your approval`);
          else if (finalText) toast(`${agent.name} finished`);
        }
      })();
    },
    [toast],
  );

  const decide = useCallback<Store["decide"]>(
    (id, decision, edited) => {
      const s = stateRef.current;
      const a = s.approvals.find((x) => x.id === id);
      if (!a) return;
      const agent = s.agents.find((x) => x.id === a.agentId) as Agent | undefined;
      const log = (text: string) =>
        setState((st) => ({ ...st, activity: [{ id: uid(), agentId: a.agentId, toolId: a.toolId, text, at: Date.now() }, ...st.activity] }));

      setState((st) => ({
        ...st,
        approvals: st.approvals.map((x) => (x.id === id ? { ...x, status: decision, preview: edited ?? x.preview } : x)),
      }));

      if (decision === "rejected") {
        log(`Discarded: ${a.title}`);
        toast("Discarded");
        return;
      }
      if (!a.call) {
        log(`Done: ${a.title}`);
        toast(`✓ ${agent?.name ?? "Agent"} is on it`);
        return;
      }

      // Apply edits made on the card to the tool input, matching fields by label.
      const input = { ...a.call.input };
      for (const f of edited ?? []) {
        const key = Object.keys(input).find((k) => k.toLowerCase() === f.label.toLowerCase() || (f.label === "Message" && k === "text") || (f.label === "Comment" && k === "body"));
        if (key && typeof input[key] === "string") input[key] = f.value;
      }

      (async () => {
        try {
          const res = await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: a.call!.tool, input }) });
          const r = (await res.json()) as { ok: boolean; live?: boolean; summary: string };
          setState((st) => ({ ...st, approvals: st.approvals.map((x) => (x.id === id ? { ...x, result: r.summary } : x)) }));
          log(r.ok ? r.summary : `Failed: ${r.summary}`);
          toast(r.ok ? `✓ ${r.summary}` : `Couldn't complete: ${r.summary}`);
        } catch (err) {
          toast(`Couldn't complete: ${(err as Error).message}`);
        }
      })();
    },
    [toast],
  );

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
      live,
    }),
    [state, ready, update, send, decide, toast, toasts, live],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
