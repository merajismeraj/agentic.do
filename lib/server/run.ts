import "server-only";
import { AUTONOMY, providerById } from "../catalog";
import { plan, rank, truncate } from "../engine";
import { EMPTY } from "../seed";
import type { Approval, RunEvent, RunRequest, Step } from "../types";
import { uid } from "../utils";
import { adapters } from "./providers";
import { toolByName, toolsFor, type ToolContext } from "./tools";

type Emit = (e: RunEvent) => void;

const q = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const ACTION: Record<string, (i: Record<string, unknown>) => string> = {
  gmail_send: (i) => `Email ${q(i.to)}: “${q(i.subject)}”`,
  calendar_create_event: (i) => `Schedule “${q(i.title)}”`,
  slack_post_message: (i) => `Post to ${q(i.channel)}`,
  github_comment: (i) => `Comment on #${q(i.number)}`,
  linear_create_issue: (i) => `Create issue “${q(i.title)}”`,
  hubspot_update_deal: (i) => `Update ${q(i.record)} in HubSpot`,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function execute(req: RunRequest, emit: Emit, ctx: ToolContext, opts: { requireLive?: boolean } = {}) {
  const all = adapters();
  const order = rank(req.brains, req.agent, req.text, req.routing);
  const live = order.filter((d) => all[d.providerId]?.available);

  if (!order.length) {
    emit({ t: "error", message: "No AI account is connected yet — add one in AI accounts, then try again." });
    return;
  }
  if (!live.length) {
    // Unattended runs never fabricate results into a real workspace.
    if (opts.requireLive) {
      emit({ t: "error", message: "None of your AI accounts can run live yet — add an API key to one of them in AI accounts." });
      return;
    }
    return simulate(req, emit, true);
  }

  const system = systemPrompt(req);
  const tools = toolsFor(req.agent.tools.filter((t) => req.connected.includes(t)));
  const history = trimHistory([...req.history, { role: "user" as const, text: req.text }]);

  for (let i = 0; i < live.length; i++) {
    const decision = live[i];
    const adapter = all[decision.providerId];
    const p = providerById(decision.providerId);
    let toolCalls = 0;

    const route: Step = {
      id: uid(),
      kind: "route",
      label: `Routed to ${p.name} · ${adapter.model}`,
      detail:
        i > 0
          ? `Failed over from ${providerById(live[i - 1].providerId).name}`
          : decision.providerId === order[0].providerId
            ? decision.reason
            : `${providerById(order[0].providerId).name} has no API key yet — using the next best`,
      providerId: decision.providerId,
      state: "done",
    };
    emit({ t: "step", step: route });
    const think: Step = { id: uid(), kind: "think", label: "Thinking", detail: `${req.memory.length} context notes`, state: "running" };
    emit({ t: "step", step: think });

    try {
      const text = await adapter.run({
        system,
        history,
        tools: adapter.supportsTools ? tools : [],
        callTool: async ({ name, input }) => {
          toolCalls++;
          if (think.state !== "done") emit({ t: "step", step: Object.assign(think, { state: "done" as const }) });
          const tool = toolByName(name);
          if (!tool || !tools.includes(tool)) return `Error: tool ${name} is not available to this teammate.`;

          const needsApproval = tool.kind === "write" && req.agent.autonomy !== "auto";
          if (needsApproval) {
            const approval: Approval = {
              id: uid(),
              agentId: req.agent.id,
              threadId: req.threadId,
              toolId: tool.integration,
              title: truncate(ACTION[tool.name]?.(input) ?? tool.label, 80),
              summary: `${req.agent.name} prepared this with ${p.name} for: “${truncate(req.text.replace(/@\w+\s*/g, ""), 90)}”`,
              preview: tool.preview?.(input) ?? [{ label: "Action", value: JSON.stringify(input, null, 2) }],
              status: "pending",
              at: Date.now(),
              call: { tool: tool.name, input },
            };
            emit({ t: "approval", approval });
            emit({
              t: "step",
              step: { id: uid(), kind: "approval", toolId: tool.integration, label: `${tool.label} — waiting for your OK`, state: "done" },
            });
            return "Queued for the user's approval; it has NOT been executed. Tell the user it is waiting in Approvals. Do not call this tool again for the same action.";
          }

          const step: Step = { id: uid(), kind: "tool", toolId: tool.integration, label: tool.label, state: "running" };
          emit({ t: "step", step });
          try {
            const result = await tool.run(input, ctx);
            emit({ t: "step", step: { ...step, state: "done", detail: result.live ? result.summary : `${result.summary} · demo data` } });
            return JSON.stringify({ summary: result.summary, data: result.data, source: result.live ? "live" : "demo fixture" });
          } catch (e) {
            emit({ t: "step", step: { ...step, state: "done", detail: `Failed: ${(e as Error).message}` } });
            throw e;
          }
        },
      });
      if (think.state !== "done") emit({ t: "step", step: { ...think, state: "done" } });
      emit({ t: "text", text: text || "Done." });
      emit({ t: "done", mode: "live" });
      return;
    } catch (e) {
      const message = friendlyError(e);
      emit({ t: "step", step: { ...think, state: "done", label: `${p.name} failed`, detail: truncate(message, 140) } });
      // Only fail over when nothing has happened yet — retrying after tool calls could duplicate work.
      if (toolCalls === 0 && i < live.length - 1) continue;
      emit({ t: "error", message });
      return;
    }
  }
}

/** Provider SDK errors carry the vendor's JSON body; surface just its message. */
function friendlyError(e: unknown) {
  const err = e as { status?: number; error?: { error?: { message?: string }; message?: string }; message?: string };
  const inner = err.error?.error?.message ?? err.error?.message;
  if (err.status && inner) return `${err.status} · ${inner}`;
  return err.message ?? "Unknown error";
}

function trimHistory(turns: RunRequest["history"]) {
  const recent = turns.filter((t) => t.text.trim()).slice(-12);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}

function systemPrompt(req: RunRequest) {
  const { agent, user, memory } = req;
  const facts = memory.map((m) => `- (${m.scope}) ${m.text}`).join("\n") || "- (none yet)";
  return `You are ${agent.name}, the ${agent.role} on ${user.name || "the user"}'s team${user.company ? ` at ${user.company}` : ""}. You are an AI teammate that gets real work done using the tools you have been given.

Your job description, written by ${user.name || "the user"}:
${agent.instructions || "(not specified — be generally helpful within your role)"}

What you know about the user and their work:
${facts}

How you work:
- Use your tools to gather facts before answering; never invent emails, numbers, people or events. If a tool result is marked "demo fixture", treat it as real for the task but don't claim it came from a live system.
- Autonomy level: ${AUTONOMY[agent.autonomy].label}. ${AUTONOMY[agent.autonomy].hint} Actions that change things outside the company (sending, posting, creating, updating) go through approval unless you have full autonomy; when a tool says an action is queued for approval, say so plainly — never claim it was sent.
- Write in the user's voice when drafting: short, direct, no filler.
- Reply in concise Markdown: lead with the answer, then at most a few "• " bullets with **bold** key facts. No headings.
- Timezone: ${user.timezone || "unknown"}. Today is ${new Date().toDateString()}.`;
}

/* ------------------------------ Demo mode --------------------------- */

export async function simulate(req: RunRequest, emit: Emit, hasBrains: boolean) {
  const state = {
    ...EMPTY,
    user: req.user,
    brains: req.brains,
    routing: req.routing,
    connected: req.connected,
    memory: req.memory,
    agents: [req.agent],
  };
  const p = plan(state, req.agent, req.text, req.threadId);
  for (const [i, step] of p.steps.entries()) {
    const s = { ...step, detail: i === 0 && hasBrains ? `${step.detail} · demo mode (no API key configured)` : step.detail };
    emit({ t: "step", step: { ...s, state: "running" } });
    await sleep(step.kind === "tool" ? 700 : 450);
    emit({ t: "step", step: { ...s, state: "done" } });
  }
  if (p.approval) {
    emit({
      t: "approval",
      approval: { ...p.approval, id: uid(), status: "pending", at: Date.now() },
    });
  }
  emit({ t: "text", text: p.finalText });
  emit({ t: "done", mode: "demo" });
}

