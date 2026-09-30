import "server-only";
import { attribute, CLICK_ID_PARAMS, touchOf, type SourceSignals } from "@/lib/aa/attribution";
import { MAX_BATCH_EVENTS, type AaEvent, type CollectBatch } from "@/lib/aa/events";
import { scoreSession } from "@/lib/aa/scoring";
import { maxTier, tierRank, type Tier } from "@/lib/aa/verifier";
import { HttpError } from "../auth";
import { db } from "../db";
import { siteByKey } from "./sites";
import { ipHash } from "./util";
import { readVt } from "./verify";

const KINDS = new Set(["pv", "mv", "ck", "sc", "kd", "in", "vis", "lv", "task", "env", "src"]);

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Source signals, reduced to the documented fields: host + path referrer, tags, click-id name. */
function sanitizeSignals(v: unknown): SourceSignals | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const u = (o.utm && typeof o.utm === "object" ? o.utm : {}) as Record<string, unknown>;
  const utm = { source: str(u.source, 100), medium: str(u.medium, 100), campaign: str(u.campaign, 100), term: str(u.term, 100), content: str(u.content, 100) };
  const ref = str(o.ref, 300)?.split(/[?#]/)[0];
  return {
    ref,
    land: str(o.land, 300)?.split(/[?#]/)[0],
    utm: Object.values(utm).some(Boolean) ? utm : undefined,
    clid: typeof o.clid === "string" && CLICK_ID_PARAMS.includes(o.clid) ? o.clid : undefined,
  };
}
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Keep only well-formed events with plausible timestamps; drop any extra fields. */
export function sanitizeEvents(input: unknown, now = Date.now()): AaEvent[] {
  if (!Array.isArray(input)) throw new HttpError(400, "events must be an array");
  if (input.length > MAX_BATCH_EVENTS) throw new HttpError(413, "Too many events in one batch");
  const out: AaEvent[] = [];
  for (const raw of input) {
    const e = raw as Record<string, unknown>;
    if (!e || typeof e.t !== "string" || !KINDS.has(e.t) || !num(e.ts)) continue;
    const ts = Math.round(e.ts as number);
    if (ts < now - 24 * 3600_000 || ts > now + 5 * 60_000) continue;
    const b = (k: string) => e[k] === true;
    const n = (k: string) => (num(e[k]) ? Math.round(e[k] as number) : 0);
    switch (e.t) {
      case "pv":
        out.push({ t: "pv", ts, path: String(e.path ?? "/").slice(0, 300), words: n("words"), vw: n("vw"), vh: n("vh") });
        break;
      case "mv":
        out.push({ t: "mv", ts, x: n("x"), y: n("y") });
        break;
      case "ck":
        out.push({ t: "ck", ts, x: n("x"), y: n("y"), pt: String(e.pt ?? "").slice(0, 8), moved: b("moved"), hov: b("hov"), vis: b("vis"), tr: b("tr"), d: n("d"), w: n("w"), mt: n("mt") });
        break;
      case "sc":
        out.push({ t: "sc", ts, y: n("y") });
        break;
      case "kd":
        out.push({ t: "kd", ts });
        break;
      case "in":
        out.push({ t: "in", ts, kd: b("kd") });
        break;
      case "vis":
        out.push({ t: "vis", ts, hidden: b("hidden") });
        break;
      case "lv":
        out.push({ t: "lv", ts });
        break;
      case "task":
        if (e.state === "start" || e.state === "complete" || e.state === "fail")
          out.push({ t: "task", ts, name: String(e.name ?? "task").slice(0, 64), state: e.state });
        break;
      case "env":
        out.push({ t: "env", ts, wd: b("wd"), hl: b("hl"), touch: b("touch") });
        break;
      case "src":
        out.push({ t: "src", ts, ...sanitizeSignals(e), ft: sanitizeSignals(e.ft) });
        break;
    }
  }
  return out;
}

const MAX_SESSION_BATCHES = 200;

/** Store a batch, rescore the whole session, upsert the session row. */
export async function collect(body: unknown, meta: { ip: string | null; ua: string | null }) {
  const b = body as Partial<CollectBatch>;
  if (!b || typeof b.site !== "string" || typeof b.sid !== "string" || !/^[a-f0-9]{8,64}$/.test(b.sid) || !Number.isInteger(b.seq))
    throw new HttpError(400, "Malformed batch");
  const site = await siteByKey(b.site);
  if (!site) throw new HttpError(404, "Unknown site key");
  const events = sanitizeEvents(b.events);
  const seq = Math.max(0, Math.min(b.seq!, 100_000));
  const d = await db();

  if (Math.random() < 0.01) await d.query("delete from aa_batches where received_at < now() - interval '30 days'");

  const inserted = await d.query(
    "insert into aa_batches (site_id, session_id, seq, events) values ($1, $2, $3, $4) on conflict do nothing returning seq",
    [site.id, b.sid, seq, JSON.stringify(events)],
  );
  if (!inserted.rows.length) return { site, sessionId: b.sid, duplicate: true };

  const { rows } = await d.query<{ events: AaEvent[] }>(
    "select events from aa_batches where site_id = $1 and session_id = $2 order by seq limit $3",
    [site.id, b.sid, MAX_SESSION_BATCHES],
  );
  const all = rows.flatMap((r) => r.events);
  const score = scoreSession(all);

  const prev = (
    await d.query<{ tier: Tier; agent_id: string | null }>("select tier, agent_id from aa_sessions where site_id = $1 and id = $2", [site.id, b.sid])
  ).rows[0];
  const claims = readVt(b.vt, site.id);
  let tier: Tier = prev?.tier ?? "T0";
  let agentId = prev?.agent_id ?? null;
  if (claims) {
    tier = maxTier(tier, claims.t);
    if (claims.a) agentId = claims.a;
  }
  // A verified identity outranks behaviour: a signed agent is an agent, whatever it looks like.
  const label = tierRank(tier) >= 2 ? "agent" : score.label;
  // Attribution comes from the session's first source event (a session keeps its entry source).
  const src = all.filter((e): e is Extract<AaEvent, { t: "src" }> => e.t === "src").sort((x, y) => x.ts - y.ts)[0];
  const attr = src ? attribute(src) : null;
  const first = src ? touchOf(attribute(src.ft ?? src)) : null;
  const ts = all.map((e) => e.ts);
  const started = new Date(Math.min(...ts));
  const last = new Date(Math.max(...ts));

  await d.query(
    `insert into aa_sessions (site_id, id, started_at, last_at, tier, agent_id, p_agent, label, hybrid, pages, score, ua, ip_hash,
       channel, source, medium, campaign, referrer, landing, first_touch)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     on conflict (site_id, id) do update set started_at = least(aa_sessions.started_at, excluded.started_at),
       last_at = greatest(aa_sessions.last_at, excluded.last_at), tier = excluded.tier, agent_id = excluded.agent_id,
       p_agent = excluded.p_agent, label = excluded.label, hybrid = excluded.hybrid, pages = excluded.pages, score = excluded.score,
       ua = coalesce(aa_sessions.ua, excluded.ua),
       channel = coalesce(aa_sessions.channel, excluded.channel), source = coalesce(aa_sessions.source, excluded.source),
       medium = coalesce(aa_sessions.medium, excluded.medium), campaign = coalesce(aa_sessions.campaign, excluded.campaign),
       referrer = coalesce(aa_sessions.referrer, excluded.referrer), landing = coalesce(aa_sessions.landing, excluded.landing),
       first_touch = coalesce(aa_sessions.first_touch, excluded.first_touch)`,
    [
      site.id,
      b.sid,
      started,
      last,
      tier,
      agentId,
      score.pAgent,
      label,
      score.hybrid,
      score.pages,
      JSON.stringify({ evidence: score.evidence, segments: score.segments, tasks: score.tasks, features: score.features, durationMs: score.durationMs }),
      meta.ua?.slice(0, 300) ?? null,
      ipHash(meta.ip),
      attr?.channel ?? null,
      attr?.source ?? null,
      attr?.medium ?? null,
      attr?.campaign ?? null,
      attr?.referrer ?? null,
      attr?.landing ?? null,
      first ? JSON.stringify(first) : null,
    ],
  );
  return { site, sessionId: b.sid, duplicate: false, label, pAgent: score.pAgent, tier, channel: attr?.channel ?? null };
}
