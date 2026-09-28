"use client";

import {
  Activity,
  Blocks,
  BrainCircuit,
  CalendarClock,
  ChevronsUpDown,
  Home,
  Inbox,
  LogOut,
  Settings,
  ShieldCheck,
  LibraryBig,
  Menu,
  Moon,
  Plus,
  Search,
  Sun,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { HireAgent } from "./hire-agent";
import { VerifyBanner } from "./verify-banner";
import { AgentAvatar, Kbd, Logo } from "./ui";

const HIRE_EVENT = "agentic:hire";
export const openHire = () => window.dispatchEvent(new Event(HIRE_EVENT));

const NAV = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/inbox", label: "Approvals", icon: Inbox, badge: "approvals" as const },
  { href: "/app/agents", label: "Teammates", icon: Users },
  { href: "/app/schedule", label: "Routines", icon: CalendarClock },
];
const AGENT_TRAFFIC = [
  { href: "/app/analytics", label: "Agent analytics", icon: Activity },
  { href: "/app/analytics/agents", label: "Agent registry", icon: ShieldCheck },
];
const SETUP = [
  { href: "/app/brains", label: "AI accounts", icon: BrainCircuit },
  { href: "/app/integrations", label: "Integrations", icon: Blocks },
  { href: "/app/memory", label: "Context", icon: LibraryBig },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const { state, ready, mode, account, sync, update, refreshLive, toast, signOut } = useStore();
  const router = useRouter();
  const path = usePathname();
  const [cmd, setCmd] = useState(false);
  const [hire, setHire] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (mode === "anon") router.replace(`/login?return=${encodeURIComponent(path)}`);
    else if (!state.onboarded) router.replace("/onboarding");
  }, [ready, mode, state.onboarded, router, path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMobile(false), [path]);

  // Returning from Google sign-in: reflect the outcome, then clean the URL.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (!g) return;
    if (g === "connected") {
      // Trust the server's session, not the URL.
      refreshLive().then((st) => {
        if (st?.google.email) {
          update((s) => ({ ...s, connected: [...new Set([...s.connected, "gmail", "gcal"])] }));
          toast(`Google connected as ${st.google.email}`);
        } else toast("Google sign-in didn't complete — try again");
      });
    } else if (g === "denied") toast("Google access was not granted");
    else if (g === "not_configured") toast("Google sign-in isn't set up on this server yet");
    else toast(`Couldn't connect Google${params.get("message") ? `: ${params.get("message")}` : ""}`);
    window.history.replaceState(null, "", window.location.pathname);
  }, [ready, update, refreshLive, toast]);

  // Returning from "Add to Slack": confirm with the server before claiming success.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const sl = params.get("slack");
    if (!sl) return;
    if (sl === "connected" || sl === "partial") {
      refreshLive().then((st) => {
        if (st?.slack.team) {
          update((s) => ({ ...s, connected: [...new Set([...s.connected, "slack"])] }));
          toast(sl === "partial" ? `Slack connected to ${st.slack.team}, but some permissions were declined` : `Slack connected to ${st.slack.team}`);
        } else toast("Slack didn't finish connecting — try again");
      });
    } else if (sl === "denied") toast("Slack access was not granted");
    else if (sl === "not_configured") toast("Slack isn't set up on this server yet");
    else toast(`Couldn't connect Slack${params.get("message") ? `: ${params.get("message")}` : ""}`);
    window.history.replaceState(null, "", window.location.pathname);
  }, [ready, update, refreshLive, toast]);

  useEffect(() => {
    const open = () => setHire(true);
    window.addEventListener(HIRE_EVENT, open);
    return () => window.removeEventListener(HIRE_EVENT, open);
  }, []);

  if (!ready || !state.onboarded) {
    return <div className="min-h-screen bg-bg" />;
  }

  const pending = state.approvals.filter((a) => a.status === "pending").length;

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 px-3 pt-3 pb-4">
      <div className="mb-2 flex items-center justify-between px-2 py-1">
        <Link href="/app">
          <Logo />
        </Link>
      </div>

      <button
        className="group mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left text-[13px] text-muted shadow-sm transition-colors hover:border-line-strong"
        onClick={() => setCmd(true)}
      >
        <Search size={14} />
        <span className="flex-1">Search or ask…</span>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </button>

      {NAV.map((n) => (
        <NavItem key={n.href} {...n} active={path === n.href} count={n.badge ? pending : 0} />
      ))}

      <SectionLabel
        action={
          <button
            onClick={() => setHire(true)}
            className="rounded p-0.5 text-muted hover:bg-surface-3 hover:text-fg"
            aria-label="Hire a teammate"
            title="Hire a teammate"
          >
            <Plus size={14} />
          </button>
        }
      >
        Your team
      </SectionLabel>
      <div className="flex flex-col gap-0.5">
        {state.agents.map((a) => {
          const href = `/app/agents/${a.id}`;
          return (
            <Link
              key={a.id}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                path === href ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2",
              )}
            >
              <AgentAvatar agent={a} size={22} showStatus />
              <span className="truncate">{a.name}</span>
              <span className="ml-auto truncate text-[11px] text-muted">
                {a.status === "working" ? <span className="shimmer-text">working…</span> : a.role}
              </span>
            </Link>
          );
        })}
        {!state.agents.length && (
          <button onClick={() => setHire(true)} className="rounded-lg px-2 py-1.5 text-left text-sm text-accent hover:bg-surface-2">
            + Hire your first teammate
          </button>
        )}
      </div>

      <SectionLabel>Agent traffic</SectionLabel>
      {AGENT_TRAFFIC.map((n) => (
        <NavItem key={n.href} {...n} active={path === n.href} />
      ))}

      <SectionLabel>Setup</SectionLabel>
      {SETUP.map((n) => (
        <NavItem key={n.href} {...n} active={path === n.href} />
      ))}

      <div className="mt-auto">
        {mode === "demo" ? (
          <div className="mb-2 rounded-xl border border-accent/25 bg-accent-soft/60 p-3 text-[13px]">
            <div className="font-medium text-accent-ink">You're in the demo</div>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-2">Sample data, simulated runs. Create an account to connect your real tools.</p>
            <Link href="/signup" className="mt-2 inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg hover:brightness-110">
              Create account
            </Link>
          </div>
        ) : null}
        <AccountMenu
          name={state.user.name || account?.name || "You"}
          detail={mode === "account" ? (account?.email ?? "") : "Demo workspace"}
          sync={mode === "account" ? sync : null}
          onSignOut={async () => {
            await signOut();
            router.push(mode === "demo" ? "/" : "/login");
          }}
          signOutLabel={mode === "demo" ? "Leave demo" : "Sign out"}
        />
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-bg md:block">{sidebar}</aside>

      {mobile && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobile(false)} />
          <aside className="animate-rise absolute inset-y-0 left-0 w-72 border-r border-line bg-bg">{sidebar}</aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur md:hidden">
          <button onClick={() => setMobile((v) => !v)} className="rounded-md p-1.5 hover:bg-surface-2" aria-label="Menu">
            {mobile ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Logo />
          <button onClick={() => setCmd(true)} className="ml-auto rounded-md p-1.5 hover:bg-surface-2" aria-label="Search">
            <Search size={18} />
          </button>
        </header>
        <VerifyBanner />
        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-8 sm:pt-10">{children}</main>
      </div>

      <CommandPalette open={cmd} onClose={() => setCmd(false)} onHire={() => setHire(true)} />
      <HireAgent open={hire} onClose={() => setHire(false)} />
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  count,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        active ? "bg-surface-3 font-medium text-fg" : "text-fg-2 hover:bg-surface-2",
      )}
    >
      <Icon size={16} className={active ? "text-fg" : "text-muted"} />
      {label}
      {!!count && (
        <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-[18px] text-accent-fg">{count}</span>
      )}
    </Link>
  );
}

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-5 mb-1 flex items-center justify-between px-2 text-[11px] font-medium tracking-wide text-muted uppercase">
      {children}
      {action}
    </div>
  );
}

function AccountMenu({
  name,
  detail,
  sync,
  onSignOut,
  signOutLabel,
}: {
  name: string;
  detail: string;
  sync: "saved" | "saving" | "offline" | null;
  onSignOut: () => void;
  signOutLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-pop absolute right-0 bottom-full left-0 z-50 mb-1 rounded-xl border border-line bg-surface p-1 shadow-pop">
            <div className="truncate px-2.5 py-2 text-xs text-muted">{detail}</div>
            <Link href="/app/settings" onClick={() => setOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2">
              <Settings size={14} className="text-muted" /> Settings
            </Link>
            <button onClick={onSignOut} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2">
              <LogOut size={14} className="text-muted" /> {signOutLabel}
            </button>
          </div>
        </>
      )}
      <div className="flex items-center gap-2 rounded-lg px-2 py-2">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-haspopup="menu" aria-expanded={open}>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fg text-[12px] font-semibold text-bg">{name[0]?.toUpperCase()}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium">{name}</div>
            <div className="flex items-center gap-1 truncate text-[11px] text-muted">
              {sync && (
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", sync === "saved" ? "bg-ok" : sync === "saving" ? "bg-warn" : "bg-danger")}
                  title={sync === "saved" ? "All changes saved" : sync === "saving" ? "Saving…" : "Offline — will retry"}
                />
              )}
              {sync === "saving" ? "Saving…" : sync === "offline" ? "Offline — retrying" : detail}
            </div>
          </div>
          <ChevronsUpDown size={14} className="shrink-0 text-muted" />
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("agentic.do:theme", next ? "dark" : "light");
        } catch {}
      }}
      className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
      aria-label="Toggle theme"
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
