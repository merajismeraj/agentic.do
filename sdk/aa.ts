/**
 * agentic.do agent analytics — browser SDK.
 *
 *   <script src="https://agentic.do/aa.js" data-site="SITE_KEY" data-vt="VERIFICATION_TOKEN" defer></script>
 *   window.aa.task("checkout", "start" | "complete" | "fail")
 *
 * Collects timings, pointer positions and counts only. Never keystroke values,
 * form contents or page text. Built to public/aa.js by `npm run sdk:build`.
 */
import { CLICK_ID_PARAMS, type SourceSignals } from "../lib/aa/attribution";
import type { AaEvent } from "../lib/aa/events";

type TaskState = "start" | "complete" | "fail";
interface AaApi {
  task: (name: string, state: TaskState) => void;
  flush: () => void;
}

(() => {
  const w = window as unknown as { aa?: AaApi | unknown[] };
  if (w.aa && !Array.isArray(w.aa)) return; // already loaded
  const queued = Array.isArray(w.aa) ? (w.aa as unknown[]) : [];

  const script = (document.currentScript as HTMLScriptElement | null) ?? document.querySelector<HTMLScriptElement>("script[data-site][src*='aa.js']");
  const site = script?.dataset.site;
  if (!script || !site) return;
  const vt = script.dataset.vt || undefined;
  const endpoint = new URL("/api/aa/collect", script.src).href;

  const now = () => Math.round(performance.timeOrigin + performance.now());
  const store = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })();

  // Session: per tab, rolls over after 30 idle minutes.
  const IDLE = 30 * 60_000;
  let sid = store?.getItem("aa_sid") ?? "";
  const lastSeen = Number(store?.getItem("aa_last") ?? 0);
  const newSession = !sid || now() - lastSeen > IDLE;
  if (newSession) {
    sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
    store?.setItem("aa_seq", "0");
  }
  store?.setItem("aa_sid", sid);
  let seq = Number(store?.getItem("aa_seq") ?? 0);

  let buf: AaEvent[] = [];
  const push = (e: AaEvent) => {
    buf.push(e);
    store?.setItem("aa_last", String(e.ts));
    if (buf.length >= 400) flush();
  };

  function flush(beacon = false) {
    if (!buf.length) return;
    const body = JSON.stringify({ site, sid, seq: seq++, vt, events: buf });
    store?.setItem("aa_seq", String(seq));
    buf = [];
    // text/plain keeps this a CORS "simple" request: no preflight.
    const blob = new Blob([body], { type: "text/plain" });
    if (beacon && navigator.sendBeacon?.(endpoint, blob)) return;
    fetch(endpoint, { method: "POST", body: blob, keepalive: true, credentials: "omit" }).catch(() => {});
  }

  /* ----------------------------- source ----------------------------- */

  // Where this session came from. Referrer is reduced to host + path (the query
  // string can carry personal data); click ids are reported by name only.
  if (newSession) {
    const q = new URLSearchParams(location.search);
    const pick = (k: string) => q.get(k)?.slice(0, 100) || undefined;
    let ref = "";
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.hostname !== location.hostname) ref = (r.hostname + r.pathname).slice(0, 300);
    } catch {}
    const utm = { source: pick("utm_source"), medium: pick("utm_medium"), campaign: pick("utm_campaign"), term: pick("utm_term"), content: pick("utm_content") };
    const sig: SourceSignals = {
      ref: ref || undefined,
      land: location.pathname.slice(0, 300),
      utm: Object.values(utm).some(Boolean) ? utm : undefined,
      clid: CLICK_ID_PARAMS.find((k) => q.has(k)),
    };
    // First touch for this browser, kept 90 days. Only marketing signals; no identifier.
    let ft: SourceSignals | undefined;
    try {
      const saved = JSON.parse(localStorage.getItem("aa_ft") ?? "null") as (SourceSignals & { at: number }) | null;
      if (saved && now() - saved.at < 90 * 86_400_000) ft = saved;
      else localStorage.setItem("aa_ft", JSON.stringify({ ...sig, at: now() }));
    } catch {}
    push({ t: "src", ts: now(), ...sig, ft: ft ? { ref: ft.ref, land: ft.land, utm: ft.utm, clid: ft.clid } : undefined });
  }

  /* ------------------------------ page ------------------------------ */

  const ua = navigator.userAgent;
  push({
    t: "env",
    ts: now(),
    wd: navigator.webdriver === true,
    hl: /HeadlessChrome|PhantomJS|Electron/.test(ua),
    touch: matchMedia?.("(pointer: coarse)").matches ?? false,
  });

  const pageview = () =>
    push({
      t: "pv",
      ts: now(),
      path: location.pathname,
      words: (document.body?.innerText ?? "").split(/\s+/).filter(Boolean).length,
      vw: innerWidth,
      vh: innerHeight,
    });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pageview, { once: true });
  else pageview();

  /* ----------------------------- pointer ---------------------------- */

  const trail: { ts: number; x: number; y: number }[] = [];
  let lastMv = 0;
  let mvBudget = 4000;
  addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const ts = now();
      trail.push({ ts, x: e.clientX, y: e.clientY });
      while (trail.length && ts - trail[0].ts > 2000) trail.shift();
      if (ts - lastMv < 16 || mvBudget <= 0) return;
      lastMv = ts;
      mvBudget--;
      push({ t: "mv", ts, x: Math.round(e.clientX), y: Math.round(e.clientY) });
    },
    { passive: true, capture: true },
  );

  const hovered: Element[] = [];
  addEventListener(
    "pointerover",
    (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (e.target instanceof Element) {
        hovered.push(e.target);
        if (hovered.length > 30) hovered.shift();
      }
    },
    { passive: true, capture: true },
  );

  addEventListener(
    "click",
    (e) => {
      const ts = now();
      const target = e.target instanceof Element ? e.target : null;
      const pe = e as PointerEvent;
      const pt = e.detail === 0 ? "kbd" : (pe.pointerType ?? "");
      const x = e.clientX;
      const y = e.clientY;
      const win = trail.filter((p) => ts - p.ts <= 1500);
      let travel = 0;
      for (let i = 1; i < win.length; i++) travel += Math.hypot(win[i].x - win[i - 1].x, win[i].y - win[i - 1].y);
      const lastP = win[win.length - 1];
      const moved = !!lastP && travel > 10 && Math.hypot(lastP.x - x, lastP.y - y) < 40;
      const start = win[0];
      const rect = target?.getBoundingClientRect();
      const vis = !!rect && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      const hov = !!target && hovered.some((h) => h === target || h.contains(target) || target.contains(h));
      push({
        t: "ck",
        ts,
        x: Math.round(x),
        y: Math.round(y),
        pt,
        moved,
        hov,
        vis,
        tr: e.isTrusted,
        d: start ? Math.round(Math.hypot(x - start.x, y - start.y)) : 0,
        w: rect ? Math.round(Math.max(1, Math.min(rect.width, rect.height))) : 0,
        mt: start ? ts - start.ts : 0,
      });
    },
    { capture: true },
  );

  /* --------------------------- scroll & keys ------------------------- */

  let lastSc = 0;
  addEventListener(
    "scroll",
    () => {
      const ts = now();
      if (ts - lastSc < 100) return;
      lastSc = ts;
      push({ t: "sc", ts, y: Math.round(scrollY) });
    },
    { passive: true, capture: true },
  );

  let lastKey = 0;
  addEventListener(
    "keydown",
    () => {
      lastKey = now();
      push({ t: "kd", ts: lastKey });
    },
    { capture: true },
  );
  addEventListener("paste", () => (lastKey = now()), { capture: true });

  const lastInput = new WeakMap<EventTarget, number>();
  addEventListener(
    "input",
    (e) => {
      const ts = now();
      const t = e.target;
      if (!t) return;
      if (ts - (lastInput.get(t) ?? 0) < 2000) return;
      lastInput.set(t, ts);
      push({ t: "in", ts, kd: ts - lastKey < 150 });
    },
    { capture: true },
  );

  /* ---------------------------- lifecycle ---------------------------- */

  document.addEventListener("visibilitychange", () => {
    push({ t: "vis", ts: now(), hidden: document.visibilityState === "hidden" });
    if (document.visibilityState === "hidden") flush(true);
  });
  addEventListener("pagehide", () => {
    push({ t: "lv", ts: now() });
    flush(true);
  });
  setInterval(() => flush(), 5000);

  /* ------------------------------- API ------------------------------- */

  const api: AaApi = {
    task(name, state) {
      if (typeof name !== "string" || !["start", "complete", "fail"].includes(state)) return;
      push({ t: "task", ts: now(), name: name.slice(0, 64), state });
      if (state !== "start") flush();
    },
    flush: () => flush(),
  };
  w.aa = api;
  for (const q of queued) if (Array.isArray(q) && q[0] === "task") api.task(q[1], q[2]);
})();
