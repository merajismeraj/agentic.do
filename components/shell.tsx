"use client";

import { Activity, ChevronsUpDown, LogOut, Menu, Moon, Settings, ShieldCheck, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { VerifyBanner } from "./verify-banner";
import { Logo } from "./ui";

const NAV = [
  { href: "/app/analytics", label: "Agent analytics", icon: Activity },
  { href: "/app/analytics/agents", label: "Agent registry", icon: ShieldCheck },
];

export function Shell({ children }: { children: ReactNode }) {
  const { ready, mode, account, signOut } = useStore();
  const router = useRouter();
  const path = usePathname();
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (ready && mode === "anon") router.replace(`/login?return=${encodeURIComponent(path)}`);
  }, [ready, mode, router, path]);

  useEffect(() => setMobile(false), [path]);

  if (mode !== "account") return <div className="min-h-screen bg-bg" />;

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 px-3 pt-3 pb-4">
      <div className="mb-3 flex items-center justify-between px-2 py-1">
        <Link href="/app/analytics">
          <Logo />
        </Link>
      </div>

      {NAV.map((n) => (
        <NavItem key={n.href} {...n} active={path === n.href} />
      ))}

      <div className="mt-5">
        <NavItem href="/app/settings" label="Settings" icon={Settings} active={path === "/app/settings"} />
      </div>

      <div className="mt-auto">
        <AccountMenu
          name={account?.name || "You"}
          detail={account?.email ?? ""}
          onSignOut={async () => {
            await signOut();
            router.push("/login");
          }}
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
        </header>
        <VerifyBanner />
        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-8 sm:pt-10">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Activity;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-surface-3 font-medium text-fg"
          : "text-fg-2 hover:bg-surface-2",
      )}
    >
      <Icon size={16} className={active ? "text-fg" : "text-muted"} />
      {label}
    </Link>
  );
}

function AccountMenu({
  name,
  detail,
  onSignOut,
}: {
  name: string;
  detail: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-pop absolute right-0 bottom-full left-0 z-50 mb-1 rounded-xl border border-line bg-surface p-1 shadow-pop">
            <div className="truncate px-2.5 py-2 text-xs text-muted">
              {detail}
            </div>
            <Link
              href="/app/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
            >
              <Settings size={14} className="text-muted" /> Settings
            </Link>
            <button
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
            >
              <LogOut size={14} className="text-muted" /> Sign out
            </button>
          </div>
        </>
      )}
      <div className="flex items-center gap-2 rounded-lg px-2 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fg text-[12px] font-semibold text-bg">
            {name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium">{name}</div>
            <div className="truncate text-[11px] text-muted">{detail}</div>
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
  useEffect(
    () => setDark(document.documentElement.classList.contains("dark")),
    [],
  );
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
