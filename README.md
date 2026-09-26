# agentic.do

AI teammates that connect to your tools, understand your context, and get work done on schedule — powered by the AI subscriptions you already pay for (ChatGPT, Claude, Gemini, SuperGrok, Copilot, Perplexity, Mistral, DeepSeek… as many as you have).

```bash
npm install
npm run dev        # http://localhost:3000
```

Click **Explore live demo** on the landing page for a fully populated workspace, or **Get started** for the 2‑minute onboarding.

## Product surface

| Area | Route | What it does |
| --- | --- | --- |
| Landing | `/` | Positioning, live product preview, routing visual, templates, pricing |
| Onboarding | `/onboarding` | You → bring your AIs → connect tools → hire teammates (role‑aware defaults) |
| Home | `/app` | Delegate box with auto‑assignment + `@mentions`, approvals, today's schedule, AI capacity, activity |
| Approvals | `/app/inbox` | Human‑in‑the‑loop queue; edit before approve; `J`/`K`/`A`/`X` shortcuts |
| Teammates | `/app/agents`, `/app/agents/[id]` | Hire from templates, chat with visible work trace, routines, settings |
| Routines | `/app/schedule` | Day timeline + list of recurring work |
| AI accounts | `/app/brains` | Pool subscriptions, usage meters, routing mode, live routing preview, failover |
| Integrations | `/app/integrations` | Connect tools; surfaces tools teammates are blocked on |
| Context | `/app/memory` | Editable memory about you / team / company |

Global: `⌘K` command palette (navigate or delegate in one line), light/dark theme, mobile layout.

## UX principles baked in

- **Delegate in one line.** Type the outcome; the right teammate is picked for you (or `@mention`).
- **Show the work.** Every run shows which model was routed, which tools were called, and what was found.
- **Draft, then act.** Anything leaving the company waits in Approvals — editable, one tap to approve.
- **Your AI, pooled.** Tasks route by strength and remaining plan capacity; near‑limit plans fail over automatically.
- **Context you can see.** Memory is a list you can read, add to, and delete from.

## Architecture

- Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · TypeScript
- `lib/catalog.ts` — providers, integrations, teammate templates
- `lib/engine.ts` — routing (`route`), planning (`plan`), auto‑assignment (`assign`)
- `lib/store.tsx` — client store persisted to `localStorage`, run simulation, approvals
- `lib/seed.ts` — empty and demo workspaces

**Currently simulated:** provider sign‑in, tool OAuth, and agent execution are mocked in the client so the full UX can be explored without keys. The seams are deliberate: `route()` and `plan()` are the places to swap in real provider adapters and tool calls (e.g. MCP servers) behind an API route, and the store's `send()` becomes a streamed server run.
