"use client";

import { ArrowRight, CalendarClock, Check, Eye, Hand, Layers, Lock, Plug, Route, ScrollText, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/shell";
import { AgentAvatar, Button, Logo, ProviderLogo, ToolLogo } from "@/components/ui";
import { INTEGRATIONS, PROVIDERS, TEMPLATES } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Landing() {
  const { mode, startDemo } = useStore();
  const router = useRouter();
  const signedIn = mode === "account";
  const openDemo = () => {
    if (mode === "anon") startDemo();
    router.push("/app");
  };
  const startHref = signedIn ? "/app" : "/signup";

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <nav className="sticky top-0 z-40 border-b border-transparent bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5 sm:px-8">
          <Logo />
          <div className="hidden gap-6 text-sm text-fg-2 md:flex">
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#byo" className="hover:text-fg">Bring your AI</a>
            <a href="#team" className="hover:text-fg">Teammates</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
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

      {/* Hero */}
      <section className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-[520px] opacity-70"
          style={{ background: "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)" }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 text-center sm:px-8 sm:pt-24">
          <div className="animate-rise mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-fg-2 shadow-sm">
            <span className="flex -space-x-1">
              {PROVIDERS.slice(0, 5).map((p) => (
                <ProviderLogo key={p.id} id={p.id} size={16} className="rounded-full ring-2 ring-surface" />
              ))}
            </span>
            Works with the AI subscriptions you already have
          </div>
          <h1 className="animate-rise mx-auto max-w-4xl text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[68px]">
            AI teammates that <span className="text-accent">actually get work done.</span>
          </h1>
          <p className="animate-rise mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-muted sm:text-lg">
            agentic.do gives you AI teammates that plug into your tools, learn your context, and finish work on
            schedule — powered by ChatGPT, Claude, Gemini, SuperGrok, Copilot and every other plan you pay for.
          </p>
          <div className="animate-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={startHref}>
              <Button variant="primary" size="lg" className="w-56 sm:w-auto">
                Build your team — free <ArrowRight size={16} />
              </Button>
            </Link>
            <Button size="lg" onClick={openDemo} className="w-56 sm:w-auto">
              <Eye size={16} /> Explore live demo
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted">No credit card. Your AI, your tools, your rules.</p>
        </div>

        <HeroProduct />
      </section>

      {/* Tools strip */}
      <section className="border-y border-line bg-surface/50 py-10">
        <p className="mb-6 text-center text-sm text-muted">Connects to the tools your team already lives in</p>
        <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-8">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((i, n) => (
              <span key={n} className="flex items-center gap-2 text-sm font-medium text-fg-2">
                <ToolLogo id={i.id} size={24} className="rounded-md" /> {i.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionTitle eyebrow="How it works" title="Hire once. Delegate forever." sub="Three things make a teammate useful: access to your tools, an understanding of your context, and the judgement to know when to ask." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          <Pillar
            icon={<Plug size={18} />}
            title="Connects to everything"
            body="Gmail, Slack, Notion, Linear, HubSpot and 1,000+ more. One-click OAuth, scoped permissions, revocable any time."
          />
          <Pillar
            icon={<Layers size={18} />}
            title="Understands your context"
            body="Learns your voice, your customers and how your team works — and shows you exactly what it remembers, so you can edit it."
          />
          <Pillar
            icon={<CalendarClock size={18} />}
            title="Works on schedule"
            body="Morning briefs at 8, standups at 9:30, inbox triage every hour. Routines run while you're in meetings or asleep."
          />
        </div>
      </section>

      {/* BYO AI */}
      <section id="byo" className="border-y border-line bg-surface/50">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-accent">Bring your own AI</div>
            <h2 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight sm:text-[40px]">
              Every subscription you pay for, working as one.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">
              Connect ChatGPT Plus, Claude Max, Gemini, SuperGrok, Copilot — as many as you have. agentic.do pools them
              and sends each task to the model that's best at it. When one plan hits its limit, work quietly fails over to the next.
            </p>
            <ul className="mt-6 space-y-3 text-[15px]">
              {[
                "Writing goes to Claude, research to Gemini or Perplexity, code where it runs best",
                "Live capacity meters for every plan — no more surprise rate limits",
                "Pin a teammate to one model, or let it auto-route",
                "No markup on tokens. You already paid for them.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check size={18} className="mt-0.5 shrink-0 text-accent" /> <span className="text-fg-2">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <RoutingVisual />
        </div>
      </section>

      {/* Templates */}
      <section id="team" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionTitle eyebrow="Teammates" title="Start with a proven role." sub="Every template ships with a job description, the right tools and routines. Change anything in plain English." />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((t) => (
            <div key={t.role} className="rounded-2xl border border-line bg-surface p-5 shadow-card transition-transform hover:-translate-y-1">
              <AgentAvatar agent={t} size={44} />
              <div className="mt-4 font-semibold">{t.role}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.pitch}</p>
              <div className="mt-4 flex -space-x-1">
                {t.tools.map((id) => (
                  <ToolLogo key={id} id={id} size={20} className="rounded-full ring-2 ring-surface" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="border-y border-line bg-surface/50">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <SectionTitle eyebrow="In control" title="Autonomy you can dial up, not hope for." sub="Teammates draft by default and act when you say so. Every step is visible." />
          <div className="mt-14 grid gap-5 md:grid-cols-4">
            <Pillar small icon={<Hand size={18} />} title="Approvals" body="Emails, posts and CRM changes wait for a one-tap OK. Edit before approving." />
            <Pillar small icon={<Route size={18} />} title="Show the work" body="See which model ran, which tools were called and what was found." />
            <Pillar small icon={<Lock size={18} />} title="Scoped access" body="Each teammate only touches the tools you give it. Revoke in one click." />
            <Pillar small icon={<ScrollText size={18} />} title="Audit trail" body="Every action logged. Nothing you connect is used to train models." />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionTitle eyebrow="Pricing" title="Pay for teammates, not tokens." sub="You bring the AI. We never mark up usage." />
        <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-3">
          <Plan name="Starter" price="$0" per="forever" features={["1 teammate", "5 integrations", "Daily routines", "Community support"]} />
          <Plan name="Pro" price="$24" per="per user / mo" featured features={["Unlimited teammates", "All integrations", "Smart routing & failover", "Hourly routines"]} />
          <Plan name="Team" price="$49" per="per user / mo" features={["Shared teammates", "Team context & memory", "SSO, audit export", "Priority support"]} />
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-fg px-6 py-16 text-center text-bg sm:px-12">
          <div aria-hidden className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(50% 80% at 50% 120%, var(--accent), transparent)" }} />
          <div className="relative">
            <h2 className="text-[30px] leading-tight font-semibold tracking-tight sm:text-[44px]">Your team just got bigger.</h2>
            <p className="mx-auto mt-3 max-w-xl text-[16px] opacity-70">Set up in two minutes. Your first teammate starts working today.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={startHref}>
                <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-bg px-5 text-[15px] font-medium text-fg transition-transform hover:scale-[1.02]">
                  Build your team <ArrowRight size={16} />
                </button>
              </Link>
              <button onClick={openDemo} className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[15px] font-medium opacity-80 hover:opacity-100">
                Explore the demo
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:px-8">
          <Logo />
          <span>© {new Date().getFullYear()} agentic.do · Your AI, working as a team.</span>
        </div>
      </footer>

      <style>{`@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
  );
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-sm font-medium text-accent">{eyebrow}</div>
      <h2 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight sm:text-[40px]">{title}</h2>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">{sub}</p>
    </div>
  );
}

function Pillar({ icon, title, body, small }: { icon: React.ReactNode; title: string; body: string; small?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-card", small ? "p-5" : "p-6")}>
      <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">{icon}</div>
      <div className="mt-4 font-semibold">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Plan({ name, price, per, features, featured }: { name: string; price: string; per: string; features: string[]; featured?: boolean }) {
  return (
    <div className={cn("relative rounded-2xl border bg-surface p-6 shadow-card", featured ? "border-accent ring-4 ring-accent/10" : "border-line")}>
      {featured && <span className="absolute -top-2.5 left-6 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">Most popular</span>}
      <div className="font-semibold">{name}</div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight">{price}</span>
        <span className="text-sm text-muted">{per}</span>
      </div>
      <ul className="mt-5 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-fg-2">
            <Check size={16} className="mt-0.5 shrink-0 text-accent" /> {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* A living miniature of the product for the hero. */
function HeroProduct() {
  const feed = [
    { a: TEMPLATES[0], tool: "gcal", text: "Prepped your 11:30 with Northwind" },
    { a: TEMPLATES[1], tool: "gmail", text: "Archived 23 newsletters, drafted 4 replies" },
    { a: TEMPLATES[3], tool: "slack", text: "Posted standup to #eng" },
    { a: TEMPLATES[2], tool: "hubspot", text: "Qualified 2 inbound leads" },
    { a: TEMPLATES[5], tool: "stripe", text: "Flagged 4 failed payments" },
  ];
  const [n, setN] = useState(3);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 2400);
    return () => clearInterval(t);
  }, []);
  const visible = Array.from({ length: 3 }, (_, i) => feed[(n - i) % feed.length]);

  return (
    <div className="relative mx-auto mt-16 max-w-5xl px-5 pb-24 sm:mt-20 sm:px-8">
      <div className="rounded-[22px] border border-line bg-surface-2/70 p-2 shadow-pop">
        <div className="overflow-hidden rounded-2xl border border-line bg-bg">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="mx-auto rounded-md bg-surface-2 px-3 py-0.5 font-mono text-[11px] text-muted">app.agentic.do</span>
          </div>
          <div className="grid gap-5 p-5 text-left sm:p-7 md:grid-cols-[1.25fr_1fr]">
            <div>
              <div className="text-xs text-muted">Good morning, Alex.</div>
              <div className="mt-1 text-lg font-semibold tracking-tight">
                Your team handled 41 things overnight. <span className="text-accent">3 need you.</span>
              </div>
              <div className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <AgentAvatar agent={TEMPLATES[1]} size={22} /> <span className="font-medium text-fg">Iris</span> wants to
                  <ToolLogo id="gmail" size={14} className="rounded" /> Gmail
                </div>
                <div className="mt-2 text-sm font-medium">Reply to Priya (Northwind) about redlines</div>
                <div className="mt-2 rounded-lg bg-surface-2 p-2.5 text-[12px] leading-relaxed text-fg-2">
                  Hi Priya — thanks for turning these around. We're good with everything except 7.2; could we cap liability at 12 months of fees?
                </div>
                <div className="mt-3 flex gap-2">
                  <span className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg">
                    <Check size={12} /> Approve
                  </span>
                  <span className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-xs">Edit</span>
                </div>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="text-xs font-medium text-muted">Live activity</div>
              {visible.map((f, i) => (
                <div
                  key={`${n}-${i}`}
                  className={cn("flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5 shadow-sm", i === 0 && "animate-rise")}
                  style={{ opacity: 1 - i * 0.22 }}
                >
                  <AgentAvatar agent={f.a} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    <span className="font-medium">{f.a.name}</span> <span className="text-fg-2">{f.text}</span>
                  </span>
                  <ToolLogo id={f.tool} size={18} className="rounded" />
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong p-2.5 text-[12px] text-muted">
                <Sparkles size={14} className="text-accent" /> Routed to Claude · ChatGPT at 94% → failing over
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoutingVisual() {
  const tasks = [
    { text: "Draft renewal email", to: "claude" as const },
    { text: "Research competitor launch", to: "gemini" as const },
    { text: "Summarise sales call", to: "chatgpt" as const },
    { text: "Scan X for mentions", to: "grok" as const },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % tasks.length), 1800);
    return () => clearInterval(t);
  }, [tasks.length]);

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-pop">
      <div className="space-y-2">
        {tasks.map((t, n) => (
          <div
            key={t.text}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-500",
              n === i ? "border-accent bg-accent-soft/50 shadow-sm" : "border-line opacity-60",
            )}
          >
            <span className="flex-1">{t.text}</span>
            <ArrowRight size={14} className={cn("text-muted transition-transform", n === i && "translate-x-1 text-accent")} />
            <ProviderLogo id={t.to} size={22} className="rounded-md" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-4 gap-3 border-t border-line pt-5">
        {(["claude", "chatgpt", "gemini", "grok"] as const).map((id, n) => {
          const usage = [38, 94, 12, 27][n];
          const p = PROVIDERS.find((x) => x.id === id)!;
          return (
            <div key={id} className="text-center">
              <ProviderLogo id={id} size={34} className={cn("mx-auto rounded-xl transition-transform", tasks[i].to === id && "scale-110")} />
              <div className="mt-2 text-xs font-medium">{p.name}</div>
              <div className="mx-auto mt-1.5 h-1 w-12 overflow-hidden rounded-full bg-surface-3">
                <div className={cn("h-full rounded-full", usage > 90 ? "bg-danger" : usage > 70 ? "bg-warn" : "bg-ok")} style={{ width: `${usage}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-muted">{usage}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
