# agentic.do

AI teammates that connect to your tools, understand your context, and get work done on schedule — powered by the AI subscriptions you already pay for (ChatGPT, Claude, Gemini, SuperGrok, Copilot, Perplexity, Mistral, DeepSeek… as many as you have).

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET at minimum
npm run dev                  # http://localhost:3000
npm test                     # schedule + API suites (in-memory Postgres, mocked vendors)
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
- `lib/schedule.ts` — routine schedules, next/previous occurrence in the user's timezone (DST-safe)
- `lib/server/runner.ts` — one persisted teammate run, shared by chat, Run now and the scheduler
- `lib/server/scheduler.ts` — finds due routines, claims each occurrence once, runs them; `instrumentation.ts` + `api/cron/tick` drive it
- `lib/server/notify.ts` + `lib/server/mailer.ts` — email alert outbox (dedupe, grouping, retries) and Resend delivery
- `scripts/supabase-cron.mts` — installs the Supabase `pg_cron` job (secret in Vault)
- `lib/server/google.ts` + `lib/server/seal.ts` — Google sign-in and Gmail/Calendar connection, AES-256-GCM sealing
- API: `auth/{signup,login,logout}` · `auth/google/{start,callback}` · `me` · `workspace` · `run` · `approvals/[id]` · `connections/google` · `status` · `cron/tick` · `notifications/test`

## Accounts and data

- **Sign-in:** email + password (scrypt, 10+ chars, rate-limited) or **Sign in with Google** (identity scopes only). A Google login links to an existing account only when Google says the email is verified.
- **Sessions:** a random 256-bit token in an httpOnly, SameSite=Lax cookie; the database stores only its SHA-256. Writes also require a same-origin `Origin` header.
- **Workspace:** teammates, routines, AI accounts, context and profile are one versioned document per account. Every save sends the version it was based on, so two tabs can't silently overwrite each other; the loser gets the latest copy.
- **Server-authoritative:** messages, approvals and activity are written by the server. A run takes only `agentId` + `text` from the browser; the teammate's tools, prompt, AI accounts and memory are loaded from the database. Approving executes the stored action; the browser can edit only the text fields that tool declares editable, and an action can't execute twice.
- **Demo:** signed-out visitors get a browser-only sample workspace. `/api/run` simulates it without calling any model or tool, so the demo can't spend your API credit.

## Routines (scheduler)

Routines run on their own at the scheduled time, in the account's timezone.

- **Schedules:** weekdays, every day, specific days, every hour in a window, every 15/30/45 minutes in a window, or *when something happens*. Event triggers aren't wired yet, so those routines run on demand with **Run now**.
- **Exactly once:** each occurrence is claimed in `routine_runs`, which has a unique (workspace, routine, time) key. Any number of schedulers or instances can tick at once and each 08:00 still runs once.
- **Catch-up, not replay:** after downtime, an occurrence still runs if it's under 90 minutes late. Anything older is skipped rather than sent late. A new routine never runs occurrences from before it was created. Disabled routines and paused teammates don't run.
- **Same rules as chat:** a scheduled run is an ordinary teammate run, so anything outgoing still waits in Approvals. The result lands in the teammate's chat labelled *Scheduled*, and the routine shows *Done*, *Waiting for your approval* or *Failed* with the reason.
- **No fake work:** unattended runs never fall back to demo data. If no AI account has an API key, the run fails and says so. Runs interrupted by a crash are marked failed after 15 minutes.

**Running it:**
- **`next start`, Docker or a VM:** the in-process loop starts automatically and checks every minute.
- **Serverless (Vercel and similar), with Supabase cron:** Supabase's `pg_cron` calls `GET /api/cron/tick` every minute through `pg_net`. The endpoint answers `202` straight away and runs the pass after responding, because `pg_net` gives up on requests after about 2 seconds.
  1. On the app, set `CRON_SECRET` (`openssl rand -hex 32`) and `APP_URL`. Set `SCHEDULER=off` if the app also runs as a long-lived server.
  2. Run `DATABASE_URL=<supabase connection string> APP_URL=https://your.app CRON_SECRET=<same value> npm run cron:supabase`. It enables `pg_cron` and `pg_net`, stores the secret in **Supabase Vault** (the job reads it from there, so it never appears in `cron.job` or logs), and schedules `agentic-scheduler-tick`. Re-running it updates the job; `-- --dry-run` shows the SQL, `-- --remove` unschedules it, `-- --every "*/2 * * * *"` changes the frequency.
  3. Check it with `select status_code, created from net._http_response order by created desc limit 5;` and expect `202`. `supabase/cron.sql` has the same setup to paste into the SQL editor.
- Extra or overlapping ticks are harmless, because each occurrence is claimed once. A pass has a time budget; routines it couldn't start stay unclaimed and are picked up by the next tick.

## Email alerts

When nobody's watching, scheduled work reaches you by email:
- **Needs your approval:** a scheduled run drafted something, like a reply or a Slack post. The email shows what it wants to send and links to Approvals.
- **Failed:** a routine couldn't run, with the reason (e.g. no API key, Google disconnected).

How it works:
- Alerts go into a `notifications` outbox with a unique key per approval or failed run, so nothing is emailed twice.
- Each check sends **one email per person** with everything that's waiting.
- Rows are claimed before sending, so concurrent workers never double-send. Resend gets an `Idempotency-Key`, so a retried request can't send twice either.
- 429 and 5xx errors are retried (up to 5 attempts). Permanent errors, such as an unverified domain, aren't.
- Content is HTML-escaped and links use `APP_URL`.
- Things you start yourself (chat, Run now) don't email you; you're already there.

Setup: create a [Resend](https://resend.com) API key, verify your sending domain, then set `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL`. People turn each alert type on or off and send a test email from **Settings**, which is also where the timezone routines run on is set. Without email configured, the app says so and alerts are dropped rather than sent late.

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

`npm test` runs the schedule unit tests plus 25 end-to-end checks against the real route handlers: accounts, sessions, rate limits, cross-site blocking, workspace versioning, persisted runs, approval tampering and double-execution, cross-account isolation, demo lockdown, the Google sign-in, connect, refresh and send paths, and the scheduler (exactly-once under concurrency, timezone, catch-up window, paused teammates, no fabricated runs, cron auth, Run now), and email alerts (grouping, dedupe, escaping, retries, preferences).

**Before production:**
- AI provider keys and the Slack, GitHub and Linear tokens are still **server-wide**, so every account uses them. Give each workspace its own keys before inviting other people.
- The login rate limiter is in-memory, so it's per instance. Use Redis or Upstash when running more than one.
- There's no email verification or password reset yet.
- The scheduler scans every workspace on each tick. That's fine for thousands of workspaces; beyond that, store the next run time and index it.
- Alerts are email only; Slack DMs would be a natural addition.
