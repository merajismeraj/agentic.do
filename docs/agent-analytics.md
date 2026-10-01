# Agent analytics & verification

Tells a site which AI agents act on it, whether they proved who they are, and whether they finish what they came to do. It tells agent builders where their agents are accepted, challenged or failing. Agents are treated as a customer channel, not as fraud.

## How it decides

Each session gets two independent answers:

1. **Identity (trust tier)**, from the request. Agents sign each HTTP request with [Web Bot Auth](https://datatracker.ietf.org/wg/webbotauth/about/) (RFC 9421 HTTP Message Signatures, Ed25519).

   | Tier | Name | Condition |
   | --- | --- | --- |
   | T0 | Unknown | No declaration; behaviour only |
   | T1 | Declared | Self-declared automation (user agent), or a signature we can't vouch for |
   | T2 | Signed | Valid signature, key in a trusted directory (ours or `AA_TRUSTED_DIRECTORIES`) |
   | T3 | Registered | T2 + operator reviewed by a registry admin |
   | T4 | Delegated | T3 + per-task delegation credential (reserved; not issued yet) |

2. **Behaviour (P(agent))**, from the browser SDK. Each feature family contributes a bounded log-likelihood ratio (`lib/aa/scoring.ts`):
   - time to first action vs words on the page (readers scale with length; agents with model latency)
   - burstiness of interaction timing
   - teleport clicks (no pointer approach), hover-before-click, off-screen and synthetic (`isTrusted=false`) clicks
   - Fitts' law fit of approach time, pointer path straightness, keystroke rhythm, fields filled without typing, scroll jumps, `navigator.webdriver`

   Labels: human below 0.2, agent above 0.8, otherwise uncertain; too little evidence is always uncertain. A two-state HMM over 10-second windows splits **hybrid** sessions, where a person hands off to an agent or takes control back.

A verified identity outranks behaviour: a T2+ session counts as a verified agent whatever it looks like.

**Policy:** behaviour never blocks. Screen readers, voice control and switch access can look agent-like. Default decisions are `allow`, `rate_limit` (over the agent's declared rate) or `challenge` (a failed signature: forged, replayed, expired or revoked).

The LLR curves are hand-set in v0 and tested on synthetic sessions and live Playwright runs. Signed sessions are labelled agent data for free, so the next step is fitting and isotonic-calibrating these curves per site on real traffic.

## Integrate a site

**One tag in the `<head>` of every page. That's the whole setup.**

```html
<script defer src="https://YOUR_APP/aa.js" data-site="aa_pk_…"></script>
```

Agent analytics → **Add a site or app** gives you the tag. It works pasted into a layout, a CMS header, `theme.liquid`, or a Google Tag Manager Custom HTML tag. Under 5 KB; it records timings, pointer positions and counts, never keystroke values, form contents or page text, plus where each session came from (see Attribution). The install screen shows "Receiving data" as soon as the first visit arrives.

What the tag alone gives you:

- **Human vs agent** for every session (behaviour), and **attribution** (channel, source, campaign).
- **Verified identity:** agents that sign their traffic (Web Bot Auth) sign every request their browser makes, including the SDK's uploads to us. `/api/aa/collect` verifies those signatures, so the session gets its trust tier (T2/T3) and agent with no server-side work. Automation that names itself in its user agent is T1. Replayed or forged signatures earn nothing.

Optional:

- **Goals:** `window.aa.task("checkout", "start" | "complete" | "fail")` for conversion rates by channel and by human vs agent.
- **Act at your edge** (allow / rate-limit / challenge *before* the page is served). Forward each request to the verify API with the site's server secret; embed the returned token as `data-vt` on the tag to tie the browser session to that verdict:
  ```ts
  const r = await fetch("https://YOUR_APP/api/aa/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${AA_SITE_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ method: req.method, url: req.url, headers: Object.fromEntries(req.headers), ip }),
  });
  const { tier, decision, agent, vt } = await r.json(); // decision: allow | rate_limit | challenge
  ```
  A site secret only verifies URLs on its own domain, because signatures are bound to `@authority`. Mobile apps and APIs (no page to put a tag on) use this path.

The built-in demo store at `/aa/demo/<site key>` does all of this server-side. Use it to see the loop work.

## Register an agent

**Agent registry → Register agent** generates an Ed25519 key pair in the browser. Only the public key is sent; the private JWK downloads once. New agents are T2 Signed. A reviewer in `AA_ADMIN_EMAILS` approves them to T3.

- Directory (all active keys): `/.well-known/http-message-signatures-directory`
- Per agent: `/r/<agent id>` (JWKS) and `/r/<agent id>/card` (Signature Agent Card)
- Rotation: add a key, switch signing, revoke the old key. Revocation takes effect at once on this instance and within 30 s across instances.

Try it:

```bash
npx tsx scripts/aa-agent.mts --key ./my-agent-private-key.json --registry http://localhost:3000 \
  http://localhost:3000/aa/demo/<site key>
```

Builders see their agent's outcomes aggregated across sites: requests, sites reached, acceptance rate, why verification failed, and task success. Individual sites are never named.

## Attribution

Every session, human or agent, gets a **channel**, **source / medium**, **campaign**, **referrer** and **landing page**, taken from the page that started it (a session keeps its entry source; a return from a payment page doesn't re-attribute it).

- **Signals** (collected once per session by the SDK): referrer reduced to host + path, landing path, `utm_source/medium/campaign/term/content`, and the *name* of an ad click id if present (`gclid`, `msclkid`, `fbclid`, `ttclid`, `li_fat_id`, …, never its value). Same-site referrers count as none.
- **Channels** (`lib/aa/attribution.ts`), in order: AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot, … by referrer or tag), Paid search / Paid social / Paid other (paid mediums, or search/social click ids), Display, Affiliates, Email, Organic search, Organic social, Referral, Direct, Unassigned (tagged but unrecognised). Tagged and referred traffic share one source name (`utm_source=chatgpt.com` and a chatgpt.com referrer are both `chatgpt`).
- **Models:** *last touch* is the channel that started the session; *first touch* is the channel that first brought this browser, remembered for 90 days in `localStorage` as channel-level signals only (no identifier).
- **Reports** (Agent analytics → Acquisition): channels, source / medium, campaigns, landing pages and referrers, each split into human, agent (verified shown separately) and uncertain sessions, with conversions (sessions that completed a task) and conversion rate for humans and agents.

## Data & privacy

- The SDK sends no content. IPs are stored only as a daily-rotating salted hash.
- Attribution drops query strings from referrers and landing pages (they can carry personal data), keeps UTM values to 100 characters, and records ad click ids by name only.
- Raw behavioural batches are kept 30 days; session scores and aggregates are kept longer.
- Nonces are single-use across instances (a Postgres unique key), and a forged request never consumes a real nonce.
- Only directories in `AA_TRUSTED_DIRECTORIES` are ever fetched, so a request can't point us at arbitrary hosts (no SSRF).

## Code map

| Path | What |
| --- | --- |
| `lib/aa/verifier/` | RFC 9421 / Web Bot Auth sign + verify, JWK thumbprints, trust tiers, directory cache (runtime-agnostic WebCrypto) |
| `lib/aa/scoring.ts` | Behavioural features, log-odds combiner, HMM segmenter |
| `sdk/aa.ts` → `public/aa.js` | Browser SDK (`npm run sdk:build`, also run by `prebuild`) |
| `lib/server/aa/` | Sites, registry, verification + tokens, ingest, stats, demo helpers |
| `app/api/aa/*` | sites, agents, keys, review, collect (CORS, public), verify (site secret) |
| `app/.well-known/…`, `app/r/…` | Public Web Bot Auth directories and agent cards |
| `app/app/analytics/` | Site dashboard and agent registry UI |
| `app/aa/demo/` | Demo store |
| `tests/aa-*.mts` | Unit (incl. the RFC 9421 B.2.6 test vector) and end-to-end API tests |
