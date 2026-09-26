import { TEMPLATES, type AgentTemplate } from "./catalog";
import type { Agent, Routine, State } from "./types";
import { uid } from "./utils";

const H = 3600_000;

export const EMPTY: State = {
  onboarded: false,
  user: { name: "", company: "", role: "", timezone: "" },
  brains: [],
  routing: "auto",
  connected: [],
  agents: [],
  routines: [],
  messages: [],
  approvals: [],
  activity: [],
  memory: [],
};

export function hire(t: AgentTemplate, overrides: Partial<Agent> = {}): { agent: Agent; routines: Routine[] } {
  const { pitch: _p, routines: rs, ...rest } = t;
  const agent: Agent = { ...rest, id: uid(), status: "idle", hiredAt: Date.now(), ...overrides };
  const routines = rs.map((r) => ({ ...r, id: uid(), agentId: agent.id, enabled: true }));
  return { agent, routines };
}

/** A lived-in workspace so the product can be explored without setup. */
export function demoState(name = "Alex Rivera", company = "Northstar"): State {
  const now = Date.now();
  const picks = ["Chief of Staff", "Inbox Manager", "Sales SDR", "Engineering PM"];
  const hired = picks.map((role) => hire(TEMPLATES.find((t) => t.role === role)!));
  const [ava, iris, rex, theo] = hired.map((h) => h.agent);
  theo.status = "working";

  return {
    onboarded: true,
    user: { name, company, role: "Founder & CEO", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    brains: [
      { providerId: "claude", plan: "Max 5x", usage: 38, resetsIn: "3d 4h", enabled: true, connectedAt: now - 30 * 24 * H },
      { providerId: "chatgpt", plan: "Plus", usage: 94, resetsIn: "2h 10m", enabled: true, connectedAt: now - 60 * 24 * H },
      { providerId: "gemini", plan: "AI Pro", usage: 12, resetsIn: "18h", enabled: true, connectedAt: now - 7 * 24 * H },
      { providerId: "perplexity", plan: "Pro", usage: 51, resetsIn: "9h", enabled: true, connectedAt: now - 3 * 24 * H },
    ],
    routing: "auto",
    connected: ["gmail", "gcal", "slack", "notion", "github", "linear", "hubspot"],
    agents: hired.map((h) => h.agent),
    routines: hired.flatMap((h) => h.routines).map((r, i) => (i === 0 ? { ...r, lastResult: "Brief sent · 6 items" } : r)),
    messages: [
      {
        id: uid(),
        threadId: ava.id,
        author: "agent",
        agentId: ava.id,
        at: now - 2 * H,
        text: `Morning ${name.split(" ")[0]} ☀️ Here's your brief:\n\n• **3 meetings** today — Northwind renewal at 11:30 is the big one ($48k ARR). Prep pack is in Notion.\n• **2 emails need you**: legal redlines from Priya, pricing question from Acme.\n• **Slipped promise**: you told Sam you'd share the Q4 plan by Tuesday — want me to draft it from last week's notes?`,
        steps: [
          { id: uid(), kind: "route", label: "Routed to Claude · Opus 5.5", detail: "Best available for writing", providerId: "claude", state: "done" },
          { id: uid(), kind: "tool", toolId: "gcal", label: "Checking calendar", detail: "5 events today", state: "done" },
          { id: uid(), kind: "tool", toolId: "gmail", label: "Searching Gmail", detail: "41 new threads", state: "done" },
          { id: uid(), kind: "tool", toolId: "slack", label: "Reading Slack", detail: "118 messages across 6 channels", state: "done" },
        ],
      },
    ],
    approvals: [
      {
        id: uid(),
        agentId: iris.id,
        toolId: "gmail",
        title: "Reply to Priya (Northwind) about redlines",
        summary: "Iris drafted this in your voice from the thread and your notes on clause 7.2.",
        preview: [
          { label: "To", value: "priya@northwind.com" },
          { label: "Subject", value: "Re: MSA redlines" },
          { label: "Body", value: `Hi Priya,\n\nThanks for turning these around so quickly. We're good with everything except 7.2 — could we cap liability at 12 months of fees instead?\n\nHappy to jump on a call Thursday.\n\nBest,\n${name.split(" ")[0]}` },
        ],
        status: "pending",
        at: now - 25 * 60_000,
      },
      {
        id: uid(),
        agentId: rex.id,
        toolId: "hubspot",
        title: "Qualify Lumen Labs and send first touch",
        summary: "Inbound demo request. Fit score 86 — Series B, 120 people, uses Linear + Slack.",
        preview: [
          { label: "CRM change", value: "Lifecycle → SQL · Owner → you" },
          { label: "Email to", value: "dana@lumenlabs.io" },
          { label: "Body", value: "Hi Dana — saw your team just shipped v2 of your API (congrats!). Most ops teams your size lose ~6h/week to follow-ups; happy to show how Northstar handles that in 20 minutes. Thursday work?" },
        ],
        status: "pending",
        at: now - 50 * 60_000,
      },
      {
        id: uid(),
        agentId: theo.id,
        toolId: "slack",
        title: "Post async standup to #eng",
        summary: "Summarised from 9 merged PRs and 14 Linear updates since yesterday.",
        preview: [
          { label: "Channel", value: "#eng" },
          { label: "Message", value: "🚀 Shipped: checkout refactor, SSO fixes (6 PRs)\n🔨 In progress: billing v2 (Maya), search reindex (Jon)\n⛔ Blocked: ENG-412 waiting on design review — 3 days" },
        ],
        status: "pending",
        at: now - 5 * 60_000,
      },
    ],
    activity: [
      { id: uid(), agentId: iris.id, toolId: "gmail", text: "Archived 23 newsletters and labelled 12 threads", at: now - 40 * 60_000 },
      { id: uid(), agentId: ava.id, toolId: "notion", text: "Created prep pack “Northwind — renewal”", at: now - 70 * 60_000 },
      { id: uid(), agentId: theo.id, toolId: "linear", text: "Flagged 2 issues stale for > 5 days", at: now - 2.5 * H },
      { id: uid(), agentId: rex.id, toolId: "hubspot", text: "Enriched 4 new contacts with company data", at: now - 3 * H },
      { id: uid(), agentId: ava.id, toolId: "gcal", text: "Moved 1:1 with Sam to avoid a conflict", at: now - 5 * H },
    ],
    memory: [
      { id: uid(), text: `${company} sells workflow software to mid-market ops teams.`, source: "Notion · Company wiki", scope: "company" },
      { id: uid(), text: "ICP: 50–500 employees, uses Slack + a modern issue tracker, ops-led buying.", source: "Notion · Sales playbook", scope: "company" },
      { id: uid(), text: "Prefers short emails, no exclamation marks, signs off with first name.", source: "Learned from 214 sent emails", scope: "me" },
      { id: uid(), text: "Deep-work blocks Tue/Thu mornings — never schedule over them.", source: "You told Ava", scope: "me" },
      { id: uid(), text: "Engineering standup lives in #eng; releases go out Fridays.", source: "Slack · #eng", scope: "team" },
    ],
  };
}
