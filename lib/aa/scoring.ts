/**
 * Behavioural scoring for traffic that didn't prove its identity.
 *
 * Output is a probability that an automated actuator drove the session, plus the
 * evidence behind it — never a verdict. Each feature family contributes a bounded
 * log-likelihood ratio (LLR); the sum plus a prior gives the log-odds:
 *
 *   log P(A|x)/P(H|x) = log P(A)/P(H) + Σ_k LLR_k(x_k)
 *
 * v0 uses hand-set, clipped LLR curves from published human-motor and reading
 * regularities. Signed (T2+) sessions provide labelled agent data and consented
 * human sessions labelled human data, so these curves get replaced by fitted,
 * isotonic-calibrated ones per site as data arrives.
 *
 * A two-state HMM over fixed windows splits hybrid sessions (a human hands off to
 * an agent mid-flow, or takes back control).
 */
import type { AaEvent } from "./events";

export type Label = "human" | "agent" | "uncertain";

export interface Evidence {
  feature: string;
  value: number;
  llr: number;
  n: number;
  note: string;
}

export interface Segment {
  from: number;
  to: number;
  state: "human" | "agent";
}

export interface TaskTally {
  start: number;
  complete: number;
  fail: number;
}

export interface SessionScore {
  pAgent: number;
  label: Label;
  logit: number;
  evidence: Evidence[];
  segments: Segment[];
  hybrid: boolean;
  pages: number;
  durationMs: number;
  tasks: Record<string, TaskTally>;
  features: Record<string, number>;
}

export const PRIOR_P_AGENT = 0.25;
export const HUMAN_BELOW = 0.2;
export const AGENT_ABOVE = 0.8;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
};
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Confidence ramp: 0 below `min` observations, 1 at `full`. */
const conf = (n: number, min: number, full: number) => clamp((n - min + 1) / (full - min + 1), 0, 1);

export function linreg(xs: number[], ys: number[]) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  return { slope, intercept: my - slope * mx, r };
}

/** Burstiness B = (σ − μ)/(σ + μ): −1 periodic, 0 Poisson, → 1 bursty. */
export function burstiness(gaps: number[]) {
  const m = mean(gaps);
  const s = std(gaps);
  return s + m === 0 ? 0 : (s - m) / (s + m);
}

interface Stroke {
  pts: { ts: number; x: number; y: number }[];
}

function strokes(ev: AaEvent[]): Stroke[] {
  const out: Stroke[] = [];
  let cur: Stroke | null = null;
  let lastTs = -Infinity;
  for (const e of ev) {
    if (e.t !== "mv") continue;
    if (!cur || e.ts - lastTs > 150) {
      cur = { pts: [] };
      out.push(cur);
    }
    cur.pts.push({ ts: e.ts, x: e.x, y: e.y });
    lastTs = e.ts;
  }
  return out;
}

/** Path length / straight-line displacement for strokes long enough to judge (1 = ruler-straight). */
function straightness(s: Stroke): number | null {
  if (s.pts.length < 6) return null;
  const a = s.pts[0];
  const b = s.pts[s.pts.length - 1];
  const disp = Math.hypot(b.x - a.x, b.y - a.y);
  if (disp < 80) return null;
  let len = 0;
  for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i].x - s.pts[i - 1].x, s.pts[i].y - s.pts[i - 1].y);
  return len / disp;
}

/* ------------------------------------------------------------------ */

export function scoreSession(events: AaEvent[], opts: { priorP?: number } = {}): SessionScore {
  const ev = [...events].sort((a, b) => a.ts - b.ts);
  const evidence: Evidence[] = [];
  const features: Record<string, number> = {};
  const add = (feature: string, value: number, llr: number, n: number, note: string) => {
    features[feature] = value;
    if (llr !== 0 && Number.isFinite(llr)) evidence.push({ feature, value, llr, n, note });
  };

  // 1. Latency vs content: time from page load to the first action should grow with
  // the words on the page for readers, and track model latency (not length) for agents.
  // Measuring to the first click/key/input keeps form-filling time out of "reading".
  const pvs = ev.filter((e): e is Extract<AaEvent, { t: "pv" }> => e.t === "pv");
  const dwellPts: { w: number; d: number }[] = [];
  for (const pv of pvs) {
    const next = ev.find((e) => e.ts > pv.ts && (e.t === "pv" || e.t === "lv" || e.t === "ck" || e.t === "kd" || e.t === "in"));
    if (next && next.ts - pv.ts < 10 * 60_000 && (next.t !== "lv" || pv === pvs[pvs.length - 1])) dwellPts.push({ w: pv.words, d: next.ts - pv.ts });
  }
  if (dwellPts.length >= 3 && std(dwellPts.map((p) => p.w)) > 20) {
    const { slope, r } = linreg(
      dwellPts.map((p) => p.w),
      dwellPts.map((p) => p.d),
    );
    const c = conf(dwellPts.length, 3, 6);
    const llr = c * 1.2 * Math.tanh((20 - slope) / 15) * (r > 0.3 || slope < 20 ? 1 : 0.5);
    add("dwell_per_word_ms", Math.round(slope * 10) / 10, llr, dwellPts.length, slope < 20 ? "Dwell time doesn't grow with page length" : "Dwell time tracks reading load");
  }

  // 2. Timing burstiness of discrete interactions.
  const discrete = ev.filter((e) => e.t === "ck" || e.t === "kd" || e.t === "sc" || e.t === "in" || e.t === "pv");
  const gaps: number[] = [];
  for (let i = 1; i < discrete.length; i++) {
    const g = discrete[i].ts - discrete[i - 1].ts;
    if (g > 0 && g < 60_000) gaps.push(g);
  }
  if (gaps.length >= 10) {
    const B = burstiness(gaps);
    const llr = conf(gaps.length, 10, 40) * 1.0 * Math.tanh((-B - 0.1) / 0.25);
    add("burstiness", Math.round(B * 100) / 100, llr, gaps.length, B < -0.1 ? "Interaction timing is unusually regular" : "Bursty, human-like timing");
  }

  // 3–6. Clicks.
  const clicks = ev.filter((e): e is Extract<AaEvent, { t: "ck" }> => e.t === "ck");
  const mouseClicks = clicks.filter((c) => c.pt === "mouse" || c.pt === "pen" || c.pt === "");
  if (mouseClicks.length >= 2) {
    const tele = mouseClicks.filter((c) => !c.moved).length / mouseClicks.length;
    add("teleport_click_rate", round2(tele), conf(mouseClicks.length, 2, 6) * clamp(-1 + 3.5 * tele, -1, 2.5), mouseClicks.length, tele > 0.3 ? "Clicks land without the pointer travelling there" : "Pointer travels to targets before clicking");
    const hov = mouseClicks.filter((c) => c.hov).length / mouseClicks.length;
    add("hover_before_click", round2(hov), conf(mouseClicks.length, 2, 6) * clamp((0.6 - hov) / 0.6, -0.6, 0.8), mouseClicks.length, hov < 0.5 ? "Targets rarely hovered before clicking" : "Targets hovered before clicking");
  }
  if (clicks.length) {
    const off = clicks.filter((c) => !c.vis).length / clicks.length;
    if (off > 0) add("offscreen_click_rate", round2(off), Math.min(2, 4 * off), clicks.length, "Acts on elements outside the viewport");
    const untrusted = clicks.filter((c) => !c.tr).length / clicks.length;
    if (untrusted > 0) add("synthetic_event_rate", round2(untrusted), Math.min(3, 5 * untrusted), clicks.length, "Clicks were dispatched by script");
  }

  // 7. Environment flags.
  const env = ev.find((e): e is Extract<AaEvent, { t: "env" }> => e.t === "env");
  if (env?.wd) add("webdriver", 1, 2.5, 1, "Browser reports automation (navigator.webdriver)");
  if (env?.hl) add("headless", 1, 1.5, 1, "Headless browser markers");

  // 8. Fitts' law: approach time should grow with log2(D/W + 1).
  const approaches = mouseClicks.filter((c) => c.moved && c.d > 0 && c.w > 0 && c.mt > 0);
  if (approaches.length >= 5) {
    const id = approaches.map((c) => Math.log2(c.d / c.w + 1));
    const { r } = linreg(
      id,
      approaches.map((c) => c.mt),
    );
    add("fitts_r", round2(r), conf(approaches.length, 5, 12) * 0.8 * Math.tanh((0.25 - r) / 0.2), approaches.length, r < 0.2 ? "Movement time ignores target size and distance" : "Movement time follows Fitts' law");
  }

  // 9. Path straightness of pointer strokes.
  const str = strokes(ev)
    .map(straightness)
    .filter((x): x is number => x != null);
  if (str.length >= 2) {
    const m = median(str);
    const llr = conf(str.length, 2, 6) * (m < 1.005 ? 1.0 : m > 1.03 ? -0.6 : 1.0 - (1.6 * (m - 1.005)) / 0.025);
    add("path_straightness", Math.round(m * 1000) / 1000, llr, str.length, m < 1.005 ? "Pointer paths are ruler-straight" : "Curved, corrective pointer paths");
  }

  // 10. Keystroke rhythm within typing bursts.
  const kd = ev.filter((e) => e.t === "kd").map((e) => e.ts);
  const kgaps: number[] = [];
  for (let i = 1; i < kd.length; i++) if (kd[i] - kd[i - 1] < 1000) kgaps.push(kd[i] - kd[i - 1]);
  if (kgaps.length >= 8) {
    const cv = std(kgaps) / mean(kgaps);
    add("keystroke_cv", round2(cv), conf(kgaps.length, 8, 25) * 1.2 * Math.tanh((0.2 - cv) / 0.1), kgaps.length, cv < 0.2 ? "Typing rhythm is machine-regular" : "Irregular, human typing rhythm");
  }

  // 11. Inputs filled without any keystroke (weak: password managers and autofill do this too).
  const inputs = ev.filter((e): e is Extract<AaEvent, { t: "in" }> => e.t === "in");
  if (inputs.length >= 2) {
    const rate = inputs.filter((i) => !i.kd).length / inputs.length;
    add("fill_without_keys", round2(rate), clamp((0.6 * (rate - 0.5)) / 0.5, -0.3, 0.6), inputs.length, rate > 0.5 ? "Fields filled without typing" : "Fields typed by hand");
  }

  // 12. Scrolling: jumps of more than a screen in one event vs inertial streams.
  const vh = pvs[0]?.vh || 800;
  const sc = ev.filter((e): e is Extract<AaEvent, { t: "sc" }> => e.t === "sc");
  if (sc.length >= 3) {
    let jumps = 0;
    for (let i = 1; i < sc.length; i++) if (Math.abs(sc[i].y - sc[i - 1].y) > 1.5 * vh) jumps++;
    const rate = jumps / (sc.length - 1);
    add("scroll_jump_rate", round2(rate), clamp((rate - 0.2) / 0.8, -0.4, 1), sc.length, rate > 0.2 ? "Scrolls jump whole screens at once" : "Continuous, inertial scrolling");
  }

  const priorP = opts.priorP ?? PRIOR_P_AGENT;
  const prior = Math.log(priorP / (1 - priorP));
  const logit = prior + evidence.reduce((s, e) => s + e.llr, 0);
  const pAgent = sigmoid(logit);
  const weight = evidence.reduce((s, e) => s + Math.abs(e.llr), 0);
  const label: Label = weight < 0.75 ? "uncertain" : pAgent >= AGENT_ABOVE ? "agent" : pAgent <= HUMAN_BELOW ? "human" : "uncertain";

  const { segments, hybrid } = segmentSession(ev);
  const tasks: Record<string, TaskTally> = {};
  for (const e of ev) if (e.t === "task") (tasks[e.name] ??= { start: 0, complete: 0, fail: 0 })[e.state]++;

  evidence.sort((a, b) => Math.abs(b.llr) - Math.abs(a.llr));
  return {
    pAgent,
    label,
    logit,
    evidence: evidence.map((e) => ({ ...e, llr: round2(e.llr) })),
    segments,
    hybrid,
    pages: pvs.length,
    durationMs: ev.length ? ev[ev.length - 1].ts - ev[0].ts : 0,
    tasks,
    features,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/* ---------------------------- HMM segmenter ---------------------------- */

const WINDOW_MS = 10_000;
const STAY = 0.9;

/** Per-window LLR from event-level cues that can be judged on their own. */
function windowLlr(ev: AaEvent[], vh: number): number | null {
  let llr = 0;
  let cues = 0;
  let scrollHuman = 0;
  let prevSc: number | null = null;
  for (const e of ev) {
    if (e.t === "ck") {
      cues++;
      if (!e.tr) llr += 2;
      else if (!e.vis) llr += 1.5;
      else if (e.pt === "mouse" || e.pt === "") llr += e.moved ? (e.hov ? -0.8 : -0.3) : 1.5;
    } else if (e.t === "in" && !e.kd) {
      cues++;
      llr += 0.3;
    } else if (e.t === "sc") {
      if (prevSc != null) {
        const dy = Math.abs(e.y - prevSc);
        cues++;
        if (dy > 1.5 * vh) llr += 0.5;
        else if (dy > 0 && dy < 0.5 * vh) scrollHuman = Math.max(-0.6, scrollHuman - 0.15); // wheel/trackpad steps
      }
      prevSc = e.y;
    }
  }
  llr += scrollHuman;
  // Pointer paths: ruler-straight is synthetic; curved, corrective paths are human.
  const ss = strokes(ev);
  for (const s of ss) {
    const st = straightness(s);
    if (st == null) continue;
    cues++;
    llr += clamp(0.7 - (st - 1) * 40, -0.6, 0.7);
  }
  // Sustained pointer motion between actions (CDP-driven clicks produce one move per click).
  const moves = ev.filter((e) => e.t === "mv").length;
  const clicks = ev.filter((e) => e.t === "ck").length;
  if (moves >= 30 && moves > 20 * Math.max(1, clicks)) {
    cues++;
    llr -= 0.4;
  }
  // Irregular keystroke rhythm inside the window.
  const kd = ev.filter((e) => e.t === "kd").map((e) => e.ts);
  if (kd.length >= 5) {
    const gaps = kd.slice(1).map((t, i) => t - kd[i]);
    const cv = std(gaps) / mean(gaps);
    cues++;
    llr += cv > 0.25 ? -0.5 : cv < 0.1 ? 0.6 : 0;
  }
  return cues ? clamp(llr, -3, 3) : null;
}

export function segmentSession(ev: AaEvent[]): { segments: Segment[]; hybrid: boolean } {
  if (!ev.length) return { segments: [], hybrid: false };
  const t0 = ev[0].ts;
  const n = Math.floor((ev[ev.length - 1].ts - t0) / WINDOW_MS) + 1;
  const buckets: AaEvent[][] = Array.from({ length: n }, () => []);
  for (const e of ev) buckets[Math.floor((e.ts - t0) / WINDOW_MS)].push(e);
  const vh = (ev.find((e) => e.t === "pv") as Extract<AaEvent, { t: "pv" }> | undefined)?.vh || 800;
  const obs = buckets.map((b) => windowLlr(b, vh));

  // Viterbi over states 0 = human, 1 = agent, in log space.
  const lt = [Math.log(STAY), Math.log(1 - STAY)];
  const emit = (o: number | null, s: number) => (o == null ? Math.log(0.5) : Math.log(s ? sigmoid(o) : 1 - sigmoid(o)));
  let v = [Math.log(0.5) + emit(obs[0], 0), Math.log(0.5) + emit(obs[0], 1)];
  const back: number[][] = [];
  for (let i = 1; i < n; i++) {
    const nv: number[] = [];
    const bp: number[] = [];
    for (let s = 0; s < 2; s++) {
      const stay = v[s] + lt[0];
      const move = v[1 - s] + lt[1];
      bp.push(stay >= move ? s : 1 - s);
      nv.push(Math.max(stay, move) + emit(obs[i], s));
    }
    back.push(bp);
    v = nv;
  }
  const path = new Array<number>(n);
  path[n - 1] = v[1] > v[0] ? 1 : 0;
  for (let i = n - 1; i > 0; i--) path[i - 1] = back[i - 1][path[i]];

  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const state = path[i] ? "agent" : "human";
    const from = t0 + i * WINDOW_MS;
    const last = segments[segments.length - 1];
    if (last && last.state === state) last.to = from + WINDOW_MS;
    else segments.push({ from, to: from + WINDOW_MS, state });
  }
  // Hybrid only when each state is backed by at least two windows with real cues.
  const backed = [0, 1].map((s) => obs.filter((o, i) => o != null && path[i] === s).length);
  return { segments, hybrid: backed[0] >= 2 && backed[1] >= 2 };
}
