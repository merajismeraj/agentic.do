"use client";

import { Activity, Check, ChevronsUpDown, ExternalLink, Globe, Plus, Radar, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  AttributionTable,
  BarList,
  ClassLabel,
  CLASS_META,
  CopyField,
  DailyChart,
  humanize,
  KIND_META,
  KIND_ORDER,
  Kpi,
  Legend,
  num,
  pct,
  TIER_META,
  type ActorClass,
  type AttributionRow,
  type PropertyKind,
} from "@/components/aa";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, Empty, Modal, Segmented } from "@/components/ui";
import { useStore } from "@/lib/store";
import { ago, cn } from "@/lib/utils";

interface Site {
  id: string;
  name: string;
  kind: PropertyKind;
  domain: string;
  appId: string | null;
  siteKey: string;
  secret?: string;
}

interface Evidence {
  feature: string;
  value: number;
  llr: number;
  n: number;
  note: string;
}

interface SessionRow {
  id: string;
  startedAt: string;
  lastAt: string;
  tier: string;
  agentName: string | null;
  pAgent: number;
  cls: ActorClass;
  hybrid: boolean;
  pages: number;
  ua: string | null;
  evidence: Evidence[];
  segments: { from: number; to: number; state: "human" | "agent" }[];
  tasks: Record<string, { start: number; complete: number; fail: number }>;
  durationMs: number;
  channel: string;
  source: string;
  medium: string;
  campaign: string | null;
  referrer: string | null;
  landing: string | null;
  firstTouch: { channel: string; source: string; medium: string; campaign: string | null } | null;
}

type Dimension = "channels" | "sources" | "campaigns" | "landingPages" | "referrers";
const DIMENSIONS: { value: Dimension; label: string; column: string; empty: string }[] = [
  { value: "channels", label: "Channels", column: "Channel", empty: "No sessions yet." },
  { value: "sources", label: "Source / medium", column: "Source / medium", empty: "No sessions yet." },
  { value: "campaigns", label: "Campaigns", column: "Campaign", empty: "No campaign-tagged sessions yet. Add utm_campaign to your links." },
  { value: "landingPages", label: "Landing pages", column: "Landing page", empty: "No landing pages recorded yet." },
  { value: "referrers", label: "Referrers", column: "Referrer", empty: "No referring sites yet." },
];

type Tally = { started: number; completed: number; failed: number; rate: number | null };

interface Overview {
  days: number;
  attribution: Record<Dimension, AttributionRow[]> & { firstTouchChannels: AttributionRow[] };
  totals: { sessions: number; agentShare: number | null; verifiedShare: number | null; hybrid: number; byClass: Record<ActorClass, number>; byTier: Record<string, number> };
  tasks: Record<ActorClass, Tally>;
  taskBreakdown: { name: string; agentStarted: number; agentCompleted: number; agentFailed: number; humanStarted: number; humanCompleted: number }[];
  daily: ({ day: string } & Record<ActorClass, number>)[];
  requests: { total: number; signedValid: number; signedInvalid: number; byDecision: { decision: string; n: number }[]; failures: { reason: string; n: number }[]; byTier: Record<string, number> };
  recentRequests: { at: string; method: string; path: string; tier: string; decision: string; verifyStatus: string; verifyReason: string | null; agentName: string | null; declared: string | null; ua: string | null }[];
  agents: { agentId: string; name: string; operator: string; status: string; requests: number; sessions: number; tasks: Tally }[];
  sessions: SessionRow[];
}

const SITE_PREF = "agentic.do:aa-site";
const DECISION_TONE: Record<string, "ok" | "warn" | "danger"> = { allow: "ok", rate_limit: "warn", challenge: "danger" };

export default function AnalyticsPage() {
  const { mode, toast } = useStore();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [limit, setLimit] = useState(100);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [days, setDays] = useState<"1" | "7" | "30">("7");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [install, setInstall] = useState<Site | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);

  const loadSites = useCallback(async () => {
    const { sites, limit } = await api<{ sites: Site[]; limit: number }>("/api/aa/sites");
    setSites(sites);
    setLimit(limit);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SITE_PREF);
    } catch {
      /* storage unavailable */
    }
    setSiteId((cur) => (cur && sites.some((s) => s.id === cur) ? cur : sites.find((s) => s.id === saved)?.id ?? sites[0]?.id ?? null));
  }, []);

  useEffect(() => {
    if (mode === "account") loadSites().catch((e) => toast(e.message));
  }, [mode, loadSites, toast]);

  const loadOverview = useCallback(async () => {
    if (!siteId) return setData(null);
    setLoading(true);
    try {
      setData((await api<{ overview: Overview }>(`/api/aa/sites/${siteId}?days=${days}`)).overview);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [siteId, days, toast]);

  useEffect(() => {
    loadOverview();
    if (!siteId) return;
    try {
      localStorage.setItem(SITE_PREF, siteId);
    } catch {
      /* ignore */
    }
    const t = setInterval(loadOverview, 15_000);
    return () => clearInterval(t);
  }, [siteId, loadOverview]);

  const site = sites?.find((s) => s.id === siteId) ?? null;

  if (mode !== "account")
    return (
      <div>
        <PageHeader title="Agent analytics" subtitle="See which AI agents use your site, whether they proved who they are, and whether they get the job done." />
        <Empty
          icon={<Radar size={20} />}
          title="Create an account to track a site"
          body="Agent analytics runs on real traffic, so it needs an account. The demo workspace stays in your browser."
          action={
            <Link href="/signup">
              <Button variant="primary">Create account</Button>
            </Link>
          }
        />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Agent analytics"
        subtitle="Agents are a customer channel, not a fraud category. See who acts on your site, who they act for, and whether they finish."
        actions={
          sites?.length ? <PropertySwitcher sites={sites} current={site} limit={limit} onSelect={setSiteId} onAdd={() => setAdding(true)} /> : null
        }
      />

      {sites && !sites.length && (
        <Empty
          icon={<Globe size={20} />}
          title="Track your first site or app"
          body={`Add a website or app (up to ${limit}), then paste one tag in the <head> of every page. That's the whole setup.`}
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add a site or app
            </Button>
          }
        />
      )}

      {site && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: "1", label: "24h" },
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
              ]}
            />
            <div className="ml-auto flex gap-2">
              {!KIND_META[site.kind].app || site.kind === "web_app" ? (
                <a href={`/aa/demo/${site.siteKey}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost">
                    <ExternalLink size={14} /> Demo store
                  </Button>
                </a>
              ) : null}
              <Button size="sm" onClick={() => setInstall(site)}>
                {site.kind === "website" || site.kind === "web_app" ? "Install" : "Set up"}
              </Button>
            </div>
          </div>

          {!data ? (
            <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
          ) : data.totals.sessions === 0 && data.requests.total === 0 ? (
            <Empty
              icon={<Activity size={20} />}
              title="Waiting for traffic"
              body={
                site.kind === "website" || site.kind === "web_app"
                  ? `Nothing from ${site.domain} yet. Paste the tag in the <head> of every page, or open the demo store and browse it yourself, then run an agent against it.`
                  : `Nothing from ${site.appId ?? site.domain} yet. Call the verify API from ${site.domain}'s backend for each request, and signed agents show up here.`
              }
              action={
                <div className="flex gap-2">
                  <Button onClick={() => setInstall(site)}>{site.kind === "website" || site.kind === "web_app" ? "Install" : "Set up"}</Button>
                  {(site.kind === "website" || site.kind === "web_app") && (
                    <a href={`/aa/demo/${site.siteKey}`} target="_blank" rel="noreferrer">
                      <Button variant="primary">Open demo store</Button>
                    </a>
                  )}
                </div>
              }
            />
          ) : (
            <div className={cn("space-y-6 transition-opacity", loading && "opacity-80")}>
              <Kpis data={data} />

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="min-w-0 p-5 lg:col-span-2">
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <h2 className="font-semibold">Sessions by who drove them</h2>
                    <span className="text-[12px] text-muted">{num(data.totals.sessions)} sessions</span>
                  </div>
                  <div className="mb-4">
                    <Legend counts={data.totals.byClass} />
                  </div>
                  <DailyChart daily={data.daily} />
                </Card>
                <Card className="min-w-0 p-5">
                  <h2 className="font-semibold">Trust tiers</h2>
                  <p className="mb-4 text-[12px] text-muted">How much each session proved about itself</p>
                  <BarList
                    rows={Object.entries(TIER_META).map(([t, m]) => ({
                      key: t,
                      label: (
                        <span>
                          <span className="font-mono text-[11px] text-muted">{t}</span> {m.name}
                        </span>
                      ),
                      value: data.totals.byTier[t] ?? 0,
                      hint: m.blurb,
                    }))}
                  />
                  {data.totals.hybrid > 0 && (
                    <p className="mt-4 text-[12px] text-muted">
                      {data.totals.hybrid} hybrid session{data.totals.hybrid === 1 ? "" : "s"}: a person handed off to an agent (or took back control) mid-session.
                    </p>
                  )}
                </Card>
              </div>

              <Acquisition data={data} />

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="min-w-0 p-5">
                  <h2 className="font-semibold">Tasks</h2>
                  <p className="mb-3 text-[12px] text-muted">Completion by actor. Report tasks with window.aa.task(name, state).</p>
                  {data.taskBreakdown.length ? (
                    <table className="w-full text-[13px]">
                      <thead className="text-left text-[11px] text-muted">
                        <tr>
                          <th className="py-1 font-medium">Task</th>
                          <th className="py-1 text-right font-medium">Agent runs</th>
                          <th className="py-1 text-right font-medium">Agent success</th>
                          <th className="py-1 text-right font-medium">Human success</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.taskBreakdown.map((t) => (
                          <tr key={t.name} className="border-t border-line">
                            <td className="py-2 font-medium">{t.name}</td>
                            <td className="py-2 text-right tabular-nums">{t.agentStarted}</td>
                            <td className="py-2 text-right tabular-nums">
                              {t.agentStarted ? pct(t.agentCompleted / t.agentStarted) : "—"}
                              {t.agentFailed > 0 && <span className="ml-1 text-[11px] text-danger">{t.agentFailed} failed</span>}
                            </td>
                            <td className="py-2 text-right tabular-nums">{t.humanStarted ? pct(t.humanCompleted / t.humanStarted) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted">No tasks reported yet.</p>
                  )}
                </Card>

                <Card className="min-w-0 p-5">
                  <h2 className="font-semibold">Agents on this site</h2>
                  <p className="mb-3 text-[12px] text-muted">Identified by verified signatures only</p>
                  {data.agents.length ? (
                    <table className="w-full text-[13px]">
                      <thead className="text-left text-[11px] text-muted">
                        <tr>
                          <th className="py-1 font-medium">Agent</th>
                          <th className="py-1 text-right font-medium">Requests</th>
                          <th className="py-1 text-right font-medium">Sessions</th>
                          <th className="py-1 text-right font-medium">Task success</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.agents.map((a) => (
                          <tr key={a.agentId} className="border-t border-line">
                            <td className="py-2">
                              <div className="font-medium">{a.name}</div>
                              <div className="text-[11px] text-muted">
                                {a.operator} · <StatusBadge status={a.status} />
                              </div>
                            </td>
                            <td className="py-2 text-right tabular-nums">{num(a.requests)}</td>
                            <td className="py-2 text-right tabular-nums">{a.sessions}</td>
                            <td className="py-2 text-right tabular-nums">{pct(a.tasks.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted">No signed agents yet. Agents register in the Agent registry and sign requests with Web Bot Auth.</p>
                  )}
                </Card>
              </div>

              <Card className="min-w-0 p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Sessions</h2>
                    <p className="text-[12px] text-muted">Click a session to see the evidence behind its label</p>
                  </div>
                </div>
                <div className="-mx-5 overflow-x-auto px-5">
                  <table className="w-full min-w-[760px] text-[13px]">
                    <thead className="text-left text-[11px] text-muted">
                      <tr>
                        <th className="py-1 font-medium">Last seen</th>
                        <th className="py-1 font-medium">Driven by</th>
                        <th className="py-1 font-medium">Source</th>
                        <th className="py-1 text-right font-medium">P(agent)</th>
                        <th className="py-1 pl-5 font-medium">Tier</th>
                        <th className="py-1 font-medium">Agent</th>
                        <th className="py-1 text-right font-medium">Pages</th>
                        <th className="py-1 pl-5 font-medium">Tasks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((s) => (
                        <tr key={s.id} onClick={() => setSession(s)} className="cursor-pointer border-t border-line hover:bg-surface-2">
                          <td className="py-2 whitespace-nowrap text-muted">{ago(new Date(s.lastAt).getTime())}</td>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-2">
                              <ClassLabel cls={s.cls} />
                              {s.hybrid && <Badge>hybrid</Badge>}
                            </span>
                          </td>
                          <td className="max-w-[12rem] py-2">
                            <div className="truncate text-[13px]" title={`${s.source} / ${s.medium}`}>
                              {s.source}
                            </div>
                            <div className="truncate text-[11px] text-muted">{s.channel}</div>
                          </td>
                          <td className="py-2 text-right tabular-nums">{s.pAgent.toFixed(2)}</td>
                          <td className="py-2 pl-5 font-mono text-[12px]">{s.tier}</td>
                          <td className="py-2">{s.agentName ?? <span className="text-muted">—</span>}</td>
                          <td className="py-2 text-right tabular-nums">{s.pages}</td>
                          <td className="py-2 pl-5 text-[12px] text-fg-2">
                            {Object.entries(s.tasks)
                              .map(([n, t]) => `${n} ${t.complete ? "✓" : t.fail ? "✗" : "…"}`)
                              .join(", ") || <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="min-w-0 p-5">
                  <h2 className="font-semibold">Verification</h2>
                  <p className="mb-4 text-[12px] text-muted">Signed requests, from the script tag or your edge</p>
                  <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Checked", data.requests.total],
                      ["Signed ok", data.requests.signedValid],
                      ["Failed", data.requests.signedInvalid],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-lg bg-surface-2 py-2">
                        <div className="text-lg font-semibold tabular-nums">{num(v as number)}</div>
                        <div className="text-[11px] text-muted">{l}</div>
                      </div>
                    ))}
                  </div>
                  {data.requests.failures.length > 0 && (
                    <>
                      <div className="mb-2 text-[12px] font-medium text-muted">Why signatures failed</div>
                      <BarList rows={data.requests.failures.map((f) => ({ key: f.reason, label: humanize(f.reason), value: f.n }))} />
                    </>
                  )}
                </Card>
                <Card className="min-w-0 p-5 lg:col-span-2">
                  <h2 className="mb-3 font-semibold">Recent requests</h2>
                  {data.recentRequests.length ? (
                    <div className="-mx-5 max-h-80 overflow-auto px-5">
                      <table className="w-full min-w-[560px] text-[13px]">
                        <thead className="sticky top-0 bg-surface text-left text-[11px] text-muted">
                          <tr>
                            <th className="py-1 font-medium">When</th>
                            <th className="py-1 font-medium">Path</th>
                            <th className="py-1 pl-3 font-medium">Tier</th>
                            <th className="py-1 font-medium">Who</th>
                            <th className="py-1 font-medium">Decision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentRequests.map((r, i) => (
                            <tr key={i} className="border-t border-line">
                              <td className="py-1.5 whitespace-nowrap text-muted">{ago(new Date(r.at).getTime())}</td>
                              <td className="max-w-[14rem] truncate py-1.5 font-mono text-[12px]" title={r.path}>
                                {r.method} {r.path}
                              </td>
                              <td className="py-1.5 pl-3 font-mono text-[12px]">{r.tier}</td>
                              <td className="max-w-[12rem] truncate py-1.5" title={r.ua ?? ""}>
                                {r.agentName ?? r.declared ?? (r.verifyStatus === "invalid" ? humanize(r.verifyReason ?? "invalid") : <span className="text-muted">browser</span>)}
                              </td>
                              <td className="py-1.5">
                                <Badge tone={DECISION_TONE[r.decision] ?? "neutral"}>{humanize(r.decision)}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No signed requests yet. Agents that sign their traffic are verified automatically through the script tag.</p>
                  )}
                </Card>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!confirm(`Delete ${site.name} and all its analytics?`)) return;
                try {
                  await api(`/api/aa/sites/${site.id}`, { method: "DELETE" });
                  toast(`${site.name} deleted`);
                  setSiteId(null);
                  loadSites();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <Trash2 size={14} /> Delete {KIND_META[site.kind].noun}
            </Button>
          </div>
        </>
      )}

      <AddSite
        used={sites?.length ?? 0}
        limit={limit}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(s) => {
          setAdding(false);
          setSites((cur) => [...(cur ?? []), s]);
          setSiteId(s.id);
          setInstall(s);
        }}
      />
      <Install site={install} onClose={() => setInstall(null)} />
      <SessionDetail session={session} onClose={() => setSession(null)} />
    </div>
  );
}

function Kpis({ data }: { data: Overview }) {
  const agentTasks = [data.tasks.verified_agent, data.tasks.agent].reduce((s, t) => ({ started: s.started + t.started, completed: s.completed + t.completed }), { started: 0, completed: 0 });
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Sessions" value={num(data.totals.sessions)} sub={`${num(data.totals.byClass.human)} human · ${num(data.totals.byClass.uncertain)} uncertain`} />
      <Kpi label="Agent share" value={pct(data.totals.agentShare)} sub="of sessions were driven by an agent" />
      <Kpi label="Verified agents" value={pct(data.totals.verifiedShare)} sub="of agent sessions proved their identity" />
      <Kpi
        label="Agent task success"
        value={agentTasks.started ? pct(agentTasks.completed / agentTasks.started) : "—"}
        sub={data.tasks.human.rate != null ? `Humans: ${pct(data.tasks.human.rate)}` : "No human tasks yet"}
      />
    </div>
  );
}

function Acquisition({ data }: { data: Overview }) {
  const [dim, setDim] = useState<Dimension>("channels");
  const [model, setModel] = useState<"last" | "first">("last");
  const d = DIMENSIONS.find((x) => x.value === dim)!;
  const rows = dim === "channels" && model === "first" ? data.attribution.firstTouchChannels : data.attribution[dim];
  return (
    <Card className="min-w-0 p-5">
      <h2 className="font-semibold">Acquisition</h2>
      <p className="mb-3 text-[12px] text-muted">
        Where sessions came from, and who drove them. A conversion is a session that completed a task.
        {dim === "channels" && (model === "last" ? " Last touch: the channel that started the session." : " First touch: the channel that first brought this browser (90 days).")}
      </p>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented className="max-w-full overflow-x-auto" value={dim} onChange={setDim} options={DIMENSIONS.map((x) => ({ value: x.value, label: x.label }))} />
        {dim === "channels" && (
          <Segmented
            value={model}
            onChange={setModel}
            options={[
              { value: "last", label: "Last touch" },
              { value: "first", label: "First touch" },
            ]}
          />
        )}
      </div>
      <div className="mb-3">
        <Legend />
      </div>
      <AttributionTable rows={rows} dimension={d.column} empty={d.empty} />
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "approved" ? "ok" : status === "suspended" ? "danger" : "warn"}>{status}</Badge>;
}

function AddSite({ open, onClose, onCreated, used, limit }: { open: boolean; onClose: () => void; onCreated: (s: Site) => void; used: number; limit: number }) {
  const { toast } = useStore();
  const [kind, setKind] = useState<PropertyKind>("website");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [appId, setAppId] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = KIND_META[kind];
  const full = used >= limit;
  return (
    <Modal open={open} onClose={onClose} title="Add a site or app">
      <form
        className="space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const { site } = await api<{ site: Site }>("/api/aa/sites", { method: "POST", body: { kind, name, domain, appId: kind === "mobile_app" ? appId : undefined } });
            setName("");
            setDomain("");
            setAppId("");
            onCreated(site);
          } catch (err) {
            toast((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">What are you adding?</legend>
          <div className="grid grid-cols-2 gap-2">
            {KIND_ORDER.map((k) => {
              const m = KIND_META[k];
              const Icon = m.icon;
              return (
                <label
                  key={k}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                    kind === k ? "border-accent bg-accent-soft/40" : "border-line hover:border-line-strong",
                  )}
                >
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                  <Icon size={16} className={cn("mt-0.5 shrink-0", kind === k ? "text-accent" : "text-muted")} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{m.label}</span>
                    <span className="block text-[12px] leading-snug text-muted">{m.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder={meta.namePlaceholder} className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
        </label>
        {kind === "mobile_app" && (
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Bundle ID / package name</span>
            <input value={appId} onChange={(e) => setAppId(e.target.value)} required placeholder="com.example.shop" className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm" />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">{meta.domainLabel}</span>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} required placeholder={meta.domainPlaceholder} className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
          <span className="mt-1 block text-[12px] text-muted">{meta.domainHint}</span>
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className={cn("text-[12px] tabular-nums", full ? "text-danger" : "text-muted")}>
            {full ? `You've reached ${limit} sites and apps. Delete one to add another.` : `${used} of ${limit} used`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || full}>
              Add {meta.label.toLowerCase()}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Searchable switcher across up to 100 sites and apps. */
function PropertySwitcher({ sites, current, limit, onSelect, onAdd }: { sites: Site[]; current: Site | null; limit: number; onSelect: (id: string) => void; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = sites.filter((s) => !needle || `${s.name} ${s.domain} ${s.appId ?? ""}`.toLowerCase().includes(needle));
  const groups = [
    { title: "Sites", rows: shown.filter((s) => s.kind === "website") },
    { title: "Apps", rows: shown.filter((s) => s.kind !== "website") },
  ].filter((g) => g.rows.length);
  const Icon = current ? KIND_META[current.kind].icon : Globe;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 max-w-[18rem] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm shadow-sm hover:border-line-strong"
      >
        <Icon size={15} className="shrink-0 text-muted" />
        <span className="truncate font-medium">{current?.name ?? "Choose"}</span>
        <span className="hidden truncate text-muted sm:inline">{current?.domain}</span>
        <ChevronsUpDown size={14} className="ml-auto shrink-0 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-pop absolute right-0 z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface shadow-pop">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search size={14} className="text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sites and apps" className="h-10 w-full bg-transparent text-sm outline-none" />
            </div>
            <div className="max-h-80 overflow-y-auto p-1" role="listbox">
              {groups.map((g) => (
                <div key={g.title}>
                  <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{g.title}</div>
                  {g.rows.map((s) => {
                    const K = KIND_META[s.kind].icon;
                    return (
                      <button
                        key={s.id}
                        role="option"
                        aria-selected={s.id === current?.id}
                        onClick={() => {
                          onSelect(s.id);
                          setOpen(false);
                          setQ("");
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                      >
                        <K size={15} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{s.name}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {KIND_META[s.kind].label} · {s.appId ?? s.domain}
                          </span>
                        </span>
                        {s.id === current?.id && <Check size={14} className="shrink-0 text-accent" />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {!groups.length && <p className="px-3 py-6 text-center text-sm text-muted">No matches</p>}
            </div>
            <div className="flex items-center justify-between border-t border-line p-2">
              <span className="px-1 text-[12px] tabular-nums text-muted">
                {sites.length} of {limit}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={sites.length >= limit}
                onClick={() => {
                  setOpen(false);
                  onAdd();
                }}
              >
                <Plus size={14} /> Add site or app
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Install({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const { toast } = useStore();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [status, setStatus] = useState<{ lastEventAt: string | null; sessions24h: number; lastVerifiedRequestAt: string | null } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const siteId = site?.id;

  // Poll until the first visit arrives, so people know the tag works.
  useEffect(() => {
    setStatus(null);
    setSecret(site?.secret ?? null);
    if (!siteId) return;
    let stop = false;
    const check = async () => {
      try {
        const s = await api<{ lastEventAt: string | null; sessions24h: number; lastVerifiedRequestAt: string | null }>(`/api/aa/sites/${siteId}?check=1`);
        if (!stop) setStatus(s);
      } catch {
        /* keep polling */
      }
    };
    check();
    const t = setInterval(check, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [siteId, site?.secret]);

  if (!site) return null;
  const tag = `<script defer src="${origin}/aa.js"
        data-site="${site.siteKey}"></script>`;
  const browser = site.kind === "website" || site.kind === "web_app";
  const live = !!status?.lastEventAt || (!browser && !!status?.lastVerifiedRequestAt);

  const rotate = async () => {
    if (!confirm("Create a new server secret? The current one stops working immediately.")) return;
    try {
      setSecret((await api<{ secret: string }>(`/api/aa/sites/${site.id}`, { method: "POST", body: { action: "rotate_secret" } })).secret);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const secretBlock = secret ? (
    <div className="rounded-xl border border-warn/30 bg-warn-soft/60 p-3">
      <div className="mb-2 text-[13px] font-medium">Server secret: copy it now, it&apos;s shown once</div>
      <CopyField value={secret} />
    </div>
  ) : (
    <p className="text-[12px] text-muted">
      Lost the server secret?{" "}
      <button onClick={rotate} className="text-accent hover:underline">
        Create a new one
      </button>
      .
    </p>
  );

  const verifyCurl = `curl -X POST ${origin}/api/aa/verify \\
  -H "Authorization: Bearer $AA_SITE_SECRET" \\
  -H "content-type: application/json" \\
  -d '{"method":"GET","url":"https://${site.domain}/","headers":{"signature":"…","signature-input":"…","signature-agent":"…","user-agent":"…"},"ip":"203.0.113.9"}'`;

  return (
    <Modal open={!!site} onClose={onClose} title={`Set up ${site.name}`} className="sm:max-w-2xl">
      <div className="space-y-5 p-5 text-sm">
        {browser ? (
          <>
            <div>
              <div className="mb-1 font-medium">Paste this in the &lt;head&gt; of every page</div>
              <p className="mb-2 text-[13px] text-muted">
                That&apos;s the whole setup. It classifies every visit as human or agent, attributes it to a channel, and verifies agents that sign their requests. Under 5 KB; never reads
                keystrokes, form values or page text.
              </p>
              <CopyField multiline value={tag} />
            </div>

            <div
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px]",
                live ? "border-ok/30 bg-ok/10 text-fg" : "border-line bg-surface-2 text-fg-2",
              )}
              role="status"
            >
              {live ? <Check size={16} className="shrink-0 text-ok" /> : <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" />}
              {live ? (
                <span>
                  Receiving data. Last visit {ago(new Date(status!.lastEventAt!).getTime())}
                  {status!.sessions24h ? ` · ${num(status!.sessions24h)} in the last 24 hours` : ""}.
                </span>
              ) : (
                <span>
                  Waiting for the first visit… Open {site.domain} in a browser after adding the tag
                  {site.kind === "website" && (
                    <>
                      , or try the{" "}
                      <a className="text-accent hover:underline" href={`/aa/demo/${site.siteKey}`} target="_blank" rel="noreferrer">
                        demo store
                      </a>
                    </>
                  )}
                  .
                </span>
              )}
            </div>

            <details className="group rounded-xl border border-line">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium text-fg-2 select-none hover:text-fg">
                <span className="inline-block transition-transform group-open:rotate-90">›</span> Where does it go? Next.js, WordPress, Shopify, Google Tag Manager
              </summary>
              <ul className="space-y-1.5 border-t border-line px-3 py-3 text-[13px] text-fg-2">
                <li>
                  <b className="font-medium text-fg">Next.js:</b> add it inside <code className="font-mono text-[12px]">&lt;head&gt;</code> in <code className="font-mono text-[12px]">app/layout.tsx</code>.
                </li>
                <li>
                  <b className="font-medium text-fg">WordPress:</b> a header-scripts plugin, or your theme&apos;s <code className="font-mono text-[12px]">header.php</code> before{" "}
                  <code className="font-mono text-[12px]">&lt;/head&gt;</code>.
                </li>
                <li>
                  <b className="font-medium text-fg">Shopify:</b> Online Store → Themes → Edit code → <code className="font-mono text-[12px]">theme.liquid</code>, before{" "}
                  <code className="font-mono text-[12px]">&lt;/head&gt;</code>.
                </li>
                <li>
                  <b className="font-medium text-fg">Google Tag Manager:</b> a Custom HTML tag with the snippet, triggered on All Pages.
                </li>
              </ul>
            </details>

            <details className="group rounded-xl border border-line">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium text-fg-2 select-none hover:text-fg">
                <span className="inline-block transition-transform group-open:rotate-90">›</span> Optional: track goals, and act on agents at your edge
              </summary>
              <div className="space-y-4 border-t border-line px-3 py-3">
                <div>
                  <div className="mb-1 text-[13px] font-medium">Track goals</div>
                  <p className="mb-2 text-[12px] text-muted">See who completes checkout or sign-up, by channel and by human vs agent.</p>
                  <CopyField multiline value={`window.aa?.task("checkout", "start");   // then "complete" or "fail"`} />
                </div>
                <div>
                  <div className="mb-1 text-[13px] font-medium">Allow, rate-limit or challenge agents before the page loads</div>
                  <p className="mb-2 text-[12px] text-muted">
                    Only if you want to act on agents in your own server or CDN. Forward each request&apos;s method, URL and headers; you get a trust tier and a decision.
                  </p>
                  <CopyField multiline value={verifyCurl} />
                </div>
                {secretBlock}
              </div>
            </details>
          </>
        ) : (
          <>
            <p className="rounded-xl border border-line bg-surface-2 p-3 text-[13px] text-fg-2">
              {site.kind === "mobile_app" ? `${site.appId} · ` : ""}Agents that act through this {KIND_META[site.kind].noun} call{" "}
              <code className="font-mono text-[12px]">{site.domain}</code>. Verify each request there to get its trust tier, the agent behind it and a decision (allow,
              rate-limit or challenge). Screens that run in a web view can also load the script tag for human-vs-agent scoring and attribution.
            </p>
            <div>
              <div className="mb-1 font-medium">Verify requests from your backend</div>
              <CopyField multiline value={verifyCurl} />
            </div>
            {secretBlock}
            <div
              className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px]", live ? "border-ok/30 bg-ok/10" : "border-line bg-surface-2 text-fg-2")}
              role="status"
            >
              {live ? <Check size={16} className="shrink-0 text-ok" /> : <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" />}
              {live ? "Receiving data." : "Waiting for the first verified request…"}
            </div>
          </>
        )}
        <p className="text-[12px] text-muted">
          Key: <code className="font-mono">{site.siteKey}</code>
        </p>
      </div>
    </Modal>
  );
}
function SessionDetail({ session, onClose }: { session: SessionRow | null; onClose: () => void }) {
  if (!session) return null;
  const s = session;
  const t0 = s.segments[0]?.from ?? 0;
  const span = Math.max(1, (s.segments[s.segments.length - 1]?.to ?? 1) - t0);
  const maxLlr = Math.max(1, ...s.evidence.map((e) => Math.abs(e.llr)));
  return (
    <Modal open onClose={onClose} title="Session evidence" className="sm:max-w-2xl">
      <div className="space-y-5 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <ClassLabel cls={s.cls} />
          <span className="text-muted">P(agent) {s.pAgent.toFixed(3)}</span>
          <span className="font-mono text-[12px]">
            {s.tier} · {TIER_META[s.tier]?.name}
          </span>
          {s.agentName && <Badge tone="accent">{s.agentName}</Badge>}
          {s.hybrid && <Badge>hybrid</Badge>}
        </div>
        {s.cls === "verified_agent" && (
          <p className="text-[13px] text-fg-2">This session carried a verified identity, so it counts as an agent whatever its behaviour looks like. The behavioural evidence is shown for reference.</p>
        )}
        {s.segments.length > 1 && (
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-muted">Who was in control, over time</div>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
              {s.segments.map((g, i) => (
                <div
                  key={i}
                  title={`${g.state} · ${Math.round((g.to - g.from) / 1000)}s`}
                  style={{ width: `${((g.to - g.from) / span) * 100}%`, background: g.state === "agent" ? CLASS_META.agent.color : CLASS_META.human.color }}
                />
              ))}
            </div>
            <div className="mt-1 flex gap-4 text-[11px] text-muted">
              <ClassLabel cls="human" /> <ClassLabel cls="agent" />
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 text-[12px] font-medium text-muted">Evidence (log-likelihood ratio: right = agent, left = human)</div>
          {s.evidence.length ? (
            <div className="space-y-2">
              {s.evidence.map((e) => (
                <div key={e.feature} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px]">{e.note}</div>
                    <div className="text-[11px] text-muted">
                      {humanize(e.feature)} = {e.value} · n={e.n}
                    </div>
                  </div>
                  <div className="relative h-2 rounded-full bg-surface-2" title={`LLR ${e.llr}`}>
                    <div className="absolute top-[-3px] left-1/2 h-[14px] w-px bg-line-strong" />
                    <div
                      className="absolute h-2 rounded-[4px]"
                      style={{
                        background: e.llr > 0 ? CLASS_META.agent.color : CLASS_META.human.color,
                        left: e.llr > 0 ? "50%" : `${50 - (Math.abs(e.llr) / maxLlr) * 50}%`,
                        width: `${(Math.abs(e.llr) / maxLlr) * 50}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">Not enough behaviour recorded yet.</p>
          )}
        </div>
        <div>
          <div className="mb-2 text-[12px] font-medium text-muted">Where it came from</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
            {[
              ["Channel", s.channel],
              ["Source / medium", `${s.source} / ${s.medium}`],
              ["Campaign", s.campaign ?? "—"],
              ["Referrer", s.referrer ?? "—"],
              ["Landing page", s.landing ?? "—"],
              ["First touch", s.firstTouch ? `${s.firstTouch.channel} · ${s.firstTouch.source}` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-muted">{k}</dt>
                <dd className="truncate" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <div>
            <div className="text-muted">Pages</div>
            {s.pages}
          </div>
          <div>
            <div className="text-muted">Duration</div>
            {Math.round(s.durationMs / 1000)}s
          </div>
          <div className="min-w-0">
            <div className="text-muted">User agent</div>
            <div className="truncate" title={s.ua ?? ""}>
              {s.ua ?? "—"}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
