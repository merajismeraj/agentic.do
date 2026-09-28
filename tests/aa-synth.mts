/**
 * Synthetic sessions for exercising the behavioural scorer: a human reader,
 * an LLM agent driving a browser over CDP, a scripted bot, and a hybrid
 * session where a human hands off to an agent. Deterministic (seeded).
 */
import type { AaEvent } from "../lib/aa/events.ts";

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}
const logn = (r: () => number, median: number, sigma: number) => median * Math.exp(sigma * gauss(r));

/** Curved, bell-velocity pointer approach ending on the target, plus a click. */
function humanClick(r: () => number, t: number, from: { x: number; y: number }, to: { x: number; y: number }, w: number) {
  const ev: AaEvent[] = [];
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const mt = 180 + 140 * Math.log2(d / w + 1) + 60 * gauss(r); // Fitts' law with noise
  const ctrl = { x: (from.x + to.x) / 2 + 0.25 * d * (r() - 0.5), y: (from.y + to.y) / 2 + 0.25 * d * (r() - 0.5) };
  const steps = Math.max(8, Math.round(mt / 16));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const s = u * u * (3 - 2 * u); // smooth-step: bell-shaped speed
    const x = (1 - s) ** 2 * from.x + 2 * (1 - s) * s * ctrl.x + s * s * to.x + gauss(r) * 1.2;
    const y = (1 - s) ** 2 * from.y + 2 * (1 - s) * s * ctrl.y + s * s * to.y + gauss(r) * 1.2;
    ev.push({ t: "mv", ts: Math.round(t + (u * mt)), x: Math.round(x), y: Math.round(y) });
  }
  const ts = Math.round(t + mt + 80 + 40 * r());
  ev.push({ t: "ck", ts, x: to.x, y: to.y, pt: "mouse", moved: true, hov: true, vis: true, tr: true, d: Math.round(d), w, mt: Math.round(mt) });
  return { ev, end: ts };
}

export function humanSession(seed = 1, t0 = Date.now() - 20 * 60_000): AaEvent[] {
  const r = rng(seed);
  const ev: AaEvent[] = [{ t: "env", ts: t0, wd: false, hl: false, touch: false }];
  let t = t0;
  let pos = { x: 400, y: 300 };
  const words = [180, 1400, 350, 900, 120, 2200];
  for (const w of words) {
    ev.push({ t: "pv", ts: t, path: `/p/${w}`, words: w, vw: 1280, vh: 800 });
    const dwell = 1500 + w * logn(r, 110, 0.25); // reading time grows with length
    const end = t + dwell;
    // Scroll in small inertial steps while reading.
    let y = 0;
    for (let s = t + 800; s < end - 1500; s += logn(r, 900, 0.8)) {
      y += Math.round(60 + 80 * r());
      ev.push({ t: "sc", ts: Math.round(s), y });
    }
    const target = { x: Math.round(200 + 800 * r()), y: Math.round(150 + 500 * r()) };
    const c = humanClick(r, end - 1200, pos, target, Math.round(24 + 120 * r()));
    ev.push(...c.ev);
    pos = target;
    t = c.end + 50;
  }
  // A short checkout page, then a long stretch of typing: form time must not count as reading.
  ev.push({ t: "pv", ts: t, path: "/checkout", words: 60, vw: 1280, vh: 800 });
  t += 1500 + 60 * logn(r, 110, 0.25);
  // Type into a form: irregular keystrokes.
  let k = t;
  for (let i = 0; i < 24; i++) {
    k += logn(r, 170, 0.5);
    ev.push({ t: "kd", ts: Math.round(k) });
    if (i % 8 === 0) ev.push({ t: "in", ts: Math.round(k + 5), kd: true });
  }
  ev.push({ t: "task", ts: Math.round(k + 400), name: "checkout", state: "start" });
  const c = humanClick(r, k + 900, pos, { x: 640, y: 560 }, 44);
  ev.push(...c.ev, { t: "task", ts: c.end + 300, name: "checkout", state: "complete" }, { t: "lv", ts: c.end + 2000 });
  return ev;
}

/** LLM agent over CDP: latency tracks inference, not content; teleport clicks; programmatic fills. */
export function agentSession(seed = 2, t0 = Date.now() - 10 * 60_000, opts: { offscreen?: boolean } = {}): AaEvent[] {
  const r = rng(seed);
  const ev: AaEvent[] = [{ t: "env", ts: t0, wd: false, hl: false, touch: false }];
  let t = t0;
  const words = [180, 1400, 350, 900, 120, 2200];
  for (const [i, w] of words.entries()) {
    ev.push({ t: "pv", ts: t, path: `/p/${w}`, words: w, vw: 1280, vh: 800 });
    const think = logn(r, 3200, 0.3); // model latency, independent of page length
    ev.push({ t: "sc", ts: Math.round(t + think * 0.4), y: 0 }, { t: "sc", ts: Math.round(t + think * 0.5), y: 2400 });
    ev.push({ t: "mv", ts: Math.round(t + think - 5), x: 640, y: 400 });
    ev.push({ t: "ck", ts: Math.round(t + think), x: 640, y: 400, pt: "mouse", moved: false, hov: false, vis: !(opts.offscreen && i % 2), tr: true, d: 0, w: 40, mt: 0 });
    t += think + 300;
  }
  ev.push({ t: "task", ts: Math.round(t), name: "checkout", state: "start" });
  for (let i = 0; i < 4; i++) ev.push({ t: "in", ts: Math.round(t + 200 + i * 40), kd: false });
  ev.push({ t: "ck", ts: Math.round(t + 2600), x: 640, y: 560, pt: "mouse", moved: false, hov: false, vis: true, tr: true, d: 0, w: 44, mt: 0 });
  ev.push({ t: "task", ts: Math.round(t + 3000), name: "checkout", state: "complete" }, { t: "lv", ts: Math.round(t + 4000) });
  return ev;
}

/** Scripted bot: fixed sleeps, webdriver flag, synthetic JS clicks. */
export function scriptedBotSession(t0 = Date.now() - 5 * 60_000): AaEvent[] {
  const ev: AaEvent[] = [{ t: "env", ts: t0, wd: true, hl: true, touch: false }];
  for (let i = 0; i < 15; i++) {
    const t = t0 + i * 1000;
    ev.push({ t: "pv", ts: t, path: `/p/${i}`, words: 100 + i * 150, vw: 800, vh: 600 });
    ev.push({ t: "ck", ts: t + 500, x: 10, y: 10, pt: "", moved: false, hov: false, vis: i % 3 !== 0, tr: false, d: 0, w: 30, mt: 0 });
  }
  return ev;
}

/** Human browses for ~2 minutes, then an agent takes over the same tab. */
export function hybridSession(seed = 3): AaEvent[] {
  const t0 = Date.now() - 30 * 60_000;
  const human = humanSession(seed, t0).filter((e) => e.t !== "lv" && e.t !== "task");
  const end = Math.max(...human.map((e) => e.ts));
  const agent = agentSession(seed + 1, end + 5000).filter((e) => e.t !== "env");
  return [...human, ...agent];
}
