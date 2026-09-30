"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuthShell, Notice } from "@/components/auth-shell";
import { Button, input } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const { server } = useStore();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) setSent(true);
    else setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Something went wrong. Try again.");
  };

  if (sent)
    return (
      <AuthShell title="Check your inbox" subtitle={<>If an account exists for <span className="font-medium text-fg">{email}</span>, a reset link is on its way. It works for one hour.</>}>
        <div className="space-y-4 text-sm text-muted">
          <p className="flex items-start gap-2">
            <MailCheck size={16} className="mt-0.5 shrink-0" /> Nothing after a few minutes? Check spam, or make sure it's the email you signed up with.
          </p>
          <Link href="/login" className="font-medium text-fg hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email and we'll send you a link to choose a new password.">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Email</span>
          <input className={cn(input, "h-11 text-[15px]")} type="email" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        {server && !server.email && <Notice tone="error">Email isn't set up on this server, so reset links can't be sent. Contact the administrator.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Button variant="primary" size="lg" className="w-full" disabled={busy || !email}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-fg hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
