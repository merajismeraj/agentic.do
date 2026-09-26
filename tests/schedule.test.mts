/** Schedule parsing and timezone/DST arithmetic. */
import assert from "node:assert/strict";
const s = await import(new URL("../lib/schedule.ts", import.meta.url).href);
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
// parse
assert.deepEqual(s.parseCadence("Weekdays · 8:00"), { kind: "weekdays", time: "08:00" });
assert.deepEqual(s.parseCadence("Mondays · 9:00"), { kind: "weekly", days: [1], time: "09:00" });
assert.deepEqual(s.parseCadence("Hourly · 8:00–19:00"), { kind: "hourly", from: "08:00", to: "19:00", weekdaysOnly: true });
assert.deepEqual(s.parseCadence("Every 15 min"), { kind: "interval", minutes: 15, from: "08:00", to: "19:00", weekdaysOnly: true });
assert.equal(s.parseCadence("30 min before external meetings").kind, "trigger");
assert.equal(s.parseCadence("When a lead arrives").kind, "trigger");
assert.deepEqual(s.parseCadence("Daily · 11:00"), { kind: "daily", time: "11:00" });
// Kolkata weekdays 08:00 → 02:30Z. Sat 2026-09-26 12:00Z: previous = Fri 25th 02:30Z, next = Mon 28th 02:30Z
const wk = { kind: "weekdays", time: "08:00" } as const;
const now = Date.parse("2026-09-26T12:00:00Z");
assert.equal(iso(s.previousOccurrence(wk, "Asia/Kolkata", now)), "2026-09-25T02:30:00.000Z");
assert.equal(iso(s.nextOccurrence(wk, "Asia/Kolkata", now)), "2026-09-28T02:30:00.000Z");
// DST: New York daily 09:00 across Nov 1 2026 fall-back → EDT 13:00Z before, EST 14:00Z after
const d9 = { kind: "daily", time: "09:00" } as const;
assert.equal(iso(s.nextOccurrence(d9, "America/New_York", Date.parse("2026-10-31T14:00:00Z"))), "2026-11-01T14:00:00.000Z");
assert.equal(iso(s.previousOccurrence(d9, "America/New_York", Date.parse("2026-10-31T14:00:00Z"))), "2026-10-31T13:00:00.000Z");
// spring forward 2026-03-08 02:30 doesn't exist in NY → lands at 03:30 EDT (07:30Z) or thereabouts, not NaN
const sf = s.nextOccurrence({ kind: "daily", time: "02:30" }, "America/New_York", Date.parse("2026-03-08T05:00:00Z"));
assert.equal(iso(sf), "2026-03-08T07:30:00.000Z", "nonexistent 02:30 shifts to 03:30 EDT");
// hourly window
const hr = { kind: "hourly", from: "08:00", to: "10:00", weekdaysOnly: true } as const;
assert.equal(iso(s.nextOccurrence(hr, "UTC", Date.parse("2026-09-28T08:00:00Z"))), "2026-09-28T09:00:00.000Z");
assert.equal(iso(s.nextOccurrence(hr, "UTC", Date.parse("2026-09-28T10:00:00Z"))), "2026-09-29T08:00:00.000Z");
// interval
const iv = { kind: "interval", minutes: 15, from: "08:00", to: "09:00" } as const;
assert.equal(iso(s.previousOccurrence(iv, "UTC", Date.parse("2026-09-26T08:40:00Z"))), "2026-09-26T08:30:00.000Z");
assert.equal(s.whenLabel(Date.parse("2026-09-28T02:30:00Z"), "Asia/Kolkata", now), "Mon 08:00");
assert.equal(s.safeZone("Not/AZone"), "UTC");
console.log("schedule OK");
