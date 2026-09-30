"use client";

import { ChevronLeft, ChevronRight, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, KIND_META, Kpi, num, type PropertyKind } from "@/components/aa";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, Empty, Modal, Segmented } from "@/components/ui";
import { useStore } from "@/lib/store";
import { ago, cn } from "@/lib/utils";

type Sort = "created" | "active" | "sessions" | "properties";

interface AccountRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  signIn: "password" | "google" | "both";
  createdAt: string;
  lastSignInAt: string | null;
  sites: number;
  apps: number;
  agents: number;
  sessions7d: number;
  lastEventAt: string | null;
}

interface Overview {
  totals: { accounts: number; verified: number; new7d: number; sites: number; apps: number; activeProperties: number; sessions7d: number; agents: number };
  accounts: AccountRow[];
  page: number;
  pages: number;
  matched: number;
  pageSize: number;
}

interface AccountDetail {
  account: Omit<AccountRow, "sites" | "apps" | "agents" | "sessions7d" | "lastEventAt">;
  properties: {
    id: string;
    name: string;
    kind: PropertyKind;
    domain: string;
    appId: string | null;
    createdAt: string;
    sessions7d: number;
    sessions30d: number;
    humans7d: number;
    agents7d: number;
    lastEventAt: string | null;
  }[];
  agents: { id: string; name: string; operator: string; status: string; createdAt: string }[];
}

const when = (iso: string | null) => (iso ? ago(new Date(iso).getTime()) : "—");
const SIGN_IN: Record<AccountRow["signIn"], string> = { password: "Password", google: "Google", both: "Password + Google" };

export default function AdminPage() {
  const { account } = useStore();
  const [data, setData] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("created");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Overview>(`/api/admin/overview?q=${encodeURIComponent(query)}&page=${page}&sort=${sort}`));
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, [query, page, sort]);

  useEffect(() => {
    if (account?.superAdmin) load();
  }, [account?.superAdmin, load]);

  if (!account?.superAdmin || denied)
    return (
      <Empty
        icon={<ShieldAlert size={20} />}
        title="Not available"
        body="This page is for super admins. Access needs a confirmed email listed in SUPER_ADMIN_EMAILS."
      />
    );

  const t = data?.totals;
  return (
    <div>
      <PageHeader title="Admin" subtitle="Every account, and the sites and apps each one tracks." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Accounts" value={t ? num(t.accounts) : "—"} sub={t ? `${num(t.verified)} confirmed · ${num(t.new7d)} new this week` : ""} />
        <Kpi label="Sites" value={t ? num(t.sites) : "—"} sub="websites" />
        <Kpi label="Apps" value={t ? num(t.apps) : "—"} sub="web, mobile and API" />
        <Kpi label="Sessions, 7 days" value={t ? num(t.sessions7d) : "—"} sub={t ? `across ${num(t.activeProperties)} active sites and apps` : ""} />
      </div>

      <Card className="mt-6 min-w-0 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 sm:w-72">
            <Search size={14} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" className="w-full bg-transparent text-sm outline-none" aria-label="Search accounts" />
          </label>
          <Segmented
            className="max-w-full overflow-x-auto"
            value={sort}
            onChange={(v) => {
              setSort(v);
              setPage(1);
            }}
            options={[
              { value: "created", label: "Newest" },
              { value: "active", label: "Recently active" },
              { value: "sessions", label: "Most sessions" },
              { value: "properties", label: "Most sites & apps" },
            ]}
          />
        </div>

        <div className={cn("-mx-5 overflow-x-auto px-5 transition-opacity", loading && "opacity-70")}>
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="text-left text-[11px] text-muted">
              <tr>
                <th className="py-1 font-medium">Account</th>
                <th className="py-1 font-medium">Sign-in</th>
                <th className="py-1 font-medium">Joined</th>
                <th className="py-1 font-medium">Last sign-in</th>
                <th className="py-1 text-right font-medium">Sites</th>
                <th className="py-1 text-right font-medium">Apps</th>
                <th className="py-1 text-right font-medium">Agents</th>
                <th className="py-1 text-right font-medium">Sessions (7d)</th>
                <th className="py-1 pl-5 font-medium">Last traffic</th>
              </tr>
            </thead>
            <tbody>
              {data?.accounts.map((a) => (
                <tr key={a.id} onClick={() => setOpen(a.id)} className="cursor-pointer border-t border-line hover:bg-surface-2">
                  <td className="max-w-[16rem] py-2">
                    <div className="truncate font-medium">{a.name || "—"}</div>
                    <div className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                      {a.email}
                      {!a.emailVerified && <Badge tone="warn">unconfirmed</Badge>}
                    </div>
                  </td>
                  <td className="py-2 text-fg-2">{SIGN_IN[a.signIn]}</td>
                  <td className="py-2 whitespace-nowrap text-fg-2">{when(a.createdAt)}</td>
                  <td className="py-2 whitespace-nowrap text-fg-2">{when(a.lastSignInAt)}</td>
                  <td className="py-2 text-right tabular-nums">{num(a.sites)}</td>
                  <td className="py-2 text-right tabular-nums">{num(a.apps)}</td>
                  <td className="py-2 text-right tabular-nums">{num(a.agents)}</td>
                  <td className="py-2 text-right tabular-nums">{num(a.sessions7d)}</td>
                  <td className="py-2 pl-5 whitespace-nowrap text-fg-2">{when(a.lastEventAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.accounts.length && <p className="py-8 text-center text-sm text-muted">{query ? `No accounts match “${query}”.` : "No accounts yet."}</p>}
        </div>

        {data && data.pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-[12px] text-muted">
            <span className="tabular-nums">
              {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.matched)} of {num(data.matched)}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft size={14} />
              </Button>
              <Button size="sm" variant="ghost" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AccountModal id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function AccountModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [d, setD] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    setError(null);
    if (id) api<AccountDetail>(`/api/admin/accounts/${id}`).then(setD, (e: Error) => setError(e.message));
  }, [id]);
  if (!id) return null;
  return (
    <Modal open onClose={onClose} title={d ? d.account.name || d.account.email : "Account"} className="sm:max-w-3xl">
      <div className="space-y-5 p-5 text-sm">
        {error && <p className="text-danger">{error}</p>}
        {!d && !error && <div className="h-40 animate-pulse rounded-xl bg-surface-2" />}
        {d && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-4">
              {[
                ["Email", d.account.email],
                ["Status", d.account.emailVerified ? "Confirmed" : "Unconfirmed"],
                ["Sign-in", SIGN_IN[d.account.signIn]],
                ["Joined", new Date(d.account.createdAt).toLocaleDateString()],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="truncate" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>

            <div>
              <div className="mb-2 font-medium">
                Sites and apps <span className="font-normal text-muted">({d.properties.length})</span>
              </div>
              {d.properties.length ? (
                <div className="-mx-5 overflow-x-auto px-5">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead className="text-left text-[11px] text-muted">
                      <tr>
                        <th className="py-1 font-medium">Name</th>
                        <th className="py-1 font-medium">Type</th>
                        <th className="py-1 font-medium">Domain / app ID</th>
                        <th className="py-1 font-medium">Added</th>
                        <th className="py-1 text-right font-medium">Sessions 7d</th>
                        <th className="py-1 text-right font-medium">Human / agent</th>
                        <th className="py-1 pl-5 font-medium">Last traffic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.properties.map((p) => {
                        const K = KIND_META[p.kind]?.icon;
                        return (
                          <tr key={p.id} className="border-t border-line">
                            <td className="max-w-[12rem] truncate py-2 font-medium">{p.name}</td>
                            <td className="py-2 whitespace-nowrap text-fg-2">
                              <span className="inline-flex items-center gap-1.5">
                                {K && <K size={13} className="text-muted" />}
                                {KIND_META[p.kind]?.label ?? p.kind}
                              </span>
                            </td>
                            <td className="max-w-[14rem] py-2">
                              <div className="truncate">{p.domain}</div>
                              {p.appId && <div className="truncate font-mono text-[11px] text-muted">{p.appId}</div>}
                            </td>
                            <td className="py-2 whitespace-nowrap text-fg-2">{when(p.createdAt)}</td>
                            <td className="py-2 text-right tabular-nums">{num(p.sessions7d)}</td>
                            <td className="py-2 text-right tabular-nums">
                              {num(p.humans7d)} / {num(p.agents7d)}
                            </td>
                            <td className="py-2 pl-5 whitespace-nowrap text-fg-2">{when(p.lastEventAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted">No sites or apps yet.</p>
              )}
            </div>

            <div>
              <div className="mb-2 font-medium">
                Registered agents <span className="font-normal text-muted">({d.agents.length})</span>
              </div>
              {d.agents.length ? (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {d.agents.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{a.name}</span> <span className="text-muted">· {a.operator}</span>
                      </span>
                      <Badge tone={a.status === "approved" ? "ok" : a.status === "suspended" ? "danger" : "warn"}>{a.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">None.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
