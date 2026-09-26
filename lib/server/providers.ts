import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ProviderId } from "../types";
import type { ToolDef } from "./tools";

/**
 * Provider adapters. Consumer chat subscriptions (ChatGPT Plus, Claude Pro…)
 * can't be called by third-party apps, so live execution uses each vendor's
 * API key. Without a key a provider stays usable in demo mode only.
 */

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AgentRunArgs {
  system: string;
  history: Turn[];
  tools: ToolDef[];
  /** Executes a tool and returns what the model should see. */
  callTool: (call: ToolCall) => Promise<string>;
  maxTurns?: number;
}

export interface ProviderAdapter {
  id: ProviderId;
  model: string;
  available: boolean;
  supportsTools: boolean;
  run: (args: AgentRunArgs) => Promise<string>;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

/* ------------------------------ Anthropic -------------------------- */

function anthropicAdapter(): ProviderAdapter {
  const model = env("CLAUDE_MODEL") ?? "claude-opus-5";
  return {
    id: "claude",
    model,
    available: !!(env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN")),
    supportsTools: true,
    async run({ system, history, tools, callTool, maxTurns = 8 }) {
      const client = new Anthropic();
      const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.text }));
      const defs: Anthropic.Beta.BetaTool[] = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

      for (let turn = 0; turn < maxTurns; turn++) {
        const res = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          system,
          tools: defs,
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          // Server-side fallback: if the model declines, the API reroutes inside the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });

        if (res.stop_reason === "refusal") return "I can't help with that request.";
        messages.push({ role: "assistant", content: res.content });

        const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        const text = res.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (res.stop_reason !== "tool_use" || !uses.length) return text;

        // Run parallel calls together and return every result in one user message.
        const results = await Promise.all(
          uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
            try {
              return { type: "tool_result", tool_use_id: u.id, content: await callTool({ name: u.name, input: (u.input ?? {}) as Record<string, unknown> }) };
            } catch (e) {
              return { type: "tool_result", tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true };
            }
          }),
        );
        messages.push({ role: "user", content: results });
      }
      return "I ran out of steps before finishing — here's where I got to. Ask me to continue.";
    },
  };
}

/* ------------------------- OpenAI-compatible ----------------------- */

function openAICompatible(opts: {
  id: ProviderId;
  keyVar: string;
  modelVar: string;
  defaultModel: string;
  baseURL?: string;
  supportsTools?: boolean;
}): ProviderAdapter {
  const model = env(opts.modelVar) ?? opts.defaultModel;
  const supportsTools = opts.supportsTools ?? true;
  return {
    id: opts.id,
    model,
    available: !!env(opts.keyVar),
    supportsTools,
    async run({ system, history, tools, callTool, maxTurns = 8 }) {
      const client = new OpenAI({ apiKey: env(opts.keyVar), baseURL: opts.baseURL });
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: system },
        ...history.map((t) => ({ role: t.role, content: t.text }) as OpenAI.Chat.ChatCompletionMessageParam),
      ];
      const defs: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));

      for (let turn = 0; turn < maxTurns; turn++) {
        const res = await client.chat.completions.create({
          model,
          messages,
          ...(supportsTools && defs.length ? { tools: defs } : {}),
        });
        const msg = res.choices[0]?.message;
        if (!msg) return "";
        messages.push(msg);
        const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
        if (!calls.length) return msg.content?.trim() ?? "";

        for (const c of calls) {
          let content: string;
          try {
            const input = JSON.parse(c.function.arguments || "{}") as Record<string, unknown>;
            content = await callTool({ name: c.function.name, input });
          } catch (e) {
            content = `Error: ${(e as Error).message}`;
          }
          messages.push({ role: "tool", tool_call_id: c.id, content });
        }
      }
      return "I ran out of steps before finishing — ask me to continue.";
    },
  };
}

export function adapters(): Record<ProviderId, ProviderAdapter> {
  return {
    claude: anthropicAdapter(),
    chatgpt: openAICompatible({ id: "chatgpt", keyVar: "OPENAI_API_KEY", modelVar: "OPENAI_MODEL", defaultModel: "gpt-5" }),
    gemini: openAICompatible({
      id: "gemini",
      keyVar: "GEMINI_API_KEY",
      modelVar: "GEMINI_MODEL",
      defaultModel: "gemini-2.5-pro",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    }),
    grok: openAICompatible({ id: "grok", keyVar: "XAI_API_KEY", modelVar: "XAI_MODEL", defaultModel: "grok-4", baseURL: "https://api.x.ai/v1" }),
    mistral: openAICompatible({ id: "mistral", keyVar: "MISTRAL_API_KEY", modelVar: "MISTRAL_MODEL", defaultModel: "mistral-large-latest", baseURL: "https://api.mistral.ai/v1" }),
    deepseek: openAICompatible({ id: "deepseek", keyVar: "DEEPSEEK_API_KEY", modelVar: "DEEPSEEK_MODEL", defaultModel: "deepseek-chat", baseURL: "https://api.deepseek.com" }),
    perplexity: openAICompatible({
      id: "perplexity",
      keyVar: "PERPLEXITY_API_KEY",
      modelVar: "PERPLEXITY_MODEL",
      defaultModel: "sonar-pro",
      baseURL: "https://api.perplexity.ai",
      supportsTools: false,
    }),
    // Microsoft Copilot has no public model API; it stays demo-only.
    copilot: { id: "copilot", model: "Copilot", available: false, supportsTools: false, run: async () => "" },
  };
}

export function providerStatus() {
  const a = adapters();
  return Object.fromEntries(Object.values(a).map((p) => [p.id, { live: p.available, model: p.model }])) as Record<
    ProviderId,
    { live: boolean; model: string }
  >;
}
