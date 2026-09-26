"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ui";

/** Minimal centered layout shared by the account-recovery pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="px-5 py-4 sm:px-8">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pt-8 pb-16 sm:pt-16">
        <div className="animate-rise w-full max-w-sm">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={tone === "error" ? "rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" : "rounded-lg bg-ok-soft px-3 py-2 text-[13px] text-ok"}>
      {children}
    </p>
  );
}
