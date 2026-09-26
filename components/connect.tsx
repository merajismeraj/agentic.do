"use client";

import { Check, ExternalLink, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { integrationById, providerById } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { input } from "./agent-config";
import { Button, Modal, ProviderLogo, ToolLogo } from "./ui";

const KEY_URLS: Partial<Record<ProviderId, string>> = {
  claude: "https://console.anthropic.com/settings/keys",
  chatgpt: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
  grok: "https://console.x.ai",
  mistral: "https://console.mistral.ai/api-keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  perplexity: "https://www.perplexity.ai/settings/api",
};

/**
 * Connects an AI provider with an API key. Chat subscriptions can't be called
 * by other apps, so a key is what makes a provider run live; the server checks
 * it with the provider before saving and never sends it back.
 */
export function ConnectBrain({ id, onClose, replace = false }: { id: ProviderId | null; onClose: () => void; replace?: boolean }) {
  const { update, toast, mode, refreshLive, state } = useStore();
  const [plan, setPlan] = useState("");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = id ? providerById(id) : null;

  useEffect(() => {
    if (p) {
      setPlan(state.brains.find((b) => b.providerId === p.id)?.plan ?? p.plans[0]);
      setKey("");
      setError(null);
      setBusy(false);
    }
    // Reset only when the provider changes.
  }, [p]);

  if (!p) return null;
  const noApi = p.id === "copilot";
  const account = mode === "account";

  const addBrain = () =>
    update((s) => ({
      ...s,
      brains: s.brains.some((b) => b.providerId === p.id)
        ? s.brains.map((b) => (b.providerId === p.id ? { ...b, plan, enabled: true } : b))
        : [...s.brains, { providerId: p.id, plan, usage: 0, resetsIn: "—", enabled: true, connectedAt: Date.now() }],
    }));

  const connect = async () => {
    setBusy(true);
    setError(null);
    if (!account || noApi) {
      // Demo (and Copilot, which has no API): add it to the pool without a live key.
      addBrain();
      toast(noApi ? `${p.name} added — it can't run live yet` : `${p.name} connected (demo)`);
      onClose();
      return;
    }
    try {
      const res = await fetch(`/api/ai-keys/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key }) });
      const body = (await res.json()) as { hint?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save the key");
      addBrain();
      await refreshLive();
      toast(`${p.name} is live · key ${body.hint}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} className="sm:max-w-md">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <ProviderLogo id={p.id} size={44} className="rounded-xl" />
          <div>
            <div className="text-lg font-semibold">{replace ? `Replace ${p.name} key` : `Connect ${p.name}`}</div>
            <div className="text-sm text-muted">{p.vendor}</div>
          </div>
        </div>

        {!replace && (
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
            <p className="mt-1.5 text-xs text-muted">Used for routing preferences. Chat subscriptions can't be called by other apps, so runs use an API key.</p>
          </div>
        )}

        {noApi ? (
          <p className="mt-5 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-warn">
            {p.name} doesn't offer a public API, so teammates can't use it yet. You can still add it; routing will skip it.
          </p>
        ) : account ? (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="font-medium">API key</span>
              {KEY_URLS[p.id] && (
                <a href={KEY_URLS[p.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                  Get a key <ExternalLink size={12} />
                </a>
              )}
            </div>
            <div className="relative">
              <input
                autoFocus
                className={cn(input, "pr-10 font-mono")}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && key.trim().length >= 16 && !busy && connect()}
                placeholder={p.id === "claude" ? "sk-ant-…" : "sk-…"}
                type={show ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"
                aria-label={show ? "Hide key" : "Show key"}
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                {error}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-5 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-muted">This is the demo, so nothing real connects. Create an account to add your API keys.</p>
        )}

        <div className="mt-5 flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <Lock size={14} className="mt-0.5 shrink-0" />
          Keys are checked with {p.vendor}, encrypted at rest, and only used to run your teammates. They never come back to your browser — you'll only see the last four characters.
        </div>

        <Button
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          onClick={connect}
          disabled={busy || (account && !noApi && key.trim().length < 16)}
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Checking with {p.vendor}…
            </>
          ) : noApi ? (
            `Add ${p.name}`
          ) : account ? (
            replace ? "Save new key" : "Connect"
          ) : (
            "Connect (demo)"
          )}
        </Button>
      </div>
    </Modal>
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
