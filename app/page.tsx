"use client";

import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Code2,
  Fingerprint,
  Gauge,
  Globe,
  KeyRound,
  Lock,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/shell";
import { Button, Logo } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Landing() {
  const { mode } = useStore();
  const signedIn = mode === "account";
  const startHref = signedIn ? "/app" : "/signup";

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <nav className="sticky top-0 z-40 border-b border-transparent bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5 sm:px-8">
          <Logo />
          <div className="hidden gap-6 text-sm text-fg-2 md:flex">
            <a href="#how" className="hover:text-fg">
              How it works
            </a>
            <a href="#integrate" className="hover:text-fg">
              Integrate
            </a>
            <a href="#builders" className="hover:text-fg">
              For agent builders
            </a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {!signedIn && (
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
            )}
            <Link href={startHref}>
              <Button variant="primary" size="sm">
                {signedIn ? "Open app" : "Get started"}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero: Agent analytics */}
      <section className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-[520px] opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 text-center sm:px-8 sm:pt-24">
          <div className="animate-rise mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-fg-2 shadow-sm">
            <BadgeCheck size={14} className="text-accent" /> Built on Web Bot
            Auth (RFC 9421)
          </div>
          <h1 className="animate-rise mx-auto max-w-4xl text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[68px]">
            AI agents are your newest customers.{" "}
            <span className="text-accent">See them clearly.</span>
          </h1>
          <p className="animate-rise mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-muted sm:text-lg">
            agentic.do shows which AI agents act on your site, whether they
            proved who they are, and whether they finish what they came to do —
            so you can serve them like a channel, not block them like fraud.
          </p>
          <div className="animate-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={startHref}>
              <Button variant="primary" size="lg" className="w-56 sm:w-auto">
                Track your site — free <ArrowRight size={16} />
              </Button>
            </Link>
            <a href="#integrate">
              <Button size="lg" className="w-56 sm:w-auto">
                <Code2 size={16} /> See the integration
              </Button>
            </a>
          </div>
          <p className="mt-4 text-xs text-muted">
            One script tag. No page content, form values or keystrokes ever
            leave the browser.
          </p>
        </div>

        <HeroAnalytics />
      </section>

      {/* How it decides */}
      <section id="how" className="border-y border-line bg-surface/50">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <SectionTitle
            eyebrow="How it works"
            title="Two independent answers for every session."
            sub="Who the agent claims to be, proven cryptographically — and how it actually behaves, measured in the browser."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <Pillar
              icon={<KeyRound size={18} />}
              title="Verified identity"
              body="Agents sign each request with Web Bot Auth. Valid signatures from trusted directories rise from Unknown to Signed, Registered and Delegated."
            />
            <Pillar
              icon={<MousePointerClick size={18} />}
              title="Behaviour, not guesswork"
              body="Timing, pointer paths, Fitts' law and keystroke rhythm score how agent-like a session is — and split hybrid sessions where a person hands off to an agent."
            />
            <Pillar
              icon={<Target size={18} />}
              title="Outcomes that matter"
              body="Report tasks like checkout or sign-up and see which agents complete them, where they get challenged, and why verification failed."
            />
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <Pillar
              small
              icon={<ShieldCheck size={18} />}
              title="Never blocks on behaviour"
              body="Screen readers and voice control can look agent-like. Only failed signatures are challenged."
            />
            <Pillar
              small
              icon={<Lock size={18} />}
              title="Private by design"
              body="IPs stored only as a daily-rotating salted hash. Raw behaviour kept 30 days."
            />
            <Pillar
              small
              icon={<Gauge size={18} />}
              title="Rate limits that fit"
              body="Hold each agent to the rate it declared, instead of one blunt limit for all bots."
            />
          </div>
        </div>
      </section>

      {/* Integrate */}
      <section
        id="integrate"
        className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2"
      >
        <div>
          <div className="text-sm font-medium text-accent">
            Integrate in minutes
          </div>
          <h2 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight sm:text-[40px]">
            One tag in the browser. One call at your edge.
          </h2>
          <ul className="mt-6 space-y-3 text-[15px]">
            {[
              "Add a site to get a public key and a server secret",
              "Drop the 4 KB script on every page",
              "Verify signatures at your edge and pass the token to the page",
              'Report tasks with window.aa.task("checkout", "complete")',
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <span className="text-fg-2">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-2.5 font-mono text-[11px] text-muted">
            index.html · edge.ts
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-fg-2">
            {`<script src="https://agentic.do/aa.js"
        data-site="aa_pk_…" defer></script>

// at your edge
const r = await fetch("https://agentic.do/api/aa/verify", {
  method: "POST",
  headers: { authorization: \`Bearer \${AA_SITE_SECRET}\` },
  body: JSON.stringify({ method, url, headers, ip }),
});
const { tier, decision, agent, vt } = await r.json();
// decision: allow | rate_limit | challenge`}
          </pre>
        </div>
      </section>

      {/* Agent builders */}
      <section id="builders" className="border-y border-line bg-surface/50">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <SectionTitle
            eyebrow="For agent builders"
            title="Prove who your agent is. See where it's welcome."
            sub="Register an agent, sign its requests, and get the acceptance data no single site can give you."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            <Pillar
              icon={<Fingerprint size={18} />}
              title="Keys stay yours"
              body="Ed25519 keys are generated in your browser. Only the public key is published, with rotation and instant revocation."
            />
            <Pillar
              icon={<Globe size={18} />}
              title="Public directory"
              body="A standard /.well-known signatures directory, per-agent JWKS and a Signature Agent Card any site can trust."
            />
            <Pillar
              icon={<BarChart3 size={18} />}
              title="Cross-site outcomes"
              body="Requests, acceptance rate, verification failures and task success — aggregated, never naming individual sites."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-fg px-6 py-16 text-center text-bg sm:px-12">
          <div
            aria-hidden
            className="absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(50% 80% at 50% 120%, var(--accent), transparent)",
            }}
          />
          <div className="relative">
            <h2 className="text-[30px] leading-tight font-semibold tracking-tight sm:text-[44px]">
              Know which agents are knocking.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[16px] opacity-70">
              Add your site in two minutes and see your first agent sessions
              today.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={startHref}>
                <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-bg px-5 text-[15px] font-medium text-fg transition-transform hover:scale-[1.02]">
                  Track your site <ArrowRight size={16} />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:px-8">
          <Logo />
          <span>
            © {new Date().getFullYear()} agentic.do · Analytics and verification
            for AI agents.
          </span>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-sm font-medium text-accent">{eyebrow}</div>
      <h2 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight sm:text-[40px]">
        {title}
      </h2>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">{sub}</p>
    </div>
  );
}

function Pillar({
  icon,
  title,
  body,
  small,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-card",
        small ? "p-5" : "p-6",
      )}
    >
      <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
        {icon}
      </div>
      <div className="mt-4 font-semibold">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/* A living miniature of the analytics dashboard for the hero. Illustrative data. */
function HeroAnalytics() {
  const feed = [
    {
      agent: "Atlas Shopper",
      tier: "T3 Registered",
      task: "checkout",
      ok: true,
    },
    {
      agent: "Unknown · headless",
      tier: "T0 Unknown",
      task: "browse",
      ok: null,
    },
    { agent: "Clerk Assistant", tier: "T2 Signed", task: "sign-up", ok: true },
    { agent: "Fetchly", tier: "T1 Declared", task: "checkout", ok: false },
    {
      agent: "Human → agent handoff",
      tier: "Hybrid",
      task: "checkout",
      ok: true,
    },
  ];
  const tiers = [
    { label: "Registered", pct: 22, cls: "bg-accent" },
    { label: "Signed", pct: 31, cls: "bg-accent/60" },
    { label: "Declared", pct: 19, cls: "bg-warn" },
    { label: "Unknown", pct: 28, cls: "bg-line-strong" },
  ];
  const [n, setN] = useState(3);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 2400);
    return () => clearInterval(t);
  }, []);
  const visible = Array.from(
    { length: 3 },
    (_, i) => feed[(n - i) % feed.length],
  );

  return (
    <div className="relative mx-auto mt-16 max-w-5xl px-5 pb-24 sm:mt-20 sm:px-8">
      <div className="rounded-[22px] border border-line bg-surface-2/70 p-2 shadow-pop">
        <div className="overflow-hidden rounded-2xl border border-line bg-bg">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="mx-auto rounded-md bg-surface-2 px-3 py-0.5 font-mono text-[11px] text-muted">
              agentic.do/app/analytics
            </span>
          </div>
          <div className="grid gap-5 p-5 text-left sm:p-7 md:grid-cols-[1.25fr_1fr]">
            <div>
              <div className="text-xs text-muted">
                shop.example.com · last 7 days
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { k: "Agent sessions", v: "12.4k" },
                  { k: "Verified", v: "53%" },
                  { k: "Checkout done", v: "71%" },
                ].map((m) => (
                  <div
                    key={m.k}
                    className="rounded-xl border border-line bg-surface p-3 shadow-card"
                  >
                    <div className="text-[11px] text-muted">{m.k}</div>
                    <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
                      {m.v}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="text-xs font-medium text-muted">
                  Sessions by trust tier
                </div>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
                  {tiers.map((t) => (
                    <div
                      key={t.label}
                      className={t.cls}
                      style={{ width: `${t.pct}%` }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
                  {tiers.map((t) => (
                    <span key={t.label} className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", t.cls)} />{" "}
                      {t.label}{" "}
                      <span className="text-muted tabular-nums">{t.pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="text-xs font-medium text-muted">
                Live sessions
              </div>
              {visible.map((f, i) => (
                <div
                  key={`${n}-${i}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5 shadow-sm",
                    i === 0 && "animate-rise",
                  )}
                  style={{ opacity: 1 - i * 0.22 }}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                    <Fingerprint size={14} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-medium">
                      {f.agent}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {f.tier} · {f.task}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      f.ok === true
                        ? "bg-ok/15 text-ok"
                        : f.ok === false
                          ? "bg-danger/15 text-danger"
                          : "bg-surface-3 text-muted",
                    )}
                  >
                    {f.ok === true
                      ? "completed"
                      : f.ok === false
                        ? "challenged"
                        : "browsing"}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong p-2.5 text-[12px] text-muted">
                <Sparkles size={14} className="text-accent" /> Signature
                verified · key from trusted directory
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
