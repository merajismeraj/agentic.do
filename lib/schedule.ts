/**
 * Routine schedules, evaluated in the user's timezone (DST-safe). Pure and
 * shared by the UI (next-run labels) and the server scheduler.
 */

export type Schedule =
  | { kind: "daily"; time: string }
  | { kind: "weekdays"; time: string }
  | { kind: "weekly"; days: number[]; time: string } // 0 = Sunday
  | { kind: "hourly"; from: string; to: string; weekdaysOnly?: boolean } // on the hour, inclusive window
  | { kind: "interval"; minutes: number; from: string; to: string; weekdaysOnly?: boolean }
  | { kind: "trigger"; label: string }; // event-driven; runs on demand for now

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

const hm = (t: string) => {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};
const pad = (n: number) => String(n).padStart(2, "0");
export const fmtTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const norm = (t: string) => fmtTime(hm(t) ?? 0);

/** Parses the human cadence strings used by templates and older routines. */
export function parseCadence(cadence: string): Schedule {
  const c = cadence.trim();
  const time = c.match(/(\d{1,2}:\d{2})(?!.*\d{1,2}:\d{2})/)?.[1];
  const range = c.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  const every = c.match(/every\s+(\d+)\s*min/i);
  if (every) return { kind: "interval", minutes: Math.max(5, Number(every[1])), from: range ? norm(range[1]) : "08:00", to: range ? norm(range[2]) : "19:00", weekdaysOnly: true };
  if (/^hourly/i.test(c)) return { kind: "hourly", from: range ? norm(range[1]) : "08:00", to: range ? norm(range[2]) : "19:00", weekdaysOnly: true };
  if (!time || /^when\b|before|after\b/i.test(c)) return { kind: "trigger", label: c };
  if (/weekdays/i.test(c)) return { kind: "weekdays", time: norm(time) };
  const days = DAY_NAMES.map((d, i) => (new RegExp(d.slice(0, -1), "i").test(c) ? i : -1)).filter((i) => i >= 0);
  if (days.length) return { kind: "weekly", days, time: norm(time) };
  return { kind: "daily", time: norm(time) };
}

export function describe(s: Schedule): string {
  switch (s.kind) {
    case "daily":
      return `Every day · ${s.time}`;
    case "weekdays":
      return `Weekdays · ${s.time}`;
    case "weekly":
      return `${s.days.map((d) => DAY_NAMES[d]).join(", ")} · ${s.time}`;
    case "hourly":
      return `Hourly · ${s.from}–${s.to}${s.weekdaysOnly ? " on weekdays" : ""}`;
    case "interval":
      return `Every ${s.minutes} min · ${s.from}–${s.to}${s.weekdaysOnly ? " on weekdays" : ""}`;
    case "trigger":
      return s.label;
  }
}

export const scheduleOf = (r: { schedule?: Schedule; cadence: string }) => r.schedule ?? parseCadence(r.cadence);

/* ------------------------- timezone arithmetic ------------------------- */

const partsCache = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, timeZone: string) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    partsCache.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    minutes: Number(p.hour) * 60 + Number(p.minute),
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

export function safeZone(tz: string | undefined) {
  try {
    if (tz) {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
  } catch {}
  return "UTC";
}

/** UTC instant for a wall-clock time in `timeZone`. Nonexistent (spring-forward) times shift forward. */
function zonedToUtc(y: number, m: number, d: number, minutes: number, timeZone: string) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(t), timeZone);
    const shown = Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes);
    t += guess - shown;
  }
  return t;
}

/** The occurrences (UTC ms) of a schedule on one local calendar day. */
function occurrencesOnDay(s: Schedule, y: number, m: number, d: number, dow: number, tz: string): number[] {
  const at = (min: number) => zonedToUtc(y, m, d, min, tz);
  const weekday = dow >= 1 && dow <= 5;
  switch (s.kind) {
    case "daily":
      return [at(hm(s.time) ?? 0)];
    case "weekdays":
      return weekday ? [at(hm(s.time) ?? 0)] : [];
    case "weekly":
      return s.days.includes(dow) ? [at(hm(s.time) ?? 0)] : [];
    case "hourly":
    case "interval": {
      if (s.weekdaysOnly && !weekday) return [];
      const step = s.kind === "hourly" ? 60 : Math.max(5, s.minutes);
      const from = hm(s.from) ?? 0;
      const to = hm(s.to) ?? 24 * 60 - 1;
      const out: number[] = [];
      for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push(at(t));
      return out;
    }
    case "trigger":
      return [];
  }
}

function localDay(ms: number, tz: string, offsetDays: number) {
  // Noon avoids DST edges when stepping days.
  const p = parts(new Date(ms), tz);
  const noon = new Date(Date.UTC(p.y, p.m - 1, p.d + offsetDays, 12));
  return { y: noon.getUTCFullYear(), m: noon.getUTCMonth() + 1, d: noon.getUTCDate(), dow: noon.getUTCDay() };
}

/** Most recent occurrence at or before `now`, looking back up to 8 days. */
export function previousOccurrence(s: Schedule, timeZone: string, now: number): number | null {
  const tz = safeZone(timeZone);
  for (let back = 0; back <= 8; back++) {
    const day = localDay(now, tz, -back);
    const hits = occurrencesOnDay(s, day.y, day.m, day.d, day.dow, tz).filter((t) => t <= now);
    if (hits.length) return Math.max(...hits);
  }
  return null;
}

/** Next occurrence strictly after `now`, looking ahead up to 8 days. */
export function nextOccurrence(s: Schedule, timeZone: string, now: number): number | null {
  const tz = safeZone(timeZone);
  for (let ahead = 0; ahead <= 8; ahead++) {
    const day = localDay(now, tz, ahead);
    const hits = occurrencesOnDay(s, day.y, day.m, day.d, day.dow, tz).filter((t) => t > now);
    if (hits.length) return Math.min(...hits);
  }
  return null;
}

/** "Today 08:00", "Tomorrow 09:30", "Mon 08:00" in the user's timezone. */
export function whenLabel(ms: number, timeZone: string, now = Date.now()) {
  const tz = safeZone(timeZone);
  const a = parts(new Date(ms), tz);
  const today = localDay(now, tz, 0);
  const tomorrow = localDay(now, tz, 1);
  const time = fmtTime(a.minutes);
  if (a.y === today.y && a.m === today.m && a.d === today.d) return `Today ${time}`;
  if (a.y === tomorrow.y && a.m === tomorrow.m && a.d === tomorrow.d) return `Tomorrow ${time}`;
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][a.dow]} ${time}`;
}

/** Minutes after local midnight of the first occurrence today, for the day timeline. */
export function minuteOfDay(ms: number, timeZone: string) {
  return parts(new Date(ms), safeZone(timeZone)).minutes;
}
