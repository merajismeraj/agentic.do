import "server-only";
import type { Evidence, Segment, TaskTally } from "@/lib/aa/scoring";
import { TIERS, type Tier } from "@/lib/aa/verifier";
import { db } from "../db";

export type ActorClass = "verified_agent" | "agent" | "human" | "uncertain";

export interface SessionRow {
  id: string;
  startedAt: string;
  lastAt: string;
  tier: Tier;
  agentId: string | null;
  agentName: string | null;
  pAgent: number;
  label: "human" | "agent" | "uncertain";
  hybrid: boolean;
  pages: number;
  ua: string | null;
  cls: ActorClass;
  evidence: Evidence[];
  segments: Segment[];
  tasks: Record<string, TaskTally>;
  durationMs: number;
}

export interface RequestRow {
  at: string;
  method: string;
  path: string;
  tier: Tier;
  decision: string;
  verifyStatus: string;
  verifyReason: string | null;
  agentId: string | null;
  agentName: string | null;
  declared: string | null;
  ua: string | null;
}

export const classOf = (tier: Tier, label: string): ActorClass =>
  TIERS.indexOf(tier) >= 2 ? "verified_agent" : label === "agent" ? "agent" : label === "human" ? "human" : "uncertain";

const CLASSES: ActorClass[] = ["verified_agent", "agent", "uncertain", "human"];

function tally(sessions: SessionRow[]) {
  const t = { started: 0, completed: 0, failed: 0 };
  for (const s of sessions)
    for (const v of Object.values(s.tasks)) {
      t.started += v.start;
      t.completed += v.complete;
      t.failed += v.fail;
    }
  return { ...t, rate: t.started ? t.completed / t.started : null };
}

export async function siteOverview(siteId: string, days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  const d = await db();
  const { rows: raw } = await d.query<Omit<SessionRow, "cls" | "evidence" | "segments" | "tasks" | "durationMs"> & { score: Record<string, unknown> | null }>(
    `select s.id, s.started_at as "startedAt", s.last_at as "lastAt", s.tier, s.agent_id as "agentId", a.name as "agentName",
       s.p_agent as "pAgent", s.label, s.hybrid, s.pages, s.ua, s.score
     from aa_sessions s left join aa_agents a on a.id = s.agent_id
     where s.site_id = $1 and s.last_at > $2 order by s.last_at desc limit 3000`,
    [siteId, since],
  );
  const sessions: SessionRow[] = raw.map(({ score, ...s }) => ({
    ...s,
    pAgent: Number(s.pAgent),
    cls: classOf(s.tier, s.label),
    evidence: (score?.evidence as Evidence[]) ?? [],
    segments: (score?.segments as Segment[]) ?? [],
    tasks: (score?.tasks as Record<string, TaskTally>) ?? {},
    durationMs: Number(score?.durationMs ?? 0),
  }));

  const byClass = Object.fromEntries(CLASSES.map((c) => [c, sessions.filter((s) => s.cls === c)])) as Record<ActorClass, SessionRow[]>;
  const byTier = Object.fromEntries(TIERS.map((t) => [t, sessions.filter((s) => s.tier === t).length])) as Record<Tier, number>;
  const agentSessions = [...byClass.verified_agent, ...byClass.agent];

  // Tasks: completion rate by actor class, and where agents fail.
  const tasks = Object.fromEntries(CLASSES.map((c) => [c, tally(byClass[c])])) as Record<ActorClass, ReturnType<typeof tally>>;
  const taskNames = new Map<string, { name: string; agentStarted: number; agentCompleted: number; agentFailed: number; humanStarted: number; humanCompleted: number }>();
  for (const s of sessions)
    for (const [name, v] of Object.entries(s.tasks)) {
      const row = taskNames.get(name) ?? { name, agentStarted: 0, agentCompleted: 0, agentFailed: 0, humanStarted: 0, humanCompleted: 0 };
      if (s.cls === "verified_agent" || s.cls === "agent") {
        row.agentStarted += v.start;
        row.agentCompleted += v.complete;
        row.agentFailed += v.fail;
      } else if (s.cls === "human") {
        row.humanStarted += v.start;
        row.humanCompleted += v.complete;
      }
      taskNames.set(name, row);
    }

  // Daily sessions by class.
  const daily: { day: string; verified_agent: number; agent: number; uncertain: number; human: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ day, verified_agent: 0, agent: 0, uncertain: 0, human: 0 });
  }
  for (const s of sessions) {
    const row = daily.find((r) => r.day === new Date(s.lastAt).toISOString().slice(0, 10));
    if (row) row[s.cls]++;
  }

  // Requests seen by the server-side verifier.
  const { rows: reqAgg } = await d.query<{ tier: Tier; decision: string; verify_status: string; verify_reason: string | null; n: number }>(
    `select tier, decision, verify_status, verify_reason, count(*)::int as n from aa_requests where site_id = $1 and at > $2
     group by tier, decision, verify_status, verify_reason`,
    [siteId, since],
  );
  const { rows: recentRequests } = await d.query<RequestRow>(
    `select r.at, r.method, r.path, r.tier, r.decision, r.verify_status as "verifyStatus", r.verify_reason as "verifyReason",
       r.agent_id as "agentId", a.name as "agentName", r.declared, r.ua
     from aa_requests r left join aa_agents a on a.id = r.agent_id where r.site_id = $1 order by r.at desc limit 50`,
    [siteId],
  );

  // Top identified agents across sessions and requests.
  const { rows: topAgents } = await d.query<{ agentId: string; name: string; operator: string; status: string; requests: number }>(
    `select a.id as "agentId", a.name, a.operator, a.status, count(*)::int as requests
     from aa_requests r join aa_agents a on a.id = r.agent_id where r.site_id = $1 and r.at > $2
     group by a.id, a.name, a.operator, a.status order by requests desc limit 10`,
    [siteId, since],
  );
  const agentTable = topAgents.map((a) => {
    const ss = sessions.filter((s) => s.agentId === a.agentId);
    return { ...a, sessions: ss.length, tasks: tally(ss) };
  });

  const requests = {
    total: reqAgg.reduce((s, r) => s + r.n, 0),
    signedValid: reqAgg.filter((r) => r.verify_status === "valid").reduce((s, r) => s + r.n, 0),
    signedInvalid: reqAgg.filter((r) => r.verify_status === "invalid").reduce((s, r) => s + r.n, 0),
    byDecision: Object.entries(
      reqAgg.reduce<Record<string, number>>((m, r) => ((m[r.decision] = (m[r.decision] ?? 0) + r.n), m), {}),
    ).map(([decision, n]) => ({ decision, n })),
    failures: Object.entries(
      reqAgg.filter((r) => r.verify_reason).reduce<Record<string, number>>((m, r) => ((m[r.verify_reason!] = (m[r.verify_reason!] ?? 0) + r.n), m), {}),
    )
      .map(([reason, n]) => ({ reason, n }))
      .sort((a, b) => b.n - a.n),
    byTier: Object.fromEntries(TIERS.map((t) => [t, reqAgg.filter((r) => r.tier === t).reduce((s, r) => s + r.n, 0)])) as Record<Tier, number>,
  };

  return {
    days,
    totals: {
      sessions: sessions.length,
      agentShare: sessions.length ? agentSessions.length / sessions.length : null,
      verifiedShare: agentSessions.length ? byClass.verified_agent.length / agentSessions.length : null,
      hybrid: sessions.filter((s) => s.hybrid).length,
      byClass: Object.fromEntries(CLASSES.map((c) => [c, byClass[c].length])) as Record<ActorClass, number>,
      byTier,
    },
    tasks,
    taskBreakdown: [...taskNames.values()].sort((a, b) => b.agentStarted + b.humanStarted - (a.agentStarted + a.humanStarted)),
    daily,
    requests,
    recentRequests,
    agents: agentTable,
    sessions: sessions.slice(0, 50),
  };
}

export type SiteOverview = Awaited<ReturnType<typeof siteOverview>>;

/**
 * What an agent builder sees about their own agent: aggregated outcomes across
 * every site that verified it. Sites stay anonymous — only counts are shown.
 */
export async function agentOutcomes(agentId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const d = await db();
  const { rows } = await d.query<{ decision: string; verify_status: string; verify_reason: string | null; n: number }>(
    `select r.decision, r.verify_status, r.verify_reason, count(*)::int as n
     from aa_requests r join aa_keys k on k.kid = r.keyid where k.agent_id = $1 and r.at > $2
     group by r.decision, r.verify_status, r.verify_reason`,
    [agentId, since],
  );
  const { rows: sites } = await d.query<{ n: number }>(
    `select count(distinct r.site_id)::int as n from aa_requests r join aa_keys k on k.kid = r.keyid where k.agent_id = $1 and r.at > $2`,
    [agentId, since],
  );
  const { rows: sess } = await d.query<{ score: { tasks?: Record<string, TaskTally> } | null }>(
    "select score from aa_sessions where agent_id = $1 and last_at > $2 limit 5000",
    [agentId, since],
  );
  const total = rows.reduce((s, r) => s + r.n, 0);
  const allowed = rows.filter((r) => r.decision === "allow").reduce((s, r) => s + r.n, 0);
  const t = { started: 0, completed: 0, failed: 0 };
  for (const s of sess)
    for (const v of Object.values(s.score?.tasks ?? {})) {
      t.started += v.start;
      t.completed += v.complete;
      t.failed += v.fail;
    }
  return {
    days,
    requests: total,
    sites: sites[0]?.n ?? 0,
    acceptanceRate: total ? allowed / total : null,
    byDecision: Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[r.decision] = (m[r.decision] ?? 0) + r.n), m), {})).map(([decision, n]) => ({ decision, n })),
    failures: Object.entries(
      rows.filter((r) => r.verify_reason).reduce<Record<string, number>>((m, r) => ((m[r.verify_reason!] = (m[r.verify_reason!] ?? 0) + r.n), m), {}),
    ).map(([reason, n]) => ({ reason, n })),
    sessions: sess.length,
    tasks: { ...t, rate: t.started ? t.completed / t.started : null },
  };
}

export type AgentOutcomes = Awaited<ReturnType<typeof agentOutcomes>>;
