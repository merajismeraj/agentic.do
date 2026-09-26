import type { Schedule } from "./schedule";

export type ProviderId =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "grok"
  | "copilot"
  | "perplexity"
  | "mistral"
  | "deepseek";

export type Strength = "reasoning" | "writing" | "coding" | "research" | "speed" | "vision";

export interface Provider {
  id: ProviderId;
  name: string;
  vendor: string;
  plans: string[];
  models: string[];
  color: string;
  glyph: string;
  strengths: Strength[];
}

export interface Brain {
  providerId: ProviderId;
  plan: string;
  /** 0–100, share of the plan's rolling limit already consumed */
  usage: number;
  resetsIn: string;
  enabled: boolean;
  connectedAt: number;
}

export type IntegrationCategory =
  | "Communication"
  | "Productivity"
  | "Engineering"
  | "Sales & CRM"
  | "Support"
  | "Finance"
  | "Design";

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  color: string;
  glyph: string;
  blurb: string;
  scopes: string[];
}

export type Autonomy = "ask" | "report" | "auto";

export interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  instructions: string;
  tools: string[];
  /** "auto" routes to the best connected brain per task */
  brain: ProviderId | "auto";
  autonomy: Autonomy;
  status: "idle" | "working" | "paused";
  hiredAt: number;
}

export interface Routine {
  id: string;
  agentId: string;
  title: string;
  /** Human-readable schedule; `schedule` is the machine form (derived from this when absent). */
  cadence: string;
  schedule?: Schedule;
  /** Occurrences before this are never run (so a new 8:00 routine created at 8:30 waits for tomorrow). */
  createdAt?: number;
  /** minutes after midnight for the next run, used to lay out today's timeline */
  nextRunMinute: number;
  enabled: boolean;
  lastResult?: string;
}

export type StepKind = "route" | "think" | "tool" | "result" | "approval";

export interface Step {
  id: string;
  kind: StepKind;
  label: string;
  detail?: string;
  toolId?: string;
  providerId?: ProviderId;
  state: "pending" | "running" | "done";
}

export interface Message {
  id: string;
  threadId: string;
  author: "user" | "agent";
  agentId?: string;
  text: string;
  at: number;
  steps?: Step[];
  approvalId?: string;
  approvalIds?: string[];
  /** "live" when a real model ran; "demo" when simulated */
  mode?: "live" | "demo";
  error?: string;
  /** Set when a routine (scheduled or "Run now") produced this message. */
  trigger?: { routineId: string; title: string; scheduled: boolean };
}

export interface RoutineRun {
  id: string;
  routineId: string;
  scheduledFor: number;
  status: "running" | "done" | "failed";
  manual: boolean;
  finishedAt?: number;
  error?: string;
  messageId?: string;
  needsApproval?: boolean;
}

export interface Approval {
  id: string;
  agentId: string;
  threadId?: string;
  title: string;
  summary: string;
  toolId: string;
  preview: { label: string; value: string }[];
  status: "pending" | "approved" | "rejected";
  at: number;
  /** The tool call to execute once approved (live runs only). */
  call?: { tool: string; input: Record<string, unknown> };
  result?: string;
}

export interface Activity {
  id: string;
  agentId: string;
  text: string;
  toolId?: string;
  at: number;
}

export interface MemoryFact {
  id: string;
  text: string;
  source: string;
  scope: "me" | "team" | "company";
}

export interface User {
  name: string;
  company: string;
  role: string;
  timezone: string;
}

export interface State {
  onboarded: boolean;
  user: User;
  brains: Brain[];
  routing: "auto" | "cost" | "quality";
  connected: string[];
  agents: Agent[];
  routines: Routine[];
  messages: Message[];
  approvals: Approval[];
  activity: Activity[];
  memory: MemoryFact[];
  routineRuns?: RoutineRun[];
  /** Email alerts for unattended work. Missing means on. */
  notifications?: NotificationPrefs;
}

export interface NotificationPrefs {
  approvals: boolean;
  failures: boolean;
}

export interface RunRequest {
  agent: Agent;
  text: string;
  threadId: string;
  history: { role: "user" | "assistant"; text: string }[];
  brains: Brain[];
  routing: State["routing"];
  connected: string[];
  memory: MemoryFact[];
  user: User;
}

export type RunEvent =
  | { t: "step"; step: Step }
  | { t: "text"; text: string }
  | { t: "approval"; approval: Approval }
  | { t: "done"; mode: "live" | "demo" }
  | { t: "error"; message: string };

export interface LiveStatus {
  providers: Record<
    ProviderId,
    {
      live: boolean;
      model: string;
      liveCapable: boolean;
      /** Whose key powers it: this workspace's own, or the operator's shared one. Only the last 4 chars are exposed. */
      key?: { source: "workspace" | "shared"; hint: string };
    }
  >;
  tools: Record<string, boolean>;
  /** This account may use the operator's server-wide keys and tool tokens. */
  sharedKeys: boolean;
  google: { configured: boolean; email?: string };
  slack: { configured: boolean; team?: string };
  email: { configured: boolean };
}
