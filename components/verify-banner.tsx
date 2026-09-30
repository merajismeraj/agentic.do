"use client";

import { MailWarning, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";

/** Nudge to confirm the account email; alerts only go to confirmed addresses. */
export function VerifyBanner() {
  const { mode, account, toast } = useStore();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  if (mode !== "account" || !account || account.emailVerified || hidden) return null;

  const resend = async () => {
    setBusy(true);
    const res = await fetch("/api/auth/verify/resend", { method: "POST" }).catch(() => null);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string; alreadyVerified?: boolean };
    setBusy(false);
    toast(res?.ok ? (body.alreadyVerified ? "Already confirmed" : `Sent — check ${account.email}`) : (body.error ?? "Couldn't send"));
  };

  return (
    <div className="flex items-center gap-3 border-b border-warn/25 bg-warn-soft/60 px-4 py-2 text-[13px] text-warn sm:px-8">
      <MailWarning size={15} className="shrink-0" />
      <span className="min-w-0 flex-1">
        Confirm <span className="font-medium">{account.email}</span> so we can send you alerts and account emails.
      </span>
      <button onClick={resend} disabled={busy} className="shrink-0 font-medium underline disabled:opacity-50">
        {busy ? "Sending…" : "Resend link"}
      </button>
      <button onClick={() => setHidden(true)} className="shrink-0 rounded p-0.5 hover:bg-warn/10" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
