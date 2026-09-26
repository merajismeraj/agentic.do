"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { input } from "@/components/agent-config";
import { AuthShell, Notice } from "@/components/auth-shell";
import { Button } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function ResetPasswordPage() {
  const { reload, toast } = useStore();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
    // Keep the token out of the address bar and history.
    window.history.replaceState(null, "", "/reset-password");
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }).catch(() => null);
    if (res?.ok) {
      await reload();
      toast("Password updated — you're signed out everywhere else");
      router.replace("/app");
      return;
    }
    setBusy(false);
    setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Something went wrong. Try again.");
  };

  if (token === "")
    return (
      <AuthShell title="This link is incomplete" subtitle="Open the link from your email again, or request a new one.">
        <Link href="/forgot-password">
          <Button size="lg" className="w-full">
            Request a new link
          </Button>
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out on every other device.">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">New password</span>
          <span className="relative block">
            <input
              className={cn(input, "h-11 pr-10 text-[15px]")}
              type={show ? "text" : "password"}
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        {error && (
          <Notice tone="error">
            {error}{" "}
            {/expired|invalid|used/.test(error) && (
              <Link href="/forgot-password" className="font-medium underline">
                Get a new link
              </Link>
            )}
          </Notice>
        )}
        <Button variant="primary" size="lg" className="w-full" disabled={busy || password.length < 10 || token === null}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Save password and sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
