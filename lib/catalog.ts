import type { Agent, Integration, Provider, ProviderId } from "./types";

export const PROVIDERS: Provider[] = [
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    plans: ["Pro", "Max 5x", "Max 20x", "Team", "Enterprise"],
    models: ["Opus 5.5", "Sonnet 5", "Haiku 4.5"],
    color: "#D97757",
    glyph: "✳",
    strengths: ["writing", "coding", "reasoning"],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    vendor: "OpenAI",
    plans: ["Plus", "Pro", "Team", "Enterprise"],
    models: ["GPT-5", "GPT-5 mini", "o-series"],
    color: "#10A37F",
    glyph: "◎",
    strengths: ["reasoning", "vision", "writing"],
  },
  {
    id: "gemini",
    name: "Gemini",
    vendor: "Google",
    plans: ["AI Pro", "AI Ultra", "Workspace"],
    models: ["Gemini Pro", "Gemini Flash"],
    color: "#4C8DF6",
    glyph: "✦",
    strengths: ["research", "vision", "speed"],
  },
  {
    id: "grok",
    name: "SuperGrok",
    vendor: "xAI",
    plans: ["SuperGrok", "SuperGrok Heavy"],
    models: ["Grok 4", "Grok 4 Fast"],
    color: "#111111",
    glyph: "𝕏",
    strengths: ["research", "speed"],
  },
  {
    id: "copilot",
    name: "Copilot",
    vendor: "Microsoft",
    plans: ["Pro", "Microsoft 365"],
    models: ["Copilot"],
    color: "#7B61FF",
    glyph: "◈",
    strengths: ["writing", "coding"],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    vendor: "Perplexity",
    plans: ["Pro", "Max"],
    models: ["Sonar Pro"],
    color: "#1F8A8A",
    glyph: "✺",
    strengths: ["research"],
  },
  {
    id: "mistral",
    name: "Le Chat",
    vendor: "Mistral",
    plans: ["Pro", "Team"],
    models: ["Mistral Large", "Codestral"],
    color: "#F2700C",
    glyph: "▲",
    strengths: ["speed", "coding"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    vendor: "DeepSeek",
    plans: ["API"],
    models: ["DeepSeek R-series"],
    color: "#4D6BFE",
    glyph: "◆",
    strengths: ["reasoning", "coding"],
  },
];

export const providerById = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

export const INTEGRATIONS: Integration[] = [
  { id: "gmail", name: "Gmail", category: "Communication", color: "#EA4335", glyph: "M", blurb: "Triage, draft and send email", scopes: ["Read mail", "Create drafts", "Send (with approval)"] },
  { id: "gcal", name: "Google Calendar", category: "Productivity", color: "#1A73E8", glyph: "31", blurb: "Schedule, reschedule, prep meetings", scopes: ["Read events", "Create events"] },
  { id: "slack", name: "Slack", category: "Communication", color: "#4A154B", glyph: "#", blurb: "Read channels, post updates, DM teammates", scopes: ["Read channels", "Post messages"] },
  { id: "notion", name: "Notion", category: "Productivity", color: "#191919", glyph: "N", blurb: "Search and write docs & databases", scopes: ["Read pages", "Edit pages"] },
  { id: "gdrive", name: "Google Drive", category: "Productivity", color: "#0F9D58", glyph: "▲", blurb: "Find and summarise files", scopes: ["Read files"] },
  { id: "linear", name: "Linear", category: "Engineering", color: "#5E6AD2", glyph: "◐", blurb: "Create, triage and update issues", scopes: ["Read issues", "Create issues"] },
  { id: "github", name: "GitHub", category: "Engineering", color: "#24292F", glyph: "⌥", blurb: "PRs, reviews, releases", scopes: ["Read repos", "Comment on PRs"] },
  { id: "jira", name: "Jira", category: "Engineering", color: "#0052CC", glyph: "J", blurb: "Sprint and ticket management", scopes: ["Read issues", "Transition issues"] },
  { id: "hubspot", name: "HubSpot", category: "Sales & CRM", color: "#FF7A59", glyph: "H", blurb: "Contacts, deals, sequences", scopes: ["Read CRM", "Update deals"] },
  { id: "salesforce", name: "Salesforce", category: "Sales & CRM", color: "#00A1E0", glyph: "☁", blurb: "Pipeline and account data", scopes: ["Read CRM", "Update records"] },
  { id: "intercom", name: "Intercom", category: "Support", color: "#1F8DED", glyph: "▦", blurb: "Triage and answer conversations", scopes: ["Read conversations", "Reply (with approval)"] },
  { id: "zendesk", name: "Zendesk", category: "Support", color: "#03363D", glyph: "Z", blurb: "Tickets and macros", scopes: ["Read tickets", "Update tickets"] },
  { id: "stripe", name: "Stripe", category: "Finance", color: "#635BFF", glyph: "S", blurb: "Revenue, invoices, failed payments", scopes: ["Read payments"] },
  { id: "quickbooks", name: "QuickBooks", category: "Finance", color: "#2CA01C", glyph: "Q", blurb: "Books, bills and reconciliation", scopes: ["Read books"] },
  { id: "figma", name: "Figma", category: "Design", color: "#A259FF", glyph: "F", blurb: "Read files and leave comments", scopes: ["Read files", "Comment"] },
  { id: "zoom", name: "Zoom", category: "Communication", color: "#2D8CFF", glyph: "Z", blurb: "Transcripts and recordings", scopes: ["Read transcripts"] },
  { id: "asana", name: "Asana", category: "Productivity", color: "#F06A6A", glyph: "◉", blurb: "Projects and tasks", scopes: ["Read tasks", "Create tasks"] },
  { id: "airtable", name: "Airtable", category: "Productivity", color: "#FCB400", glyph: "▤", blurb: "Bases, tables and records", scopes: ["Read bases", "Edit records"] },
];

export const integrationById = (id: string) => INTEGRATIONS.find((i) => i.id === id);

export type AgentTemplate = Omit<Agent, "id" | "status" | "hiredAt"> & {
  pitch: string;
  routines: { title: string; cadence: string; nextRunMinute: number }[];
};

export const TEMPLATES: AgentTemplate[] = [
  {
    name: "Ava",
    role: "Chief of Staff",
    emoji: "🧭",
    color: "#6366F1",
    pitch: "Runs your day: morning brief, meeting prep, follow-ups nobody owns.",
    instructions:
      "Every weekday morning, brief me on what matters today. Prep a one-pager before each external meeting. Chase follow-ups I promised in email or Slack.",
    tools: ["gmail", "gcal", "slack", "notion"],
    brain: "auto",
    autonomy: "report",
    routines: [
      { title: "Morning brief", cadence: "Weekdays · 8:00", nextRunMinute: 480 },
      { title: "Meeting prep packs", cadence: "30 min before external meetings", nextRunMinute: 690 },
      { title: "End-of-day follow-ups", cadence: "Weekdays · 17:30", nextRunMinute: 1050 },
    ],
  },
  {
    name: "Iris",
    role: "Inbox Manager",
    emoji: "📥",
    color: "#EF4444",
    pitch: "Gets you to inbox zero: labels, drafts replies, unsubscribes the noise.",
    instructions:
      "Triage my inbox every hour. Archive newsletters, label by project, draft replies in my voice. Never send without my approval.",
    tools: ["gmail", "gcal"],
    brain: "claude",
    autonomy: "ask",
    routines: [{ title: "Inbox triage", cadence: "Hourly · 8:00–19:00", nextRunMinute: 600 }],
  },
  {
    name: "Rex",
    role: "Sales SDR",
    emoji: "🎯",
    color: "#F59E0B",
    pitch: "Researches inbound leads, enriches the CRM, drafts personal first-touch emails.",
    instructions:
      "For every new inbound lead, research the company, score fit against our ICP, update HubSpot, and draft a personal first-touch email.",
    tools: ["hubspot", "gmail", "slack"],
    brain: "auto",
    autonomy: "ask",
    routines: [{ title: "New lead research", cadence: "When a lead arrives", nextRunMinute: 780 }],
  },
  {
    name: "Theo",
    role: "Engineering PM",
    emoji: "🛠️",
    color: "#10B981",
    pitch: "Writes standups from GitHub & Linear, flags blocked work, drafts release notes.",
    instructions:
      "Post a standup summary to #eng at 9:30 from yesterday's PRs and Linear updates. Flag anything blocked for more than 2 days.",
    tools: ["github", "linear", "slack"],
    brain: "auto",
    autonomy: "report",
    routines: [
      { title: "Async standup", cadence: "Weekdays · 9:30", nextRunMinute: 570 },
      { title: "Release notes draft", cadence: "Fridays · 16:00", nextRunMinute: 960 },
    ],
  },
  {
    name: "Nova",
    role: "Support Lead",
    emoji: "💬",
    color: "#0EA5E9",
    pitch: "Triages tickets, drafts answers from your docs, escalates the angry ones.",
    instructions:
      "Tag and prioritise new conversations. Draft answers using our help center in Notion. Escalate churn-risk customers to #support-urgent.",
    tools: ["intercom", "notion", "slack"],
    brain: "auto",
    autonomy: "ask",
    routines: [{ title: "Ticket triage", cadence: "Every 15 min", nextRunMinute: 615 }],
  },
  {
    name: "Finn",
    role: "Finance Ops",
    emoji: "📊",
    color: "#8B5CF6",
    pitch: "Chases failed payments, reconciles Stripe to the books, weekly revenue digest.",
    instructions:
      "Every Monday, send a revenue digest. Daily, retry-notify customers with failed payments and reconcile Stripe payouts in QuickBooks.",
    tools: ["stripe", "quickbooks", "gmail", "slack"],
    brain: "chatgpt",
    autonomy: "ask",
    routines: [{ title: "Revenue digest", cadence: "Mondays · 9:00", nextRunMinute: 540 }],
  },
  {
    name: "Mira",
    role: "Recruiter",
    emoji: "🧲",
    color: "#EC4899",
    pitch: "Screens applicants, schedules interviews, keeps candidates warm.",
    instructions:
      "Screen new applicants against the role scorecard. Schedule interviews for strong fits and send friendly updates to everyone else.",
    tools: ["gmail", "gcal", "notion"],
    brain: "claude",
    autonomy: "ask",
    routines: [{ title: "Applicant screening", cadence: "Daily · 11:00", nextRunMinute: 660 }],
  },
  {
    name: "Leo",
    role: "Market Researcher",
    emoji: "🔭",
    color: "#14B8A6",
    pitch: "Watches competitors, summarises launches and pricing changes every week.",
    instructions:
      "Track our five main competitors. Every Thursday, post what changed — launches, pricing, hiring — to #strategy with sources.",
    tools: ["slack", "notion", "gdrive"],
    brain: "perplexity",
    autonomy: "auto",
    routines: [{ title: "Competitor watch", cadence: "Thursdays · 10:00", nextRunMinute: 600 }],
  },
];

export const AUTONOMY: Record<string, { label: string; hint: string }> = {
  ask: { label: "Ask first", hint: "Drafts everything, waits for your approval before acting outside." },
  report: { label: "Act & report", hint: "Does routine work on its own, asks before anything irreversible." },
  auto: { label: "Full autonomy", hint: "Acts independently within its tools. Best for read-only jobs." },
};
