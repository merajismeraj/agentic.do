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
- `lib/store.tsx` — client store persisted to `localStorage`; streams runs from `/api/run`, executes approvals
- `lib/seed.ts` — empty and demo workspaces
- `lib/server/run.ts` — run orchestrator: routing, failover, tool loop, approval gate, NDJSON events
- `lib/server/providers.ts` — Anthropic SDK adapter + OpenAI-compatible adapter (OpenAI, Gemini, xAI, Mistral, DeepSeek, Perplexity)
- `lib/server/tools.ts` — tool registry; live connectors for Slack, GitHub and Linear, demo data for the rest
- `lib/server/google.ts` + `lib/server/seal.ts` — Google OAuth, Gmail/Calendar client, encrypted session cookie
- `app/api/run` (stream a run) · `app/api/approve` (execute an approved action) · `app/api/status` (what's live) · `app/api/oauth/google/*` (start, callback, disconnect)

## Execution

Copy `.env.example` to `.env.local` and add keys. Chat subscriptions (ChatGPT Plus, Claude Pro, …) can't be called by third‑party apps, so **live runs use each provider's API key**. Anything without a key keeps working in demo mode, and the UI labels each run **Live** or **Demo**.

How a run works:

1. **Route.** The task is classified (writing, research, coding…) and ranked across your enabled AI accounts by fit and remaining capacity. Accounts with a key run live.
2. **Tool loop.** The model calls the teammate's tools (only those you've connected). Every call streams to the UI as a step.
3. **Approval gate.** Write actions (send email, post to Slack, create issue…) are never executed during the run unless the teammate has full autonomy. They become approval cards. **Approve** calls `/api/approve`, which runs the action, with any edits you made on the card.
4. **Failover.** If a provider errors before any tool has run, the run moves to the next ranked provider. After a tool has run, it stops rather than risk doing the work twice.

Live connectors today: **Gmail and Google Calendar** (per-user Google sign-in), Slack (`SLACK_BOT_TOKEN`), GitHub (`GITHUB_TOKEN`, `GITHUB_REPO`), Linear (`LINEAR_API_KEY`). Notion, HubSpot, Stripe and Intercom return demo data until their OAuth is added.

### Google sign-in (Gmail + Calendar)

1. In Google Cloud, enable the **Gmail API** and the **Google Calendar API**.
2. Configure the OAuth consent screen. While it's in *Testing*, add your own Google account as a test user.
3. Create an OAuth client of type **Web application** with the redirect URI `http://localhost:3000/api/oauth/google/callback` (plus your production URL).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (32+ random characters).
5. In the app, open **Integrations → Gmail → Connect** (or **Go live**) and choose **Continue with Google**.

One sign-in covers both tools. Scopes: `gmail.readonly`, `gmail.send`, `calendar.events`, plus `openid email`. The refresh token is stored in an **AES-256-GCM encrypted, httpOnly cookie**, so each browser acts as its own Google account and the server keeps no Google credentials. **Disconnect** revokes the token at Google.

What teammates can do with it: search mail (Gmail query syntax), read a day's calendar in your timezone, and, after you approve, send email (threaded replies when replying) and create events with invites.

Before a public launch: `gmail.readonly` and `gmail.send` are restricted scopes, so Google requires app verification and a third-party security assessment. Until then, only test users can connect.

`npm test` runs the Google suite against a mocked Google API: sign-in, state check, redirect safety, encrypted session, refresh, Gmail and Calendar calls, header-injection safety, and revoke.

**Not production‑ready yet:** there are no user accounts. Google actions use the caller's own session, but the provider API keys and the Slack, GitHub and Linear tokens are server-wide, and `/api/run` and `/api/approve` are unauthenticated. Keep deployments private until auth lands. Workspace state still lives in the browser (`localStorage`).
