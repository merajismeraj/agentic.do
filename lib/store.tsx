"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { uid } from "./utils";

/** Client session state: who is signed in, plus toasts. */

export type Mode = "loading" | "anon" | "account";
export interface Account {
  id: string;
  email: string;
  name: string;
  emailVerified?: boolean;
  superAdmin?: boolean;
}

export interface ServerInfo {
  google: boolean;
  email: boolean;
}

interface Store {
  ready: boolean;
  mode: Mode;
  account: Account | null;
  /** What this server has set up (null until known). */
  server: ServerInfo | null;
  reload: () => Promise<Mode>;
  signOut: () => Promise<void>;
  toast: (text: string) => void;
  toasts: { id: string; text: string }[];
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  const toast = useCallback((text: string) => {
    const id = uid();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const reload = useCallback(async (): Promise<Mode> => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) {
        const me = (await r.json()) as { user: Account; server: ServerInfo };
        setAccount(me.user);
        setServer(me.server);
        setMode("account");
        return "account";
      }
      if (r.status === 401) setServer(((await r.json().catch(() => ({}))) as { server?: ServerInfo }).server ?? null);
    } catch {}
    setAccount(null);
    setMode("anon");
    return "anon";
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAccount(null);
    setMode("anon");
  }, []);

  const value = useMemo(
    () => ({ ready: mode !== "loading", mode, account, server, reload, signOut, toast, toasts }),
    [mode, account, server, reload, signOut, toast, toasts],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
