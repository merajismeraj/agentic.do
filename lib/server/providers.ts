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

function anthropicAdapter(apiKey: string | undefined): ProviderAdapter {
  const model = env("CLAUDE_MODEL") ?? "claude-opus-5";
  return {
    id: "claude",
    model,
    available: !!apiKey,
    supportsTools: true,
    async run({ system, history, tools, callTool, maxTurns = 8 }) {
      const client = new Anthropic({ apiKey });
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

function openAICompatible(apiKey: string | undefined, opts: {
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
    available: !!apiKey,
    supportsTools,
    async run({ system, history, tools, callTool, maxTurns = 8 }) {
      const client = new OpenAI({ apiKey, baseURL: opts.baseURL });
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

/** Per-provider settings for the OpenAI-compatible APIs. */
const COMPAT: Record<Exclude<ProviderId, "claude" | "copilot">, Parameters<typeof openAICompatible>[1]> = {
  chatgpt: { id: "chatgpt", keyVar: "OPENAI_API_KEY", modelVar: "OPENAI_MODEL", defaultModel: "gpt-5" },
  gemini: {
    id: "gemini",
    keyVar: "GEMINI_API_KEY",
    modelVar: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-pro",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  grok: { id: "grok", keyVar: "XAI_API_KEY", modelVar: "XAI_MODEL", defaultModel: "grok-4", baseURL: "https://api.x.ai/v1" },
  mistral: { id: "mistral", keyVar: "MISTRAL_API_KEY", modelVar: "MISTRAL_MODEL", defaultModel: "mistral-large-latest", baseURL: "https://api.mistral.ai/v1" },
  deepseek: { id: "deepseek", keyVar: "DEEPSEEK_API_KEY", modelVar: "DEEPSEEK_MODEL", defaultModel: "deepseek-chat", baseURL: "https://api.deepseek.com" },
  perplexity: {
    id: "perplexity",
    keyVar: "PERPLEXITY_API_KEY",
    modelVar: "PERPLEXITY_MODEL",
    defaultModel: "sonar-pro",
    baseURL: "https://api.perplexity.ai",
    supportsTools: false,
  },
};

export type AiKeys = Partial<Record<ProviderId, string>>;

/** Adapters bound to the given keys; a provider without a key is unavailable. */
export function adapters(keys: AiKeys = {}): Record<ProviderId, ProviderAdapter> {
  const compat = Object.fromEntries(Object.entries(COMPAT).map(([id, o]) => [id, openAICompatible(keys[id as ProviderId], o)]));
  return {
    claude: anthropicAdapter(keys.claude),
    ...(compat as Record<keyof typeof COMPAT, ProviderAdapter>),
    // Microsoft Copilot has no public model API; it stays demo-only.
    copilot: { id: "copilot", model: "Copilot", available: false, supportsTools: false, run: async () => "" },
  };
}

/** The operator's server-wide keys from the environment (only used where SHARED_AI_KEYS allows). */
export function envKeys(): AiKeys {
  const out: AiKeys = {};
  if (env("ANTHROPIC_API_KEY")) out.claude = env("ANTHROPIC_API_KEY");
  for (const [id, o] of Object.entries(COMPAT)) if (env(o.keyVar)) out[id as ProviderId] = env(o.keyVar);
  return out;
}

export const liveCapable = (id: ProviderId) => id !== "copilot";

/**
 * Checks a key with the provider before it's stored. Returns an error message
 * the user can act on, or null when the key works.
 */
export async function verifyKey(id: ProviderId, apiKey: string): Promise<string | null> {
  if (!liveCapable(id)) return "This provider has no public API, so it can't run live yet.";
  const name = { claude: "Anthropic", chatgpt: "OpenAI", gemini: "Google AI Studio", grok: "xAI", mistral: "Mistral", deepseek: "DeepSeek", perplexity: "Perplexity" }[id as string] ?? id;
  try {
    if (id === "claude") await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
    else if (id === "perplexity") return null; // No key-check endpoint; the first run will surface a bad key.
    else await new OpenAI({ apiKey, baseURL: COMPAT[id as keyof typeof COMPAT].baseURL, maxRetries: 0, timeout: 15_000 }).models.list();
    return null;
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return `${name} rejected this key. Check you copied all of it and that it's active.`;
    if (status === 429) return `${name} says this key is out of credit or rate-limited.`;
    return `Couldn't reach ${name} to check the key (${(e as Error).message.slice(0, 120)}). Try again.`;
  }
}

export function providerStatus(keys: AiKeys = {}) {
  const a = adapters(keys);
  return Object.fromEntries(Object.values(a).map((p) => [p.id, { live: p.available, model: p.model }])) as Record<
    ProviderId,
    { live: boolean; model: string }
  >;
}
