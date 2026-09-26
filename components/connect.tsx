"use client";

import { Check, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { integrationById, providerById } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { input } from "./agent-config";
import { Button, Modal, ProviderLogo, ToolLogo } from "./ui";

/** Simulated sign-in for an AI subscription. */
export function ConnectBrain({ id, onClose }: { id: ProviderId | null; onClose: () => void }) {
  const { update, toast } = useStore();
  const [plan, setPlan] = useState("");
  const [method, setMethod] = useState<"oauth" | "key">("oauth");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const p = id ? providerById(id) : null;

  useEffect(() => {
    if (p) {
      setPlan(p.plans[0]);
      setMethod(p.id === "deepseek" ? "key" : "oauth");
      setKey("");
      setBusy(false);
    }
  }, [p]);

  if (!p) return null;

  const connect = () => {
    setBusy(true);
    setTimeout(() => {
      update((s) => ({
        ...s,
        brains: [
          ...s.brains.filter((b) => b.providerId !== p.id),
          { providerId: p.id, plan, usage: Math.floor(Math.random() * 20), resetsIn: "5d", enabled: true, connectedAt: Date.now() },
        ],
      }));
      toast(`${p.name} ${plan} connected`);
      onClose();
    }, 1100);
  };

  return (
    <Modal open onClose={onClose} className="sm:max-w-md">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <ProviderLogo id={p.id} size={44} className="rounded-xl" />
          <div>
            <div className="text-lg font-semibold">Connect {p.name}</div>
            <div className="text-sm text-muted">Use the {p.vendor} plan you already pay for.</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-1.5 text-[13px] font-medium">Your plan</div>
          <div className="flex flex-wrap gap-1.5">
            {p.plans.map((pl) => (
              <button
                key={pl}
                onClick={() => setPlan(pl)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[13px]",
                  plan === pl ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-fg-2 hover:border-line-strong",
                )}
              >
                {pl}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <MethodCard active={method === "oauth"} onClick={() => setMethod("oauth")} icon={<ShieldCheck size={16} />} title="Sign in" body={`Log in with ${p.vendor}`} disabled={p.id === "deepseek"} />
          <MethodCard active={method === "key"} onClick={() => setMethod("key")} icon={<KeyRound size={16} />} title="API key" body="Paste a key" />
        </div>
        {method === "key" && (
          <input autoFocus className={cn(input, "mt-3 font-mono")} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" type="password" />
        )}

        <div className="mt-5 flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <Lock size={14} className="mt-0.5 shrink-0" />
          Credentials are encrypted at rest and only used to run your teammates. Nothing is used for training. Disconnect any time.
        </div>

        <Button variant="primary" size="lg" className="mt-5 w-full" onClick={connect} disabled={busy || (method === "key" && key.length < 8)}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Connecting…
            </>
          ) : method === "oauth" ? (
            `Continue with ${p.vendor}`
          ) : (
            "Connect"
          )}
        </Button>
      </div>
    </Modal>
  );
}

function MethodCard({ active, onClick, icon, title, body, disabled }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors disabled:opacity-40",
        active ? "border-accent bg-accent-soft/60" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {icon} {title}
      </div>
      <div className="mt-0.5 text-xs text-muted">{body}</div>
    </button>
  );
}

const GOOGLE_TOOLS = ["gmail", "gcal"];

/** OAuth consent for a work tool: real Google sign-in when configured, simulated otherwise. */
export function ConnectTool({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { update, toast, live, mode } = useStore();
  const [busy, setBusy] = useState(false);
  const i = id ? integrationById(id) : null;
  useEffect(() => setBusy(false), [id]);
  if (!i) return null;

  const isGoogle = GOOGLE_TOOLS.includes(i.id);
  const realGoogle = isGoogle && mode === "account" && !!live?.google.configured;

  const connect = () => {
    setBusy(true);
    if (realGoogle) {
      // Full-page redirect to Google's consent screen; we land back on this page.
      window.location.href = `/api/auth/google/start?purpose=connect&return=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setTimeout(() => {
      update((s) => ({ ...s, connected: [...new Set([...s.connected, i.id])] }));
      toast(`${i.name} connected`);
      onClose();
    }, 900);
  };

  return (
    <Modal open onClose={onClose} className="sm:max-w-md">
      <div className="p-6">
        <div className="flex items-center justify-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-fg text-bg">
            <Check size={22} strokeWidth={3} />
          </span>
          <span className="flex gap-1">
            {[0, 1, 2].map((n) => (
              <span key={n} className="size-1 rounded-full bg-line-strong" />
            ))}
          </span>
          <ToolLogo id={i.id} size={48} className="rounded-xl" />
        </div>
        <div className="mt-5 text-center">
          <div className="text-lg font-semibold">Connect {i.name}</div>
          <div className="mt-1 text-sm text-muted">{i.blurb}</div>
        </div>
        <div className="mt-6 rounded-xl border border-line">
          <div className="border-b border-line px-4 py-2.5 text-xs font-medium text-muted">Your teammates will be able to</div>
          {i.scopes.map((s) => (
            <div key={s} className="flex items-center gap-2 px-4 py-2 text-sm">
              <Check size={14} className="text-ok" /> {s}
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">Anything that leaves your company still waits for your approval.</p>
        {isGoogle && (
          <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-center text-xs leading-relaxed text-muted">
            {realGoogle
              ? "One Google sign-in connects both Gmail and Calendar. Tokens are encrypted and stored with your workspace, so routines can run while you're away."
              : mode !== "account"
                ? "This is the demo, so Gmail connects with sample data. Create an account to connect your real Google."
                : "Google sign-in isn't configured on this server, so this connects with demo data. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET to go live."}
          </p>
        )}
        <Button variant="primary" size="lg" className="mt-5 w-full" onClick={connect} disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Authorizing…
            </>
          ) : realGoogle ? (
            "Continue with Google"
          ) : (
            `Authorize ${i.name}`
          )}
        </Button>
      </div>
    </Modal>
  );
}
