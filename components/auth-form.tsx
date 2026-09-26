"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { input } from "./agent-config";
import { Button, Logo } from "./ui";

const GOOGLE_ERRORS: Record<string, string> = {
  denied: "Google sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Please try again.",
  not_configured: "Google sign-in isn't set up on this server. Use email and password.",
  signed_out: "Sign in first, then connect Google.",
  error: "Google sign-in failed.",
};

export function AuthForm({ kind }: { kind: "login" | "signup" }) {
  const { mode, ready, reload, live } = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [back, setBack] = useState("/app");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("return");
    if (r && /^\/(?!\/)[\w\-/]*$/.test(r)) setBack(r);
    const g = p.get("google");
    if (g) setError(`${GOOGLE_ERRORS[g] ?? "Google sign-in failed."}${p.get("message") ? ` ${p.get("message")}` : ""}`);
  }, []);

  useEffect(() => {
    if (ready && mode === "account") router.replace(back);
  }, [ready, mode, router, back]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "signup" ? { name, email, password } : { email, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      await reload();
      router.replace(kind === "signup" ? "/onboarding" : back);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const google = live?.google.configured;
  const isSignup = kind === "signup";

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="px-5 py-4 sm:px-8">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pt-8 pb-16 sm:pt-16">
        <div className="animate-rise w-full max-w-sm">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{isSignup ? "Build your AI team" : "Welcome back"}</h1>
          <p className="mt-2 text-[15px] text-muted">
            {isSignup ? "Two minutes to set up. Your first teammate starts working today." : "Sign in to pick up where your team left off."}
          </p>

          {google && (
            <>
              <a
                href={`/api/auth/google/start?purpose=login&return=${encodeURIComponent(isSignup ? "/onboarding" : back)}`}
                className="mt-7 flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface text-[15px] font-medium shadow-sm transition-colors hover:bg-surface-2"
              >
                <GoogleMark /> Continue with Google
              </a>
              <div className="my-5 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={cn("space-y-3", !google && "mt-7")} noValidate>
            {isSignup && (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium">Your name</span>
                <input className={cn(input, "h-11 text-[15px]")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Alex Rivera" />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">Work email</span>
              <input
                className={cn(input, "h-11 text-[15px]")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus={!isSignup}
                placeholder="you@company.com"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-[13px] font-medium">
                Password
                {!isSignup && (
                  <Link href="/forgot-password" className="font-normal text-muted hover:text-fg hover:underline">
                    Forgot password?
                  </Link>
                )}
              </span>
              <span className="relative block">
                <input
                  className={cn(input, "h-11 pr-10 text-[15px]")}
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  placeholder={isSignup ? "At least 10 characters" : ""}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                {error}
              </p>
            )}

            <Button variant="primary" size="lg" className="w-full" disabled={busy || !email || !password}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-fg hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link href="/signup" className="font-medium text-fg hover:underline">
                  Create an account
                </Link>
              </>
            )}
          </p>
          <p className="mt-3 text-center text-sm text-muted">
            or{" "}
            <Link href="/" className="hover:text-fg hover:underline">
              explore the demo first
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
