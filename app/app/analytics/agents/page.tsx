"use client";

import { Bot, Download, KeyRound, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, BarList, CopyField, humanize, Kpi, num, pct } from "@/components/aa";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, Empty, Modal } from "@/components/ui";
import { generateAgentKey } from "@/lib/aa/verifier/httpsig";
import { useStore } from "@/lib/store";
import { ago } from "@/lib/utils";

interface Key {
  kid: string;
  createdAt: string;
  revokedAt: string | null;
}
interface Outcomes {
  requests: number;
  sites: number;
  acceptanceRate: number | null;
  byDecision: { decision: string; n: number }[];
  failures: { reason: string; n: number }[];
  sessions: number;
  tasks: { started: number; completed: number; failed: number; rate: number | null };
}
interface Agent {
  id: string;
  name: string;
  operator: string;
  contact: string;
  purpose: string;
  actuation: string;
  principalModel: string;
  ratePerMin: number;
  status: "pending" | "approved" | "suspended";
  reviewNote: string | null;
  createdAt: string;
  keys: Key[];
  card: { tier: string; jwks_uri: string; signature_agent: string };
  outcomes: Outcomes;
}

const STATUS: Record<Agent["status"], { tone: "ok" | "warn" | "danger"; label: string; tier: string }> = {
  pending: { tone: "warn", label: "Awaiting review", tier: "T2 Signed" },
  approved: { tone: "ok", label: "Approved", tier: "T3 Registered" },
  suspended: { tone: "danger", label: "Suspended", tier: "T1 Declared" },
};

function downloadKey(name: string, jwk: unknown) {
  const blob = new Blob([JSON.stringify(jwk, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-private-key.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function AgentRegistryPage() {
  const { mode, toast } = useStore();
  const [data, setData] = useState<{ origin: string; admin: boolean; agents: Agent[] } | null>(null);
  const [registering, setRegistering] = useState(false);
  const [fresh, setFresh] = useState<{ agent: Agent; privateJwk: unknown } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/aa/agents"));
    } catch (e) {
      toast((e as Error).message);
    }
  }, [toast]);
  useEffect(() => {
    if (mode === "account") load();
  }, [mode, load]);

  if (mode !== "account")
    return (
      <div>
        <PageHeader title="Agent registry" subtitle="Give your agent a verifiable identity so sites let it through." />
        <Empty
          icon={<Bot size={20} />}
          title="Create an account to register agents"
          body="Registered agents get keys, a public directory entry and cross-site outcomes."
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
        title="Agent registry"
        subtitle="Build agents? Register them, sign every request with Web Bot Auth, and see where they're welcome — and where they fail."
        actions={
          <Button variant="primary" onClick={() => setRegistering(true)}>
            <Plus size={15} /> Register agent
          </Button>
        }
      />

      {data && (
        <Card className="mb-6 p-4 text-[13px] text-fg-2">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              Agents sign with <span className="font-medium text-fg">Signature-Agent: &quot;{data.origin}&quot;</span>. Our public key directory is at{" "}
              <a className="font-mono text-[12px] text-accent hover:underline" href="/.well-known/http-message-signatures-directory" target="_blank" rel="noreferrer">
                /.well-known/http-message-signatures-directory
              </a>
              , so any Web Bot Auth verifier can check your agent, not only ours. New agents are <span className="font-medium text-fg">T2 Signed</span>; a registry
              review of the operator lifts them to <span className="font-medium text-fg">T3 Registered</span>.
            </div>
          </div>
        </Card>
      )}

      {data && !data.agents.length && (
        <Empty
          icon={<KeyRound size={20} />}
          title="No agents yet"
          body="Register an agent to get a signing key and a directory entry. The private key is generated in your browser and never sent to us."
          action={
            <Button variant="primary" onClick={() => setRegistering(true)}>
              Register agent
            </Button>
          }
        />
      )}

      <div className="space-y-4">
        {data?.agents.map((a) => (
          <AgentCard key={a.id} agent={a} onChange={load} />
        ))}
      </div>

      {data?.admin && <ReviewQueue onChange={load} />}

      <Register
        open={registering}
        onClose={() => setRegistering(false)}
        onCreated={(agent, privateJwk) => {
          setRegistering(false);
          setFresh({ agent, privateJwk });
          load();
        }}
      />
      {fresh && <KeyIssued agent={fresh.agent} privateJwk={fresh.privateJwk} origin={data?.origin ?? ""} onClose={() => setFresh(null)} />}
    </div>
  );
}

function AgentCard({ agent: a, onChange }: { agent: Agent; onChange: () => void }) {
  const { toast } = useStore();
  const st = STATUS[a.status];
  const o = a.outcomes;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
      onChange();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{a.name}</h2>
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="font-mono text-[11px] text-muted">{st.tier}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-muted">
            {a.operator} · {humanize(a.purpose)} · {humanize(a.actuation)} · {humanize(a.principalModel)} · {a.ratePerMin}/min declared
          </div>
          {a.reviewNote && <div className="mt-1 text-[12px] text-fg-2">Review note: {a.reviewNote}</div>}
        </div>
        <div className="flex gap-2">
          <a href={`/r/${a.id}/card`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost">
              Agent card
            </Button>
          </a>
          {a.status !== "suspended" && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => confirm(`Suspend ${a.name}? Its keys stop verifying everywhere.`) && act(() => api(`/api/aa/agents/${a.id}`, { method: "PATCH", body: { status: "suspended" } }), "Agent suspended")}
            >
              Suspend
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Requests (30d)" value={num(o.requests)} sub={`across ${o.sites} site${o.sites === 1 ? "" : "s"}`} />
        <Kpi label="Acceptance" value={pct(o.acceptanceRate)} sub="allowed without friction" />
        <Kpi label="Task success" value={pct(o.tasks.rate)} sub={`${o.tasks.completed} of ${o.tasks.started} tasks`} />
        <Kpi label="Sessions" value={num(o.sessions)} sub="verified browser sessions" />
      </div>

      {(o.failures.length > 0 || o.byDecision.some((d) => d.decision !== "allow")) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {o.failures.length > 0 && (
            <div>
              <div className="mb-2 text-[12px] font-medium text-muted">Why verification failed</div>
              <BarList rows={o.failures.map((f) => ({ key: f.reason, label: humanize(f.reason), value: f.n }))} />
            </div>
          )}
          <div>
            <div className="mb-2 text-[12px] font-medium text-muted">Site decisions</div>
            <BarList rows={o.byDecision.map((d) => ({ key: d.decision, label: humanize(d.decision), value: d.n }))} />
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-medium text-muted">Signing keys</div>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const k = await generateAgentKey();
              await act(() => api(`/api/aa/agents/${a.id}/keys`, { method: "POST", body: { publicJwk: k.publicJwk } }), "New key added — private key downloaded");
              downloadKey(a.name, k.privateJwk);
            }}
          >
            <KeyRound size={14} /> Rotate: add key
          </Button>
        </div>
        <div className="divide-y divide-line rounded-lg border border-line">
          {a.keys.map((k) => (
            <div key={k.kid} className="flex items-center gap-3 px-3 py-2 text-[12px]">
              <code className="min-w-0 flex-1 truncate font-mono">{k.kid}</code>
              <span className="text-muted">added {ago(new Date(k.createdAt).getTime())}</span>
              {k.revokedAt ? (
                <Badge tone="danger">revoked</Badge>
              ) : (
                <button
                  className="text-danger hover:underline"
                  onClick={() =>
                    confirm("Revoke this key? Requests signed with it fail at once.") &&
                    act(() => api(`/api/aa/agents/${a.id}/keys/${encodeURIComponent(k.kid)}`, { method: "DELETE" }), "Key revoked")
                  }
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-muted">
          Directory for this agent: <code className="font-mono">{a.card.jwks_uri}</code>
        </div>
      </div>
    </Card>
  );
}

const PURPOSES = ["assistant", "shopping", "search", "research", "monitoring", "other"];
const ACTUATIONS = [
  ["hosted_browser", "Hosted browser (cloud)"],
  ["user_browser", "User's own browser"],
  ["api", "HTTP / API client"],
];
const PRINCIPALS = [
  ["consumer_delegated", "Acts for a consumer"],
  ["enterprise", "Acts for a business"],
  ["autonomous", "Autonomous (no live principal)"],
];

function Register({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: Agent, privateJwk: unknown) => void }) {
  const { toast, account } = useStore();
  const [f, setF] = useState({ name: "", operator: "", contact: account?.email ?? "", purpose: "assistant", actuation: "hosted_browser", principalModel: "consumer_delegated", ratePerMin: 60, homepage: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: k === "ratePerMin" ? Number(e.target.value) : e.target.value });
  const input = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm";
  return (
    <Modal open={open} onClose={onClose} title="Register an agent" className="sm:max-w-xl">
      <form
        className="space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            // The key pair is made here; only the public half leaves the browser.
            const key = await generateAgentKey();
            const { agent } = await api<{ agent: Agent }>("/api/aa/agents", { method: "POST", body: { ...f, homepage: f.homepage || undefined, publicJwk: key.publicJwk } });
            downloadKey(f.name, key.privateJwk);
            onCreated(agent, key.privateJwk);
          } catch (err) {
            toast((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Agent name</span>
            <input className={input} value={f.name} onChange={set("name")} required placeholder="Northstar Shopper" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Operator (legal entity)</span>
            <input className={input} value={f.operator} onChange={set("operator")} required placeholder="Northstar Labs Ltd" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Abuse contact</span>
            <input className={input} type="email" value={f.contact} onChange={set("contact")} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Homepage (optional)</span>
            <input className={input} value={f.homepage} onChange={set("homepage")} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Purpose</span>
            <select className={input} value={f.purpose} onChange={set("purpose")}>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Declared rate (requests/min per site)</span>
            <input className={input} type="number" min={1} max={10000} value={f.ratePerMin} onChange={set("ratePerMin")} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">How it acts</span>
            <select className={input} value={f.actuation} onChange={set("actuation")}>
              {ACTUATIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Who it acts for</span>
            <select className={input} value={f.principalModel} onChange={set("principalModel")}>
              {PRINCIPALS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[12px] text-muted">
          An Ed25519 key pair is generated in your browser. The private key downloads as a JSON file and is never sent to agentic.do — keep it with your agent&apos;s secrets.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            <KeyRound size={15} /> Generate key &amp; register
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function KeyIssued({ agent, privateJwk, origin, onClose }: { agent: Agent; privateJwk: unknown; origin: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`${agent.name} is registered`} className="sm:max-w-2xl">
      <div className="space-y-4 p-5 text-sm">
        <p className="text-fg-2">
          Your private key was downloaded. It is the only copy — if you lose it, add a new key and revoke this one. The agent starts at <span className="font-medium">T2 Signed</span>{" "}
          until a registry reviewer approves the operator.
        </p>
        <Button size="sm" onClick={() => downloadKey(agent.name, privateJwk)}>
          <Download size={14} /> Download again
        </Button>
        <div>
          <div className="mb-1 font-medium">Sign each request (Node 20+, any HTTP client)</div>
          <CopyField
            multiline
            value={`// npx tsx scripts/aa-agent.mts --key ./${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-private-key.json https://shop.example/
import { signRequest } from "./lib/aa/verifier/httpsig";
const key = JSON.parse(fs.readFileSync("private-key.json", "utf8"));
const headers = await signRequest({ method: "GET", url }, { key, keyid: key.kid, signatureAgent: "${origin}" });
await fetch(url, { headers: { ...headers, "user-agent": "${agent.name.replace(/[^A-Za-z0-9]/g, "")}/1.0" } });`}
          />
        </div>
        <p className="text-[12px] text-muted">Each request gets a fresh nonce and a 60-second validity window, so captured headers can&apos;t be replayed.</p>
      </div>
    </Modal>
  );
}

function ReviewQueue({ onChange }: { onChange: () => void }) {
  const { toast } = useStore();
  const [agents, setAgents] = useState<(Agent & { workspaceId: string })[] | null>(null);
  const load = useCallback(async () => {
    try {
      setAgents((await api<{ agents: (Agent & { workspaceId: string })[] }>("/api/aa/review")).agents);
    } catch (e) {
      toast((e as Error).message);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);
  const decide = async (id: string, status: "approved" | "suspended") => {
    const note = prompt(status === "approved" ? "Review note (e.g. KYB reference)" : "Reason for suspension") ?? undefined;
    try {
      await api(`/api/aa/agents/${id}`, { method: "PATCH", body: { status, note } });
      toast(status === "approved" ? "Approved — now T3 Registered" : "Suspended");
      load();
      onChange();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  if (!agents) return null;
  return (
    <div className="mt-10">
      <h2 className="mb-1 text-lg font-semibold">Registry review</h2>
      <p className="mb-3 text-[13px] text-muted">You&apos;re a registry reviewer. Approve an agent once its operator checks out; suspend it on abuse.</p>
      <Card className="divide-y divide-line">
        {agents.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {a.name} <span className="font-normal text-muted">by {a.operator}</span>
              </div>
              <div className="text-[12px] text-muted">
                {a.contact} · {humanize(a.purpose)} · {humanize(a.actuation)} · registered {ago(new Date(a.createdAt).getTime())}
              </div>
            </div>
            <Badge tone={STATUS[a.status].tone}>{a.status}</Badge>
            {a.status !== "approved" && (
              <Button size="sm" variant="soft" onClick={() => decide(a.id, "approved")}>
                Approve
              </Button>
            )}
            {a.status !== "suspended" && (
              <Button size="sm" variant="ghost" onClick={() => decide(a.id, "suspended")}>
                Suspend
              </Button>
            )}
          </div>
        ))}
        {!agents.length && <div className="p-4 text-sm text-muted">Nothing to review.</div>}
      </Card>
    </div>
  );
}
