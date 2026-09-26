"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthShell, Notice } from "@/components/auth-shell";
import { Button } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function VerifyEmailPage() {
  const { reload, mode } = useStore();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    // Strip the token from the address bar and history.
    window.history.replaceState(null, "", "/verify-email");
    fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (res) => {
        if (res.ok) {
          setState("done");
          reload();
        } else {
          setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't confirm your email");
          setState("error");
        }
      })
      .catch(() => {
        setError("Couldn't reach the server. Try the link again.");
        setState("error");
      });
  }, [reload]);

  return (
    <AuthShell title={state === "done" ? "Email confirmed" : state === "error" ? "That link didn't work" : "Confirming your email…"}>
      {state === "working" && <Loader2 className="animate-spin text-accent" />}
      {state === "done" && (
        <div className="space-y-5">
          <p className="flex items-center gap-2 text-[15px] text-fg-2">
            <CheckCircle2 size={18} className="text-ok" /> Your teammates can now email you when they need an approval.
          </p>
          <Link href={mode === "account" ? "/app" : "/login"}>
            <Button variant="primary" size="lg" className="w-full">
              {mode === "account" ? "Go to your team" : "Sign in"}
            </Button>
          </Link>
        </div>
      )}
      {state === "error" && (
        <div className="space-y-5">
          <Notice tone="error">{error}</Notice>
          <Link href={mode === "account" ? "/app/settings" : "/login"}>
            <Button size="lg" className="w-full">
              {mode === "account" ? "Send a new link from Settings" : "Sign in to request a new link"}
            </Button>
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
