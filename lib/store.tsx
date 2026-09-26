"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { demoState, EMPTY } from "./seed";
import type { Activity, Agent, Approval, LiveStatus, Message, RunEvent, RunRequest, State } from "./types";
import { uid } from "./utils";

/**
 * Client store. Three modes:
 * - "account": signed in; the workspace lives on the server. Edits sync with
 *   optimistic versioning, runs and approvals go through the API.
 * - "demo": no account; a sample workspace kept in this browser, always simulated.
 * - "anon": signed out with no demo.
 */

const DEMO_KEY = "agentic.do:demo";
const DOC_KEYS = ["user", "brains", "routing", "connected", "agents", "routines", "memory"] as const;

export type Mode = "loading" | "anon" | "demo" | "account";
export type SyncState = "saved" | "saving" | "offline";
type Updater = (s: State) => State;
interface Account {
  id: string;
  email: string;
  name: string;
}

interface Store {
  state: State;
  ready: boolean;
  mode: Mode;
  account: Account | null;
  sync: SyncState;
  update: (fn: Updater) => void;
  startDemo: () => void;
  finishOnboarding: (s: State) => Promise<boolean>;
  reload: () => Promise<Mode>;
  signOut: () => Promise<void>;
  send: (agentId: string, text: string) => void;
  decide: (approvalId: string, decision: "approved" | "rejected", edited?: Approval["preview"]) => void;
  toast: (text: string) => void;
  toasts: { id: string; text: string }[];
  live: LiveStatus | null;
  refreshLive: () => Promise<LiveStatus | null>;
}

const Ctx = createContext<Store | null>(null);

/** The server-owned document: never persist transient run state. */
function docOf(s: State) {
  const doc = Object.fromEntries(DOC_KEYS.map((k) => [k, s[k]])) as Pick<State, (typeof DOC_KEYS)[number]>;
  return { ...doc, agents: doc.agents.map((a) => (a.status === "working" ? { ...a, status: "idle" as const } : a)) };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [mode, setMode] = useState<Mode>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [sync, setSync] = useState<SyncState>("saved");
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [live, setLive] = useState<LiveStatus | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const version = useRef<number | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);
  const dirty = useRef(false);

  const toast = useCallback((text: string) => {
    const id = uid();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) return null;
      const next = (await r.json()) as LiveStatus;
      setLive(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  /* ------------------------------ Loading --------------------------- */

  const reload = useCallback(async (): Promise<Mode> => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) {
        const me = (await r.json()) as {
          user: Account;
          workspace: { doc: Partial<State>; version: number } | null;
          messages?: Message[];
          approvals?: Approval[];
          activity?: Activity[];
        };
        setAccount(me.user);
        version.current = me.workspace?.version ?? null;
        setState(
          me.workspace
            ? { ...EMPTY, ...me.workspace.doc, onboarded: true, messages: me.messages ?? [], approvals: me.approvals ?? [], activity: me.activity ?? [] }
            : { ...EMPTY, user: { ...EMPTY.user, name: me.user.name } },
        );
        setMode("account");
        refreshLive();
        return "account";
      }
    } catch {}
    setAccount(null);
    version.current = null;
    let demo: State | null = null;
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) demo = { ...EMPTY, ...JSON.parse(raw) };
    } catch {}
    setState(demo ?? EMPTY);
    const next: Mode = demo?.onboarded ? "demo" : "anon";
    setMode(next);
    refreshLive();
    return next;
  }, [refreshLive]);

  useEffect(() => {
    reload();
  }, [reload]);

  /* ------------------------------ Persistence ----------------------- */

  const pushDoc = useCallback(async () => {
    if (syncing.current) {
      dirty.current = true;
      return;
    }
    syncing.current = true;
    dirty.current = false;
    setSync("saving");
    try {
      const res = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: docOf(stateRef.current), baseVersion: version.current }),
      });
      if (res.status === 409) {
        // Someone else (another tab) saved first: take theirs so nothing diverges silently.
        const cur = (await res.json()) as { doc: Partial<State>; version: number };
        version.current = cur.version;
        setState((s) => ({ ...s, ...cur.doc }));
        toast("This workspace changed in another tab — showing the latest version");
      } else if (res.ok) {
        version.current = ((await res.json()) as { version: number }).version;
      } else if (res.status === 401) {
        toast("Your session ended — sign in again");
        setMode("anon");
      } else throw new Error(String(res.status));
      setSync("saved");
    } catch {
      setSync("offline");
      dirty.current = true;
    } finally {
      syncing.current = false;
      if (dirty.current) syncTimer.current = setTimeout(pushDoc, 2000);
      else syncTimer.current = null;
    }
  }, [toast]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSync("saving");
    syncTimer.current = setTimeout(pushDoc, 500);
  }, [pushDoc]);

  // Flush a pending save when the tab closes.
  useEffect(() => {
    const flush = () => {
      if (modeRef.current !== "account" || !syncTimer.current) return;
      fetch("/api/workspace", {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: docOf(stateRef.current), baseVersion: version.current }),
      });
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    if (mode !== "demo") return;
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(state));
    } catch {}
  }, [state, mode]);

  const update = useCallback(
    (fn: Updater) => {
      setState((s) => fn(s));
      if (modeRef.current === "account") scheduleSync();
    },
    [scheduleSync],
  );

  const startDemo = useCallback(() => {
    const d = demoState();
    setState(d);
    setMode("demo");
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(d));
    } catch {}
  }, []);

  const finishOnboarding = useCallback(
    async (next: State) => {
      const res = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: docOf(next), baseVersion: null, init: { messages: next.messages } }),
      });
      if (!res.ok) {
        toast(res.status === 409 ? "You already have a workspace" : "Couldn't save your workspace — try again");
        if (res.status === 409) await reload();
        return false;
      }
      version.current = ((await res.json()) as { version: number }).version;
      setState(next);
      try {
        localStorage.removeItem(DEMO_KEY);
      } catch {}
      return true;
    },
    [toast, reload],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    try {
      localStorage.removeItem(DEMO_KEY);
    } catch {}
    setAccount(null);
    version.current = null;
    setState(EMPTY);
    setMode("anon");
    refreshLive();
  }, [refreshLive]);

  /* ------------------------------ Runs ------------------------------ */

  const send = useCallback(
    (agentId: string, text: string) => {
      const s = stateRef.current;
      const agent = s.agents.find((a) => a.id === agentId);
      if (!agent) return;
      const userId = uid();
      const replyId = uid();
      const now = Date.now();

      // Transient UI state only (not synced): the run itself is persisted server-side.
      setState((st) => ({
        ...st,
        agents: st.agents.map((a) => (a.id === agentId ? { ...a, status: "working" } : a)),
        messages: [
          ...st.messages,
          { id: userId, threadId: agentId, author: "user", text, at: now },
          { id: replyId, threadId: agentId, author: "agent", agentId, text: "", at: now + 1, steps: [] },
        ],
      }));

      const patchReply = (fn: (m: Message) => Message) =>
        setState((st) => ({ ...st, messages: st.messages.map((m) => (m.id === replyId ? fn(m) : m)) }));

      const approvals: Approval[] = [];
      let finalText = "";
      let failed = false;

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
          failed = true;
          patchReply((m) => ({ ...m, error: e.message, steps: m.steps?.map((x) => ({ ...x, state: "done" })) }));
        }
      };

      const demo: RunRequest | undefined =
        modeRef.current === "demo"
          ? {
              agent,
              text,
              threadId: agentId,
              history: s.messages
                .filter((m) => m.threadId === agentId && m.text)
                .map((m) => ({ role: m.author === "user" ? ("user" as const) : ("assistant" as const), text: m.text })),
              brains: s.brains,
              routing: s.routing,
              connected: s.connected,
              memory: s.memory,
              user: s.user,
            }
          : undefined;

      (async () => {
        try {
          const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(demo ? { demo } : { agentId, text, messageId: userId, replyId }),
          });
          if (!res.ok || !res.body) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error ?? `Run failed (${res.status})`);
          }
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
                text: approvals.length ? `Prepared “${approvals[0].title}” for approval` : failed ? `Couldn't finish: ${text.slice(0, 50)}` : `Completed: ${text.slice(0, 60)}`,
                toolId: approvals[0]?.toolId,
                at: Date.now(),
              },
              ...st.activity,
            ].slice(0, 50),
          }));
          if (approvals.length) toast(`${agent.name} needs your approval`);
          else if (finalText && !failed) toast(`${agent.name} finished`);
        }
      })();
    },
    [toast],
  );

  /* ------------------------------ Approvals ------------------------- */

  const decide = useCallback<Store["decide"]>(
    (id, decision, edited) => {
      const s = stateRef.current;
      const a = s.approvals.find((x) => x.id === id);
      if (!a || a.status !== "pending") return;
      const agent = s.agents.find((x) => x.id === a.agentId) as Agent | undefined;
      const patch = (p: Partial<Approval>) => setState((st) => ({ ...st, approvals: st.approvals.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
      const log = (text: string) =>
        setState((st) => ({ ...st, activity: [{ id: uid(), agentId: a.agentId, toolId: a.toolId, text, at: Date.now() }, ...st.activity] }));

      patch({ status: decision, preview: edited ?? a.preview });

      if (modeRef.current !== "account") {
        log(decision === "approved" ? `Done: ${a.title}` : `Discarded: ${a.title}`);
        toast(decision === "approved" ? `✓ ${agent?.name ?? "Agent"} is on it (demo)` : "Discarded");
        return;
      }

      (async () => {
        try {
          const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision, edits: edited }),
          });
          const r = (await res.json()) as { status?: Approval["status"]; ok?: boolean; result?: string; preview?: Approval["preview"]; error?: string };
          if (res.status === 409 || res.status === 404) {
            toast(r.error ?? "Already handled");
            return;
          }
          if (decision === "rejected") {
            log(`Discarded: ${a.title}`);
            toast("Discarded");
            return;
          }
          patch({ result: r.result ?? r.error, preview: r.preview ?? edited ?? a.preview });
          log(r.result ?? `Done: ${a.title}`);
          toast(r.ok ? `✓ ${r.result}` : `Couldn't complete: ${r.result ?? r.error}`);
        } catch (err) {
          patch({ status: "pending" });
          toast(`Couldn't reach the server: ${(err as Error).message}`);
        }
      })();
    },
    [toast],
  );

  const value = useMemo<Store>(
    () => ({
      state,
      ready: mode !== "loading",
      mode,
      account,
      sync,
      update,
      startDemo,
      finishOnboarding,
      reload,
      signOut,
      send,
      decide,
      toast,
      toasts,
      live,
      refreshLive,
    }),
    [state, mode, account, sync, update, startDemo, finishOnboarding, reload, signOut, send, decide, toast, toasts, live, refreshLive],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
