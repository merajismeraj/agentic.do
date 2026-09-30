# agentic.do

Analytics and verification for AI agents. agentic.do shows a site which AI agents act on it, whether they proved who they are, and whether they finish what they came to do, and shows agent builders where their agents are accepted, challenged or failing. Agents are treated as a customer channel, not as fraud.

How it decides (trust tiers, behavioural scoring, policy), how to integrate a site, the agent registry and the data policy are in **[docs/agent-analytics.md](docs/agent-analytics.md)**.

> AI teammates, which used to live here, moved to their own product: **srk** (srk.app).

## Run it

```bash
cp .env.example .env.local   # set SESSION_SECRET at minimum
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit + end-to-end API tests (in-memory Postgres)
```

Without `DATABASE_URL`, data lives in an embedded Postgres (PGlite) under `.data/`. Set `EMAIL_DRIVER=log` to print verification and reset emails to the console.

## Deploy (Vercel + Supabase)

1. Import the repo into Vercel.
2. Connect Supabase through Vercel's Supabase integration (or set `DATABASE_URL` to the transaction pooler, port 6543). Tables are created on first request.
3. Set `SESSION_SECRET`, `APP_URL`, and for email `RESEND_API_KEY` + `EMAIL_FROM`. Optionally `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `AA_ADMIN_EMAILS`, `AA_TRUSTED_DIRECTORIES`.
4. Check `GET /api/health`: it reports what's configured and whether the database answers, never secret values.

## Code map

| Path | What |
| --- | --- |
| `app/page.tsx` | Landing page |
| `app/app/analytics/` | Site dashboard and agent registry |
| `app/api/aa/*`, `lib/server/aa/`, `lib/aa/` | Analytics and verification (see the doc above) |
| `sdk/aa.ts` → `public/aa.js` | Browser SDK (`npm run sdk:build`, also run on `prebuild`) |
| `app/api/auth/*`, `lib/server/auth.ts`, `lib/server/account.ts` | Accounts: scrypt passwords, hashed session tokens, email verification, password reset, "Continue with Google" |
| `lib/server/db.ts` | Postgres (`DATABASE_URL` or the Supabase integration) or embedded PGlite; schema bootstrapped on connect |
| `tests/` | `aa-unit` (incl. the RFC 9421 test vector), `aa-api` and `api` (accounts) |
