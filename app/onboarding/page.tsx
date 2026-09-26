"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { input } from "@/components/agent-config";
import { AgentAvatar, Button, Logo, ProviderLogo, ToolLogo } from "@/components/ui";
import { INTEGRATIONS, PROVIDERS, TEMPLATES } from "@/lib/catalog";
import { EMPTY, hire } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { ProviderId, State } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

const ROLES = [
  { label: "Founder / Exec", tools: ["gmail", "gcal", "slack", "notion"], hires: ["Chief of Staff", "Inbox Manager", "Sales SDR"] },
  { label: "Sales", tools: ["gmail", "gcal", "hubspot", "slack"], hires: ["Sales SDR", "Inbox Manager", "Market Researcher"] },
  { label: "Engineering", tools: ["github", "linear", "slack", "notion"], hires: ["Engineering PM", "Chief of Staff", "Support Lead"] },
  { label: "Operations", tools: ["gmail", "slack", "notion", "airtable"], hires: ["Chief of Staff", "Finance Ops", "Recruiter"] },
  { label: "Support", tools: ["intercom", "slack", "notion"], hires: ["Support Lead", "Inbox Manager", "Chief of Staff"] },
  { label: "Marketing", tools: ["slack", "notion", "gdrive", "figma"], hires: ["Market Researcher", "Chief of Staff", "Inbox Manager"] },
];

const STEPS = ["You", "AI", "Tools", "Team"];

export default function Onboarding() {
  const { finishOnboarding, state, ready, mode, account, signOut } = useStore();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [ais, setAis] = useState<ProviderId[]>([]);
  const [loadingAi, setLoadingAi] = useState<ProviderId | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [hires, setHires] = useState<string[]>([]);
  const [building, setBuilding] = useState(-1);

  useEffect(() => {
    // While finishing, the page navigates to the new teammate itself.
    if (!ready || building >= 0) return;
    if (mode !== "account") router.replace("/signup");
    else if (state.onboarded) router.replace("/app");
  }, [ready, mode, state.onboarded, router, building]);

  useEffect(() => {
    if (account?.name && !name) setName(account.name);
    // Prefill once when the account loads.
  }, [account]);

  useEffect(() => {
    setTools(role.tools);
    setHires([role.hires[0]]);
  }, [role]);

  const toggleAi = (id: ProviderId) => {
    if (ais.includes(id)) return setAis(ais.filter((x) => x !== id));
    setLoadingAi(id);
    setTimeout(() => {
      setAis((a) => [...a, id]);
      setLoadingAi(null);
    }, 650);
  };

  const canNext = [name.trim().length > 0, true, true, hires.length > 0][step];

  const finish = () => {
    setBuilding(0);
    [1, 2, 3, 4].forEach((n) => setTimeout(() => setBuilding(n), n * 550));
    setTimeout(() => {
      const hired = hires.map((r) => hire(TEMPLATES.find((t) => t.role === r)!));
      const first = hired[0]?.agent;
      const next: State = {
        ...EMPTY,
        onboarded: true,
        user: { name: name.trim(), company: company.trim(), role: role.label, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        brains: ais.map((id) => ({
          providerId: id,
          plan: PROVIDERS.find((p) => p.id === id)!.plans[0],
          usage: 0,
          resetsIn: "—",
          enabled: true,
          connectedAt: Date.now(),
        })),
        connected: tools,
        agents: hired.map((h) => h.agent),
        routines: hired.flatMap((h) => h.routines),
        messages: first
          ? [
              {
                id: uid(),
                threadId: first.id,
                author: "agent",
                agentId: first.id,
                at: Date.now(),
                text: `Hey ${name.trim().split(" ")[0]} 👋 I'm ${first.name}, your new ${first.role.toLowerCase()}.\n\nI've already scheduled **${hired[0].routines.map((r) => r.title.toLowerCase()).join("**, **")}**. Anything I send outside ${company.trim() || "your company"} will wait for your approval first.\n\nWhat's the one thing you'd love off your plate this week?`,
              },
            ]
          : [],
        memory: company.trim()
          ? [{ id: uid(), text: `${name.trim()} works at ${company.trim()} (${role.label}).`, source: "Onboarding", scope: "me" }]
          : [],
      };
      finishOnboarding(next).then((ok) => {
        if (ok) router.push(first ? `/app/agents/${first.id}` : "/app");
        else setBuilding(-1);
      });
    }, 2600);
  };

  if (building >= 0) {
    const lines = [
      `Pooling ${ais.length || "your"} AI subscription${ais.length === 1 ? "" : "s"}`,
      `Connecting ${tools.length} tools`,
      "Learning your context",
      `Onboarding ${hires.length} teammate${hires.length > 1 ? "s" : ""}`,
    ];
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center -space-x-3">
            {hires.map((r) => {
              const t = TEMPLATES.find((x) => x.role === r)!;
              return <AgentAvatar key={r} agent={t} size={56} className="animate-pop rounded-full ring-4 ring-bg" />;
            })}
          </div>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={l} className={cn("flex items-center gap-3 text-[15px] transition-opacity", i > building && "opacity-30")}>
                <span className="flex size-6 items-center justify-center rounded-full bg-surface-2">
                  {i < building ? <Check size={14} className="text-ok" /> : i === building ? <Loader2 size={14} className="animate-spin text-accent" /> : null}
                </span>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/">
          <Logo />
        </Link>
        <button onClick={() => signOut().then(() => router.push("/"))} className="text-sm text-muted hover:text-fg">
          {account?.email ? `Signed in as ${account.email} · Sign out` : "Sign out"}
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-5 pt-6 pb-32 sm:pt-12">
        <div className="mb-10 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col gap-2">
              <div className={cn("h-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-surface-3")} />
              <span className={cn("text-xs", i === step ? "font-medium text-fg" : "text-muted")}>{s}</span>
            </div>
          ))}
        </div>

        <div key={step} className="animate-rise">
          {step === 0 && (
            <>
              <H title="Welcome. Let's build your AI team." sub="Two minutes to set up. Your teammates start working today." />
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <div className="mb-1.5 text-[13px] font-medium">Your name</div>
                  <input autoFocus className={cn(input, "h-11 text-[15px]")} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" />
                </label>
                <label>
                  <div className="mb-1.5 text-[13px] font-medium">Company</div>
                  <input className={cn(input, "h-11 text-[15px]")} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Northstar" />
                </label>
              </div>
              <div className="mt-6 mb-2 text-[13px] font-medium">What do you spend most of your day on?</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ROLES.map((r) => (
                  <Choice key={r.label} active={role.label === r.label} onClick={() => setRole(r)}>
                    {r.label}
                  </Choice>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <H
                title="Bring the AI you already pay for."
                sub="Pick every AI you use. Your team pools them, routes each task to the best model, and fails over when one hits its limit. Right after setup you'll add an API key for each — it takes a minute."
              />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {PROVIDERS.map((p) => {
                  const on = ais.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleAi(p.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border bg-surface p-3.5 text-left transition-all",
                        on ? "border-accent ring-4 ring-accent/10" : "border-line hover:border-line-strong",
                      )}
                    >
                      <ProviderLogo id={p.id} size={36} className="rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted">{p.plans.slice(0, 3).join(" · ")}</div>
                      </div>
                      <Tick on={on} loading={loadingAi === p.id} />
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-muted">
                {ais.length ? (
                  <>
                    <span className="font-medium text-fg">{ais.length} selected.</span> Your team will think with{" "}
                    {ais.map((a) => PROVIDERS.find((p) => p.id === a)!.name).join(" + ")}.
                  </>
                ) : (
                  "No subscription? You can skip and add one later."
                )}
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <H title="Where does your work live?" sub={`We picked the usual suspects for ${role.label.toLowerCase()}. Teammates only see what you connect.`} />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {INTEGRATIONS.slice(0, 15).map((i) => {
                  const on = tools.includes(i.id);
                  return (
                    <button
                      key={i.id}
                      onClick={() => setTools(on ? tools.filter((t) => t !== i.id) : [...tools, i.id])}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border bg-surface p-3 text-left text-sm transition-all",
                        on ? "border-accent ring-4 ring-accent/10" : "border-line hover:border-line-strong",
                      )}
                    >
                      <ToolLogo id={i.id} size={26} className="rounded-lg" />
                      <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                      <Tick on={on} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <H title="Hire your first teammates." sub="Recommended for you. Each comes with a job description and routines you can tweak." />
              <div className="space-y-2.5">
                {[...role.hires, ...TEMPLATES.map((t) => t.role).filter((r) => !role.hires.includes(r))].slice(0, 5).map((r, idx) => {
                  const t = TEMPLATES.find((x) => x.role === r)!;
                  const on = hires.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => setHires(on ? hires.filter((x) => x !== r) : [...hires, r])}
                      className={cn(
                        "flex w-full items-center gap-4 rounded-2xl border bg-surface p-4 text-left transition-all",
                        on ? "border-accent ring-4 ring-accent/10" : "border-line hover:border-line-strong",
                      )}
                    >
                      <AgentAvatar agent={t} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          {t.name} <span className="font-normal text-muted">· {t.role}</span>
                          {idx === 0 && <span className="rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent-ink">Top pick</span>}
                        </div>
                        <div className="mt-0.5 text-[13px] text-muted">{t.pitch}</div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                          <span className="flex -space-x-1">
                            {t.tools.map((id) => (
                              <ToolLogo key={id} id={id} size={16} className="rounded-full ring-2 ring-surface" />
                            ))}
                          </span>
                          {t.routines[0] && <span>{t.routines[0].title} · {t.routines[0].cadence}</span>}
                        </div>
                      </div>
                      <Tick on={on} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3.5">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} /> Back
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {step === 1 && !ais.length && (
              <Button variant="ghost" onClick={() => setStep(2)}>
                Skip for now
              </Button>
            )}
            <Button
              variant="primary"
              size="lg"
              disabled={!canNext}
              onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish())}
            >
              {step < STEPS.length - 1 ? (
                <>
                  Continue <ArrowRight size={16} />
                </>
              ) : (
                `Hire ${hires.length} teammate${hires.length === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function H({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[34px]">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{sub}</p>
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-surface px-3 py-2.5 text-left text-sm font-medium transition-all",
        active ? "border-accent text-accent-ink ring-4 ring-accent/10" : "border-line text-fg-2 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function Tick({ on, loading }: { on: boolean; loading?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-all",
        on ? "border-accent bg-accent text-white" : "border-line-strong",
      )}
    >
      {loading ? <Loader2 size={12} className="animate-spin text-accent" /> : on && <Check size={12} strokeWidth={3} />}
    </span>
  );
}
