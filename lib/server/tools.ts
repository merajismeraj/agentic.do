import "server-only";
import { calendarCreate, calendarDay, gmailSearch, gmailSend, type GoogleAuth } from "./google";

/**
 * Tool registry. Each tool belongs to an integration, declares whether it only
 * reads or changes something outside the company, and runs either against the
 * real API (when credentials are configured) or against demo fixtures.
 */

export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export interface ToolResult {
  ok: boolean;
  /** true when served by a real API, false when served from demo fixtures */
  live: boolean;
  summary: string;
  data?: unknown;
}

/** Per-request credentials and settings a tool may use. */
export interface ToolContext {
  google?: GoogleAuth;
  timeZone: string;
  /** May use the operator's server-wide tokens (SHARED_AI_KEYS); otherwise those tools use demo data. */
  shared?: boolean;
}

export interface ToolDef {
  name: string;
  integration: string;
  kind: "read" | "write";
  label: string;
  description: string;
  input_schema: JsonSchema;
  isLive: (ctx: ToolContext) => boolean;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
  /** Fields shown on the approval card for write tools. */
  preview?: (input: Record<string, unknown>) => { label: string; value: string }[];
  /** Approval-card labels the user may edit, mapped to the string input field they change. */
  editable?: Record<string, string>;
}

const env = (k: string) => process.env[k]?.trim() || undefined;
/** A server-wide token, only for workspaces allowed to share the operator's credentials. */
const tok = (ctx: ToolContext, k: string) => (ctx.shared ? env(k) : undefined);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : String(v));
const demo = (summary: string, data: unknown): ToolResult => ({ ok: true, live: false, summary, data });

/* ------------------------------ Slack ------------------------------ */

async function slack<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("SLACK_BOT_TOKEN")}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>;
  if (!json.ok) throw new Error(`Slack ${method}: ${json.error ?? res.status}`);
  return json as T;
}

async function slackChannelId(name: string) {
  if (/^[CG][A-Z0-9]+$/.test(name)) return name;
  const clean = name.replace(/^#/, "");
  const list = await slack<{ channels: { id: string; name: string }[] }>("conversations.list", {
    limit: 1000,
    types: "public_channel,private_channel",
  });
  const hit = list.channels.find((c) => c.name === clean);
  if (!hit) throw new Error(`Slack channel #${clean} not found or bot not invited`);
  return hit.id;
}

/* ------------------------------ GitHub ----------------------------- */

async function github(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* ------------------------------ Linear ----------------------------- */

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: env("LINEAR_API_KEY")!, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Linear: ${json.errors[0].message}`);
  return json.data as T;
}

/* ------------------------------ Registry --------------------------- */

export const TOOLS: ToolDef[] = [
  {
    name: "gmail_search",
    integration: "gmail",
    kind: "read",
    label: "Searching Gmail",
    description:
      "Search the user's email with Gmail search syntax (e.g. 'is:unread newer_than:2d', 'from:priya'). Returns sender, subject, date, snippet, thread_id and message_id for each match.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Gmail search query" }, max: { type: "number", description: "Max results (default 8)" } },
      required: ["query"],
    },
    isLive: (ctx) => !!ctx.google,
    run: async ({ query, max }, ctx) => {
      if (!ctx.google)
        return demo(`3 threads matching “${str(query)}”`, [
          { from: "priya@northwind.com", subject: "MSA redlines", snippet: "Aligned on everything except 7.2 (liability cap). Can we close this week?", date: "today 08:12" },
          { from: "ops@acme.io", subject: "Pricing for 40 seats", snippet: "Is there an annual discount above 25 seats?", date: "yesterday" },
          { from: "sam@yourco.com", subject: "Q4 plan?", snippet: "Still waiting on the Q4 plan doc — Tuesday still OK?", date: "2 days ago" },
        ]);
      const hits = await gmailSearch(ctx.google, str(query), Number(max) || 8);
      return { ok: true, live: true, summary: `${hits.length} message${hits.length === 1 ? "" : "s"} matching “${str(query)}”`, data: hits };
    },
  },
  {
    name: "gmail_send",
    editable: { To: "to", Subject: "subject", Body: "body" },
    integration: "gmail",
    kind: "write",
    label: "Sending email",
    description:
      "Send an email from the user's Gmail. To reply in an existing conversation, pass thread_id and message_id from gmail_search. Requires the user's approval before it is sent.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "Plain-text body, signed in the user's voice" },
        thread_id: { type: "string", description: "Gmail thread_id when replying" },
        message_id: { type: "string", description: "Message-ID header of the message being replied to" },
      },
      required: ["to", "subject", "body"],
    },
    isLive: (ctx) => !!ctx.google,
    preview: (i) => [
      { label: "To", value: str(i.to) },
      { label: "Subject", value: str(i.subject) },
      { label: "Body", value: str(i.body) },
    ],
    run: async (i, ctx) => {
      if (!ctx.google) return demo(`Demo only — email to ${str(i.to)} was not sent (connect Google to send for real)`, null);
      const sent = await gmailSend(ctx.google, {
        to: str(i.to),
        subject: str(i.subject),
        body: str(i.body),
        threadId: str(i.thread_id) || undefined,
        inReplyTo: str(i.message_id) || undefined,
      });
      return { ok: true, live: true, summary: `Sent to ${str(i.to)} from ${ctx.google.email}`, data: sent };
    },
  },
  {
    name: "calendar_list_events",
    integration: "gcal",
    kind: "read",
    label: "Checking calendar",
    description: "List the user's calendar events for one day. Use 'today', 'tomorrow' or a date like 2026-10-01. Times are in the user's timezone.",
    input_schema: { type: "object", properties: { day: { type: "string" } }, required: ["day"] },
    isLive: (ctx) => !!ctx.google,
    run: async ({ day }, ctx) => {
      if (!ctx.google)
        return demo(`4 events ${str(day, "today")}`, [
          { time: "09:30", title: "Eng standup", attendees: 8 },
          { time: "11:30", title: "Northwind renewal ($48k ARR)", attendees: ["priya@northwind.com"] },
          { time: "14:00", title: "1:1 with Sam" },
          { time: "16:00", title: "Board prep (deep work)" },
        ]);
      const r = await calendarDay(ctx.google, str(day, "today"), ctx.timeZone);
      return { ok: true, live: true, summary: `${r.events.length} event${r.events.length === 1 ? "" : "s"} on ${r.date}`, data: r };
    },
  },
  {
    name: "calendar_create_event",
    editable: { Event: "title" },
    integration: "gcal",
    kind: "write",
    label: "Creating calendar event",
    description:
      "Create an event on the user's primary calendar and email invites to guests. `start` is local time in the user's timezone, formatted 2026-10-01T10:00. Requires approval.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "Local start time, e.g. 2026-10-01T10:00" },
        duration_minutes: { type: "number" },
        guests: { type: "array", items: { type: "string" } },
      },
      required: ["title", "start"],
    },
    isLive: (ctx) => !!ctx.google,
    preview: (i) => [
      { label: "Event", value: str(i.title) },
      { label: "When", value: `${str(i.start).replace("T", " ")} · ${str(i.duration_minutes, "30")} min` },
      { label: "Guests", value: Array.isArray(i.guests) && i.guests.length ? i.guests.join(", ") : "—" },
    ],
    run: async (i, ctx) => {
      if (!ctx.google) return demo(`Demo only — “${str(i.title)}” was not added (connect Google to create events)`, null);
      const ev = await calendarCreate(ctx.google, {
        title: str(i.title),
        start: str(i.start),
        durationMinutes: Number(i.duration_minutes) || 30,
        guests: Array.isArray(i.guests) ? i.guests.map(String) : [],
        timeZone: ctx.timeZone,
      });
      return { ok: true, live: true, summary: `Added “${str(i.title)}” to ${ctx.google.email}'s calendar`, data: { link: ev.htmlLink } };
    },
  },
  {
    name: "slack_read_channel",
    integration: "slack",
    kind: "read",
    label: "Reading Slack",
    description: "Read the most recent messages from a Slack channel, e.g. '#eng'.",
    input_schema: { type: "object", properties: { channel: { type: "string" }, limit: { type: "number" } }, required: ["channel"] },
    isLive: (ctx) => !!tok(ctx, "SLACK_BOT_TOKEN"),
    run: async ({ channel, limit }, ctx) => {
      if (!tok(ctx, "SLACK_BOT_TOKEN"))
        return demo(`12 recent messages in ${str(channel)}`, [
          { user: "maya", text: "billing v2 PR is up, needs review" },
          { user: "jon", text: "search reindex finished overnight ✅" },
          { user: "lee", text: "ENG-412 still blocked on design review" },
        ]);
      const id = await slackChannelId(str(channel));
      const h = await slack<{ messages: { user?: string; text: string }[] }>("conversations.history", {
        channel: id,
        limit: Math.min(Number(limit) || 20, 50),
      });
      return { ok: true, live: true, summary: `${h.messages.length} messages in ${str(channel)}`, data: h.messages.map((m) => ({ user: m.user, text: m.text })) };
    },
  },
  {
    name: "slack_post_message",
    editable: { Channel: "channel", Message: "text" },
    integration: "slack",
    kind: "write",
    label: "Posting to Slack",
    description: "Post a message to a Slack channel. Requires approval.",
    input_schema: { type: "object", properties: { channel: { type: "string" }, text: { type: "string" } }, required: ["channel", "text"] },
    isLive: (ctx) => !!tok(ctx, "SLACK_BOT_TOKEN"),
    preview: (i) => [
      { label: "Channel", value: str(i.channel) },
      { label: "Message", value: str(i.text) },
    ],
    run: async ({ channel, text }, ctx) => {
      if (!tok(ctx, "SLACK_BOT_TOKEN")) return demo(`Posted to ${str(channel)} (demo)`, null);
      const id = await slackChannelId(str(channel));
      await slack("chat.postMessage", { channel: id, text: str(text) });
      return { ok: true, live: true, summary: `Posted to ${str(channel)}` };
    },
  },
  {
    name: "notion_search",
    integration: "notion",
    kind: "read",
    label: "Searching Notion",
    description: "Search the company's Notion workspace for pages and return titles with short excerpts.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    isLive: () => false,
    run: async ({ query }) =>
      demo(`2 pages matching “${str(query)}”`, [
        { title: "Sales playbook", excerpt: "ICP: 50–500 employees, ops-led buying, Slack + modern issue tracker." },
        { title: "Northwind — account notes", excerpt: "Champion: Priya (Legal Ops). Renewal 30 Sep. Risk: liability clause." },
      ]),
  },
  {
    name: "github_list_pull_requests",
    integration: "github",
    kind: "read",
    label: "Scanning GitHub",
    description: "List pull requests for the configured repository (or an 'owner/repo'), with state, author and age.",
    input_schema: {
      type: "object",
      properties: { repo: { type: "string", description: "owner/repo; defaults to the workspace repo" }, state: { type: "string", enum: ["open", "closed", "all"] } },
    },
    isLive: (ctx) => !!(tok(ctx, "GITHUB_TOKEN") && env("GITHUB_REPO")),
    run: async ({ repo, state }, ctx) => {
      const r = str(repo) || env("GITHUB_REPO");
      if (!tok(ctx, "GITHUB_TOKEN") || !r)
        return demo("9 PRs merged yesterday, 3 open", [
          { number: 482, title: "Checkout refactor", state: "merged", author: "maya" },
          { number: 488, title: "Billing v2", state: "open", author: "maya", age_days: 1 },
          { number: 479, title: "SSO callback fix", state: "open", author: "jon", age_days: 4 },
        ]);
      const prs = (await github(`/repos/${r}/pulls?state=${str(state, "open")}&per_page=20`)) as {
        number: number; title: string; state: string; user: { login: string }; created_at: string; draft: boolean;
      }[];
      return {
        ok: true,
        live: true,
        summary: `${prs.length} ${str(state, "open")} PRs in ${r}`,
        data: prs.map((p) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft, author: p.user.login, created_at: p.created_at })),
      };
    },
  },
  {
    name: "github_comment",
    editable: { Comment: "body" },
    integration: "github",
    kind: "write",
    label: "Commenting on GitHub",
    description: "Comment on a GitHub pull request or issue. Requires approval.",
    input_schema: {
      type: "object",
      properties: { repo: { type: "string" }, number: { type: "number" }, body: { type: "string" } },
      required: ["number", "body"],
    },
    isLive: (ctx) => !!(tok(ctx, "GITHUB_TOKEN") && env("GITHUB_REPO")),
    preview: (i) => [
      { label: "Where", value: `${str(i.repo) || env("GITHUB_REPO") || "repo"} #${str(i.number)}` },
      { label: "Comment", value: str(i.body) },
    ],
    run: async ({ repo, number, body }, ctx) => {
      const r = str(repo) || env("GITHUB_REPO");
      if (!tok(ctx, "GITHUB_TOKEN") || !r) return demo(`Commented on #${str(number)} (demo)`, null);
      const c = (await github(`/repos/${r}/issues/${Number(number)}/comments`, { method: "POST", body: JSON.stringify({ body: str(body) }) })) as { html_url: string };
      return { ok: true, live: true, summary: `Commented on ${r}#${str(number)}`, data: { url: c.html_url } };
    },
  },
  {
    name: "linear_list_issues",
    integration: "linear",
    kind: "read",
    label: "Querying Linear",
    description: "List recently updated Linear issues with state, assignee and priority.",
    input_schema: { type: "object", properties: { limit: { type: "number" } } },
    isLive: (ctx) => !!tok(ctx, "LINEAR_API_KEY"),
    run: async ({ limit }, ctx) => {
      if (!tok(ctx, "LINEAR_API_KEY"))
        return demo("14 issues updated since yesterday", [
          { id: "ENG-412", title: "New onboarding empty states", state: "Blocked", assignee: "lee", days_in_state: 3 },
          { id: "ENG-405", title: "Billing v2 proration", state: "In Review", assignee: "maya" },
          { id: "ENG-398", title: "Search reindex", state: "Done", assignee: "jon" },
        ]);
      const d = await linear<{ issues: { nodes: { identifier: string; title: string; priority: number; state: { name: string }; assignee: { name: string } | null; updatedAt: string }[] } }>(
        `query($n:Int){ issues(first:$n, orderBy: updatedAt){ nodes{ identifier title priority updatedAt state{name} assignee{name} } } }`,
        { n: Math.min(Number(limit) || 20, 50) },
      );
      return {
        ok: true,
        live: true,
        summary: `${d.issues.nodes.length} recently updated issues`,
        data: d.issues.nodes.map((n) => ({ id: n.identifier, title: n.title, state: n.state.name, assignee: n.assignee?.name, priority: n.priority, updatedAt: n.updatedAt })),
      };
    },
  },
  {
    name: "linear_create_issue",
    editable: { Title: "title", Description: "description" },
    integration: "linear",
    kind: "write",
    label: "Creating Linear issue",
    description: "Create a Linear issue. Requires approval.",
    input_schema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title"] },
    isLive: (ctx) => !!tok(ctx, "LINEAR_API_KEY"),
    preview: (i) => [
      { label: "Title", value: str(i.title) },
      { label: "Description", value: str(i.description, "—") },
    ],
    run: async ({ title, description }, ctx) => {
      if (!tok(ctx, "LINEAR_API_KEY")) return demo(`Issue “${str(title)}” created (demo)`, null);
      let teamId = env("LINEAR_TEAM_ID");
      if (!teamId) teamId = (await linear<{ teams: { nodes: { id: string }[] } }>(`{ teams(first:1){ nodes{ id } } }`)).teams.nodes[0]?.id;
      if (!teamId) throw new Error("No Linear team found");
      const d = await linear<{ issueCreate: { issue: { identifier: string; url: string } } }>(
        `mutation($t:String!,$d:String,$team:String!){ issueCreate(input:{title:$t, description:$d, teamId:$team}){ issue{ identifier url } } }`,
        { t: str(title), d: str(description) || null, team: teamId },
      );
      return { ok: true, live: true, summary: `Created ${d.issueCreate.issue.identifier}`, data: d.issueCreate.issue };
    },
  },
  {
    name: "hubspot_search",
    integration: "hubspot",
    kind: "read",
    label: "Looking up HubSpot",
    description: "Search CRM contacts, companies and deals.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    isLive: () => false,
    run: async ({ query }) =>
      demo(`CRM results for “${str(query)}”`, [
        { company: "Lumen Labs", stage: "Lead", employees: 120, funding: "Series B", contact: "dana@lumenlabs.io", fit_score: 86 },
        { company: "Oakridge Health", stage: "Lead", employees: 900, contact: "cto@oakridge.health", fit_score: 61 },
        { company: "Northwind", stage: "Renewal", arr: 48000, close_date: "Sep 30" },
      ]),
  },
  {
    name: "hubspot_update_deal",
    editable: { Record: "record", Change: "change" },
    integration: "hubspot",
    kind: "write",
    label: "Updating HubSpot",
    description: "Update a CRM record (stage, owner, note). Requires approval.",
    input_schema: { type: "object", properties: { record: { type: "string" }, change: { type: "string" } }, required: ["record", "change"] },
    isLive: () => false,
    preview: (i) => [
      { label: "Record", value: str(i.record) },
      { label: "Change", value: str(i.change) },
    ],
    run: async (i) => demo(`Updated ${str(i.record)} (demo)`, null),
  },
  {
    name: "stripe_revenue_summary",
    integration: "stripe",
    kind: "read",
    label: "Pulling Stripe data",
    description: "Summarise revenue, MRR movement and failed payments for a period.",
    input_schema: { type: "object", properties: { period: { type: "string" } } },
    isLive: () => false,
    run: async () =>
      demo("MRR and payments for the last 7 days", { mrr: 212400, mrr_change_pct: 3.1, new: 6400, churn: 1100, failed_payments: [{ customer: "Globex", amount: 900 }, { customer: "Initech", amount: 650 }] }),
  },
  {
    name: "intercom_list_conversations",
    integration: "intercom",
    kind: "read",
    label: "Reading Intercom",
    description: "List open customer conversations with priority and age.",
    input_schema: { type: "object", properties: {} },
    isLive: () => false,
    run: async () =>
      demo("27 open conversations", [
        { customer: "Globex", topic: "SSO login failing", age_hours: 30, sentiment: "angry" },
        { customer: "Acme", topic: "Invoice copy", age_hours: 2 },
      ]),
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

export function toolsFor(integrations: string[]) {
  return TOOLS.filter((t) => integrations.includes(t.integration));
}

export function toolStatus(ctx: ToolContext) {
  const byIntegration: Record<string, boolean> = {};
  for (const t of TOOLS) byIntegration[t.integration] = byIntegration[t.integration] || t.isLive(ctx);
  return byIntegration;
}
