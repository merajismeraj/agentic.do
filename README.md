# agentic.do

AI teammates that connect to your tools, understand your context, and get work done on schedule — powered by the AI subscriptions you already pay for (ChatGPT, Claude, Gemini, SuperGrok, Copilot, Perplexity, Mistral, DeepSeek… as many as you have).

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET at minimum
npm run dev                  # http://localhost:3000
npm test                     # API + auth + Google suite (in-memory Postgres, mocked vendors)
```

**Get started** creates an account and runs the 2‑minute onboarding. **Explore live demo** opens a sample workspace with no account: it lives in the browser and is always simulated.

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
- `lib/store.tsx` — client store: account mode (server-synced, versioned) or demo mode (browser-only)
- `lib/server/db.ts` — Postgres (`DATABASE_URL`) or embedded PGlite; schema bootstrapped on start
- `lib/server/auth.ts` — accounts (scrypt), sessions (hashed tokens), same-origin checks
- `lib/server/workspace.ts` — workspace document, messages, approvals, activity, encrypted connections
- `lib/seed.ts` — empty and demo workspaces
- `lib/server/run.ts` — run orchestrator: routing, failover, tool loop, approval gate, NDJSON events
- `lib/server/providers.ts` — Anthropic SDK adapter + OpenAI-compatible adapter (OpenAI, Gemini, xAI, Mistral, DeepSeek, Perplexity)
- `lib/server/tools.ts` — tool registry; live connectors for Slack, GitHub and Linear, demo data for the rest
- `lib/server/google.ts` + `lib/server/seal.ts` — Google sign-in and Gmail/Calendar connection, AES-256-GCM sealing
- API: `auth/{signup,login,logout}` · `auth/google/{start,callback}` · `me` · `workspace` · `run` · `approvals/[id]` · `connections/google` · `status`

## Accounts and data

- **Sign-in:** email + password (scrypt, 10+ chars, rate-limited) or **Sign in with Google** (identity scopes only). A Google login links to an existing account only when Google says the email is verified.
- **Sessions:** a random 256-bit token in an httpOnly, SameSite=Lax cookie; the database stores only its SHA-256. Writes also require a same-origin `Origin` header.
- **Workspace:** teammates, routines, AI accounts, context and profile are one versioned document per account. Every save sends the version it was based on, so two tabs can't silently overwrite each other; the loser gets the latest copy.
- **Server-authoritative:** messages, approvals and activity are written by the server. A run takes only `agentId` + `text` from the browser; the teammate's tools, prompt, AI accounts and memory are loaded from the database. Approving executes the stored action; the browser can edit only the text fields that tool declares editable, and an action can't execute twice.
- **Demo:** signed-out visitors get a browser-only sample workspace. `/api/run` simulates it without calling any model or tool, so the demo can't spend your API credit.

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
3. Create an OAuth client of type **Web application** with the redirect URI `http://localhost:3000/api/auth/google/callback` (plus your production URL).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (32+ random characters).
5. **Continue with Google** now appears on the sign-in page. To give teammates Gmail and Calendar, open **Integrations → Gmail → Connect** (or **Go live**).

Signing in only asks for identity (`openid email profile`). Connecting asks for `gmail.readonly`, `gmail.send` and `calendar.events`; one consent covers both tools. Tokens are stored per workspace, **encrypted with AES-256-GCM**, and refreshed automatically, which is what will let scheduled routines use them later. **Disconnect** revokes the token at Google and deletes it.

What teammates can do with it: search mail (Gmail query syntax), read a day's calendar in your timezone, and, after you approve, send email (threaded replies when replying) and create events with invites.

Before a public launch: `gmail.readonly` and `gmail.send` are restricted scopes, so Google requires app verification and a third-party security assessment. Until then, only test users can connect.

`npm test` runs 17 end-to-end checks against the real route handlers: accounts, sessions, rate limits, cross-site blocking, workspace versioning, persisted runs, approval tampering and double-execution, cross-account isolation, demo lockdown, and the Google sign-in, connect, refresh and send paths.

**Before production:**
- AI provider keys and the Slack, GitHub and Linear tokens are still **server-wide**, so every account uses them. Give each workspace its own keys before inviting other people.
- The login rate limiter is in-memory, so it's per instance. Use Redis or Upstash when running more than one.
- There's no email verification or password reset yet.
