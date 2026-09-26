import { integrationById, providerById } from "./catalog";
import type { Agent, Approval, Brain, ProviderId, State, Step, Strength } from "./types";
import { uid } from "./utils";

/* ------------------------------------------------------------------ */
/* Routing: pick which of the user's AI subscriptions handles a task.  */
/* ------------------------------------------------------------------ */

const STRENGTH_HINTS: [Strength, RegExp][] = [
  ["coding", /\b(code|bug|pr|pull request|deploy|release|github|linear|issue|sql|script)\b/i],
  ["research", /\b(research|competitor|market|find out|look up|sources?|news|trend|compare)\b/i],
  ["writing", /\b(draft|write|email|reply|post|announce|summar|brief|notes?|copy)\b/i],
  ["vision", /\b(image|screenshot|figma|design|chart|diagram)\b/i],
];

export function classify(text: string): Strength {
  for (const [s, re] of STRENGTH_HINTS) if (re.test(text)) return s;
  return "reasoning";
}

export interface RouteDecision {
  providerId: ProviderId;
  reason: string;
  failover?: ProviderId;
}

const LIMIT = 92;

export function route(
  brains: Brain[],
  agent: Pick<Agent, "brain">,
  text: string,
  mode: State["routing"],
): RouteDecision | null {
  const live = brains.filter((b) => b.enabled);
  if (!live.length) return null;
  const strength = classify(text);

  if (agent.brain !== "auto") {
    const pinned = live.find((b) => b.providerId === agent.brain);
    if (pinned && pinned.usage < LIMIT) {
      return { providerId: pinned.providerId, reason: `Pinned to ${providerById(pinned.providerId).name}` };
    }
    const fallback = pickBest(live.filter((b) => b.usage < LIMIT), strength, mode) ?? live[0];
    return {
      providerId: fallback.providerId,
      failover: agent.brain,
      reason: pinned
        ? `${providerById(agent.brain).name} is at ${pinned.usage}% of its limit — failed over`
        : `${providerById(agent.brain).name} isn't connected — using ${providerById(fallback.providerId).name}`,
    };
  }

  const best = pickBest(live.filter((b) => b.usage < LIMIT), strength, mode) ?? live[0];
  return {
    providerId: best.providerId,
    reason: `Best available for ${strength}${mode === "cost" ? " · most headroom" : ""}`,
  };
}

function pickBest(brains: Brain[], strength: Strength, mode: State["routing"]) {
  return sortByFit(brains, strength, mode)[0];
}

function sortByFit(brains: Brain[], strength: Strength, mode: State["routing"]) {
  return [...brains].sort((a, b) => score(b) - score(a));
  function score(b: Brain) {
    const p = providerById(b.providerId);
    const idx = p.strengths.indexOf(strength);
    const fit = idx === -1 ? 0 : 3 - idx;
    const headroom = (100 - b.usage) / 100;
    return mode === "cost" ? fit + headroom * 6 : mode === "quality" ? fit * 3 + headroom : fit * 2 + headroom * 2;
  }
}

/**
 * Full failover order for a task: the routed choice first, then every other
 * enabled brain by fit, with near-limit brains last.
 */
export function rank(brains: Brain[], agent: Pick<Agent, "brain">, text: string, mode: State["routing"]): RouteDecision[] {
  const first = route(brains, agent, text, mode);
  if (!first) return [];
  const strength = classify(text);
  const live = brains.filter((b) => b.enabled && b.providerId !== first.providerId);
  const rest = [...sortByFit(live.filter((b) => b.usage < LIMIT), strength, mode), ...live.filter((b) => b.usage >= LIMIT)];
  return [first, ...rest.map((b) => ({ providerId: b.providerId, reason: `Failover for ${strength}` }))];
}

/* ------------------------------------------------------------------ */
/* Planning: turn a request into visible steps + optional approval.    */
/* ------------------------------------------------------------------ */

const TOOL_VERBS: Record<string, { read: string; write: string; keywords: RegExp }> = {
  gmail: { read: "Searching Gmail", write: "Drafting email", keywords: /mail|inbox|reply|email|follow.?up|thread/i },
  gcal: { read: "Checking calendar", write: "Creating calendar hold", keywords: /meeting|calendar|schedule|tomorrow|today|week|call/i },
  slack: { read: "Reading Slack", write: "Preparing Slack post", keywords: /slack|channel|team|post|announce|standup|dm/i },
  notion: { read: "Searching Notion", write: "Updating Notion page", keywords: /doc|notion|notes|wiki|page|spec|brief/i },
  gdrive: { read: "Searching Drive", write: "Creating Drive doc", keywords: /drive|file|deck|sheet|doc/i },
  linear: { read: "Querying Linear", write: "Creating Linear issue", keywords: /linear|issue|ticket|bug|sprint|roadmap/i },
  github: { read: "Scanning GitHub", write: "Commenting on PR", keywords: /github|pr|pull|release|commit|code|deploy/i },
  jira: { read: "Querying Jira", write: "Updating Jira ticket", keywords: /jira|ticket|sprint|epic/i },
  hubspot: { read: "Looking up HubSpot", write: "Updating HubSpot deal", keywords: /lead|deal|crm|pipeline|prospect|account|hubspot/i },
  salesforce: { read: "Querying Salesforce", write: "Updating Salesforce record", keywords: /lead|deal|opportunit|pipeline|account/i },
  intercom: { read: "Reading Intercom", write: "Drafting customer reply", keywords: /customer|support|ticket|conversation|complain/i },
  zendesk: { read: "Reading Zendesk", write: "Updating ticket", keywords: /customer|support|ticket/i },
  stripe: { read: "Pulling Stripe data", write: "Preparing dunning email", keywords: /revenue|mrr|payment|invoice|churn|stripe|refund/i },
  quickbooks: { read: "Reading QuickBooks", write: "Posting journal entry", keywords: /books|expense|bill|reconcil|accounting/i },
  figma: { read: "Opening Figma", write: "Leaving Figma comment", keywords: /figma|design|mock|screen/i },
  zoom: { read: "Fetching Zoom transcripts", write: "Sharing recording", keywords: /zoom|recording|transcript|call/i },
  asana: { read: "Reading Asana", write: "Creating Asana task", keywords: /asana|task|project/i },
  airtable: { read: "Querying Airtable", write: "Updating Airtable record", keywords: /airtable|base|record|table/i },
};

const WRITE_INTENT = /\b(send|reply|email|post|schedule|book|create|update|file|open|draft|invite|announce|move|close|refund|remind|follow.?up|chase)\b/i;

export interface Plan {
  steps: Step[];
  finalText: string;
  approval?: Omit<Approval, "id" | "at" | "status">;
}

const WRITE_TITLE: Record<string, string> = {
  gmail: "Send email",
  gcal: "Create calendar event",
  slack: "Post to Slack",
  notion: "Update Notion page",
  gdrive: "Create Drive doc",
  linear: "Create Linear issue",
  github: "Comment on GitHub",
  jira: "Update Jira ticket",
  hubspot: "Update HubSpot",
  salesforce: "Update Salesforce",
  intercom: "Reply to customer",
  zendesk: "Update Zendesk ticket",
  stripe: "Send payment reminder",
  quickbooks: "Post to QuickBooks",
  figma: "Comment in Figma",
  zoom: "Share recording",
  asana: "Create Asana task",
  airtable: "Update Airtable",
};

export function plan(state: State, agent: Agent, raw: string, threadId: string): Plan {
  const text = raw.replace(/@\w+\s*/g, "").trim() || raw;
  const decision = route(state.brains, agent, text, state.routing);
  const usable = agent.tools.filter((t) => state.connected.includes(t));
  const matched = usable.filter((t) => TOOL_VERBS[t]?.keywords.test(text));
  const tools = (matched.length ? matched : usable).slice(0, 3);
  const wantsWrite = WRITE_INTENT.test(text);
  const writeTool = wantsWrite ? tools.find((t) => TOOL_VERBS[t]) : undefined;
  const firstName = state.user.name.split(" ")[0] || "there";

  const steps: Step[] = [];
  if (decision) {
    const p = providerById(decision.providerId);
    steps.push({
      id: uid(),
      kind: "route",
      label: `Routed to ${p.name} · ${p.models[0]}`,
      detail: decision.reason,
      providerId: decision.providerId,
      state: "pending",
    });
  }
  steps.push({
    id: uid(),
    kind: "think",
    label: "Planning",
    detail: `Using ${state.memory.length} context notes about ${state.user.company || "your work"}`,
    state: "pending",
  });
  for (const t of tools) {
    const v = TOOL_VERBS[t];
    if (!v) continue;
    steps.push({ id: uid(), kind: "tool", toolId: t, label: v.read, detail: readDetail(t), state: "pending" });
  }
  if (writeTool && agent.autonomy !== "auto") {
    steps.push({
      id: uid(),
      kind: "approval",
      toolId: writeTool,
      label: `${TOOL_VERBS[writeTool].write} — waiting for your OK`,
      state: "pending",
    });
  } else if (writeTool) {
    steps.push({ id: uid(), kind: "tool", toolId: writeTool, label: TOOL_VERBS[writeTool].write, detail: "Done", state: "pending" });
  }

  if (!decision) {
    return {
      steps: [],
      finalText:
        "I can't think without a brain yet 🙂 Connect at least one AI subscription in **AI accounts** and I'll pick this up right away.",
    };
  }
  if (!usable.length) {
    return {
      steps: steps.slice(0, 2),
      finalText: `I'd love to help, ${firstName}, but none of my tools are connected yet. Connect ${agent.tools
        .map((t) => integrationById(t)?.name)
        .filter(Boolean)
        .join(", ")} and I'll get going.`,
    };
  }

  const sources = tools.map((t) => integrationById(t)?.name).join(", ");
  let finalText = `Here's what I found across ${sources}:\n\n${bullets(agent, text)}`;
  let approval: Plan["approval"];

  if (writeTool && agent.autonomy !== "auto") {
    const integ = integrationById(writeTool)!;
    approval = {
      agentId: agent.id,
      threadId,
      toolId: writeTool,
      title: `${WRITE_TITLE[writeTool] ?? TOOL_VERBS[writeTool].write} — ${truncate(text, 60)}`,
      summary: `${agent.name} prepared this based on: “${truncate(text, 90)}”`,
      preview: previewFor(writeTool, state, text),
    };
    finalText += `\n\nI've prepared the ${integ.name} action — it's waiting in your approvals. Nothing goes out until you say so.`;
  } else if (writeTool) {
    finalText += `\n\nDone — I've taken care of it in ${integrationById(writeTool)!.name} and logged it in Activity.`;
  } else {
    finalText += `\n\nWant me to turn this into a recurring routine?`;
  }
  return { steps, finalText, approval };
}

function readDetail(tool: string) {
  const n = 3 + Math.floor(Math.random() * 18);
  const map: Record<string, string> = {
    gmail: `${n} relevant threads`,
    gcal: `${Math.max(2, n % 7)} events in range`,
    slack: `${n} messages across 3 channels`,
    notion: `${Math.max(2, n % 6)} pages matched`,
    gdrive: `${Math.max(2, n % 5)} files matched`,
    linear: `${n} issues updated`,
    github: `${Math.max(2, n % 9)} PRs, ${n} commits`,
    hubspot: `${Math.max(1, n % 6)} contacts, ${Math.max(1, n % 4)} deals`,
    stripe: `${n} payments in window`,
    intercom: `${n} open conversations`,
  };
  return map[tool] ?? `${n} records`;
}

function bullets(agent: Agent, text: string) {
  const t = text.toLowerCase();
  if (/\b(reply|respond|email|inbox|follow.?ups?)\b/.test(t))
    return [
      "• The latest thread is from **Priya (Northwind)** — she's waiting on clause 7.2 and suggested this week.",
      "• You're free **Thu 10:00–11:00** and **Fri 14:00–15:00**; Thursday avoids your deep-work block.",
      "• Drafted in your usual tone: short, no exclamation marks, signed with your first name.",
    ].join("\n");
  if (/\b(brief|today|morning|my day)\b/.test(t))
    return [
      "• **3 meetings** today — the 11:30 with Northwind is the one that matters (renewal, $48k ARR).",
      "• **2 emails need you**: legal redlines from Priya, and a pricing question from Acme.",
      "• **1 slipped promise**: you told Sam you'd share the Q4 plan by Tuesday.",
    ].join("\n");
  if (/lead|prospect|deal|sales/.test(t))
    return [
      "• **Lumen Labs** — 120 people, Series B, strong ICP fit (score 86). Champion likely Head of Ops.",
      "• **Oakridge Health** — fit 61; regulated, long cycle. Suggest nurture.",
      "• Pipeline moved **+$34k** this week; two deals stuck in *Proposal* for 14+ days.",
    ].join("\n");
  if (/standup|pr|release|eng|bug/.test(t))
    return [
      "• **9 PRs merged** yesterday; checkout refactor landed 🎉",
      "• **Blocked 3 days**: ENG-412 (waiting on design review from Figma).",
      "• Release candidate is green — 2 flaky tests quarantined last week still need owners.",
    ].join("\n");
  if (/revenue|mrr|payment|churn/.test(t))
    return [
      "• MRR **$212.4k** (+3.1% WoW). Net new $6.4k, churn $1.1k.",
      "• **4 failed payments** ($2.3k) — 3 cards expired, 1 insufficient funds.",
      "• Largest expansion: Acme moved to Business (+$1.8k/mo).",
    ].join("\n");
  if (/customer|support|ticket/.test(t))
    return [
      "• **27 open** conversations; 5 are > 24h old.",
      "• Spike in *SSO login* issues since yesterday's deploy — 7 tickets, likely one root cause.",
      "• 1 churn-risk account (Globex) — escalation recommended.",
    ].join("\n");
  if (/competitor|market|research/.test(t))
    return [
      "• **Competitor A** launched usage-based pricing (source: pricing page, changelog).",
      "• **Competitor B** hiring 6 AEs in EMEA — likely expansion push.",
      "• No major changes at C, D, E this week.",
    ].join("\n");
  return [
    `• Pulled the relevant context — ${agent.role.toLowerCase()} view below.`,
    "• 2 items look time-sensitive and are flagged for today.",
    "• Everything else can wait until your weekly review.",
  ].join("\n");
}

function previewFor(tool: string, state: State, text: string) {
  const who = state.user.name.split(" ")[0] || "Me";
  switch (tool) {
    case "gmail":
      return [
        { label: "To", value: "priya@northwind.com" },
        { label: "Subject", value: "Re: Renewal — next steps" },
        {
          label: "Body",
          value: `Hi Priya,\n\nThanks for the redlines — we're aligned on all but clause 7.2. Could we take 15 minutes Thursday to close it out?\n\nBest,\n${who}`,
        },
      ];
    case "slack":
      return [
        { label: "Channel", value: "#team" },
        { label: "Message", value: `Quick update: ${truncate(text, 120)} — details in thread 🧵` },
      ];
    case "gcal":
      return [
        { label: "Event", value: "Northwind — contract close-out" },
        { label: "When", value: "Thu, 10:00–10:15" },
        { label: "Guests", value: "priya@northwind.com" },
      ];
    case "linear":
    case "jira":
      return [
        { label: "Title", value: truncate(text, 70) },
        { label: "Team", value: "Platform" },
        { label: "Priority", value: "High" },
      ];
    case "hubspot":
    case "salesforce":
      return [
        { label: "Record", value: "Lumen Labs" },
        { label: "Change", value: "Stage → Qualified · Fit score 86" },
      ];
    default:
      return [{ label: "Action", value: truncate(text, 140) }];
  }
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Pick the agent best suited for free-form work typed on Home. */
export function assign(state: State, text: string): Agent | undefined {
  const mention = text.match(/@(\w+)/);
  if (mention) {
    const a = state.agents.find((x) => x.name.toLowerCase() === mention[1].toLowerCase());
    if (a) return a;
  }
  let best: Agent | undefined;
  let bestScore = -1;
  for (const a of state.agents) {
    const s =
      a.tools.filter((t) => TOOL_VERBS[t]?.keywords.test(text)).length * 2 +
      (new RegExp(a.role.split(" ")[0], "i").test(text) ? 3 : 0);
    if (s > bestScore) {
      best = a;
      bestScore = s;
    }
  }
  return best;
}
