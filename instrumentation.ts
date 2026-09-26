/**
 * Starts the in-process scheduler when the app runs as a long-lived server
 * (`next start`, Docker, a VM). On serverless hosts, call /api/cron/tick from
 * a cron instead. Set SCHEDULER=off to disable, SCHEDULER=on to force.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const mode = process.env.SCHEDULER?.trim().toLowerCase();
  if (mode === "off" || (mode !== "on" && process.env.VERCEL)) return;

  const g = globalThis as unknown as { __agenticScheduler?: boolean };
  if (g.__agenticScheduler) return;
  g.__agenticScheduler = true;

  const { tick } = await import("./lib/server/scheduler");
  let running = false;
  const loop = async () => {
    if (running) return; // Never overlap passes in one process.
    running = true;
    try {
      const r = await tick({ budgetMs: 50_000 });
      if (r.started) console.log(`[scheduler] ran ${r.started} routine(s): ${r.done} done, ${r.failed} failed`);
    } catch (e) {
      console.error("[scheduler] tick failed", e);
    } finally {
      running = false;
    }
  };
  // Align to the start of each minute so 08:00 routines start at 08:00.
  setTimeout(() => {
    loop();
    setInterval(loop, 60_000);
  }, 60_000 - (Date.now() % 60_000) + 2_000);
  console.log("[scheduler] in-process scheduler started (checks every minute)");
}
