"use client";

import { Activity, ExternalLink, Globe, Plus, Radar, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, BarList, ClassLabel, CLASS_META, CopyField, DailyChart, humanize, Kpi, Legend, num, pct, TIER_META, type ActorClass } from "@/components/aa";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, Empty, Modal, Segmented } from "@/components/ui";
import { useStore } from "@/lib/store";
import { ago, cn } from "@/lib/utils";

interface Site {
  id: string;
  name: string;
  domain: string;
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
}

type Tally = { started: number; completed: number; failed: number; rate: number | null };

interface Overview {
  days: number;
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
  const [siteId, setSiteId] = useState<string | null>(null);
  const [days, setDays] = useState<"1" | "7" | "30">("7");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [install, setInstall] = useState<Site | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);

  const loadSites = useCallback(async () => {
    const { sites } = await api<{ sites: Site[] }>("/api/aa/sites");
    setSites(sites);
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
          sites?.length ? (
            <>
              <select
                value={siteId ?? ""}
                onChange={(e) => setSiteId(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm shadow-sm"
                aria-label="Site"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.domain}
                  </option>
                ))}
              </select>
              <Button onClick={() => setAdding(true)} aria-label="Add site">
                <Plus size={15} />
              </Button>
            </>
          ) : null
        }
      />

      {sites && !sites.length && (
        <Empty
          icon={<Globe size={20} />}
          title="Track your first site"
          body="Add a site, drop one script tag on it, and optionally call the verify API from your edge. Or try it on the built-in demo store."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add a site
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
              <a href={`/aa/demo/${site.siteKey}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost">
                  <ExternalLink size={14} /> Demo store
                </Button>
              </a>
              <Button size="sm" onClick={() => setInstall(site)}>
                Install
              </Button>
            </div>
          </div>

          {!data ? (
            <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
          ) : data.totals.sessions === 0 && data.requests.total === 0 ? (
            <Empty
              icon={<Activity size={20} />}
              title="Waiting for traffic"
              body={`Nothing from ${site.domain} yet. Install the snippet, or open the demo store and browse it yourself — then run an agent against it.`}
              action={
                <div className="flex gap-2">
                  <Button onClick={() => setInstall(site)}>Install</Button>
                  <a href={`/aa/demo/${site.siteKey}`} target="_blank" rel="noreferrer">
                    <Button variant="primary">Open demo store</Button>
                  </a>
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
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead className="text-left text-[11px] text-muted">
                      <tr>
                        <th className="py-1 font-medium">Last seen</th>
                        <th className="py-1 font-medium">Driven by</th>
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
                  <p className="mb-4 text-[12px] text-muted">Requests checked by the verify API</p>
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
                    <p className="text-sm text-muted">Call POST /api/aa/verify from your edge to verify signed agents. See Install.</p>
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
                  toast("Site deleted");
                  setSiteId(null);
                  loadSites();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <Trash2 size={14} /> Delete site
            </Button>
          </div>
        </>
      )}

      <AddSite
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
      <Kpi label="Sessions" value={num(data.totals.sessions)} sub={`${data.totals.byClass.uncertain} uncertain`} />
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

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "approved" ? "ok" : status === "suspended" ? "danger" : "warn"}>{status}</Badge>;
}

function AddSite({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: Site) => void }) {
  const { toast } = useStore();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Add a site">
      <form
        className="space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const { site } = await api<{ site: Site }>("/api/aa/sites", { method: "POST", body: { name, domain } });
            setName("");
            setDomain("");
            onCreated(site);
          } catch (err) {
            toast((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Northstar shop" className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">Domain</span>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} required placeholder="shop.example.com" className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
          <span className="mt-1 block text-[12px] text-muted">Signatures are bound to a host, so the verify API only checks requests for this domain and its subdomains.</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Add site
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Install({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  if (!site) return null;
  return (
    <Modal open={!!site} onClose={onClose} title={`Install on ${site.domain}`} className="sm:max-w-2xl">
      <div className="space-y-5 p-5 text-sm">
        {site.secret && (
          <div className="rounded-xl border border-warn/30 bg-warn-soft/60 p-3">
            <div className="mb-2 font-medium">Server secret — shown once</div>
            <CopyField value={site.secret} />
            <p className="mt-2 text-[12px] text-fg-2">Keep it on your server. It authorises the verify API for {site.domain}.</p>
          </div>
        )}
        <div>
          <div className="mb-1 font-medium">1. Add the script to every page</div>
          <p className="mb-2 text-[13px] text-muted">3.8 KB. Collects timings, pointer positions and counts only — never keystrokes, form values or page text.</p>
          <CopyField multiline value={`<script src="${origin}/aa.js" data-site="${site.siteKey}" defer></script>`} />
        </div>
        <div>
          <div className="mb-1 font-medium">2. Verify signed agents at your edge (recommended)</div>
          <p className="mb-2 text-[13px] text-muted">
            Forward each page request&apos;s method, URL and headers. You get a trust tier, a policy decision and a token (vt). Put the token on the script tag as{" "}
            <code className="font-mono text-[12px]">data-vt</code> so the browser session inherits the verified identity.
          </p>
          <CopyField
            multiline
            value={`curl -X POST ${origin}/api/aa/verify \\
  -H "Authorization: Bearer $AA_SITE_SECRET" \\
  -H "content-type: application/json" \\
  -d '{"method":"GET","url":"https://${site.domain}/","headers":{"signature":"…","signature-input":"…","signature-agent":"…","user-agent":"…"},"ip":"203.0.113.9"}'`}
          />
        </div>
        <div>
          <div className="mb-1 font-medium">3. Report tasks</div>
          <CopyField multiline value={`window.aa?.task("checkout", "start");   // then "complete" or "fail"`} />
        </div>
        <p className="text-[12px] text-muted">
          Site key: <code className="font-mono">{site.siteKey}</code>. Want to see it work first? Open the{" "}
          <a className="text-accent hover:underline" href={`/aa/demo/${site.siteKey}`} target="_blank" rel="noreferrer">
            demo store
          </a>{" "}
          — it&apos;s already wired to this site.
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
