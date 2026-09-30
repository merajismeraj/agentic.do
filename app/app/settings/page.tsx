"use client";

import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shell";
import { Button, Card } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { account, server, toast } = useStore();
  const [busy, setBusy] = useState(false);
  if (!account) return null;

  const resend = async () => {
    setBusy(true);
    const res = await fetch("/api/auth/verify/resend", { method: "POST" }).catch(() => null);
    setBusy(false);
    toast(res?.ok ? `Confirmation link sent to ${account.email}` : "Couldn't send the link — try again");
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Your account." />

      <Card className="divide-y divide-line">
        <div className="flex items-center gap-3 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fg text-sm font-semibold text-bg">
            {(account.name || account.email)[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{account.name || "—"}</div>
            <div className="truncate text-sm text-muted">{account.email}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-5">
          <Mail size={18} className="shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Email</div>
            <div className="text-sm text-muted">
              {account.emailVerified ? "Confirmed" : "Not confirmed yet. We use it for account emails and password resets."}
            </div>
          </div>
          {account.emailVerified ? (
            <CheckCircle2 size={18} className="text-ok" />
          ) : (
            <Button size="sm" onClick={resend} disabled={busy || server?.email === false}>
              {busy && <Loader2 size={14} className="animate-spin" />} Resend link
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 p-5">
          <KeyRound size={18} className="shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Password</div>
            <div className="text-sm text-muted">We'll email you a link to set a new one.</div>
          </div>
          <Link href="/forgot-password">
            <Button size="sm">Change password</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
