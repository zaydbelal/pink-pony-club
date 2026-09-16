/**
 * Starts the autonomous weekly-report scheduler once when the Next.js server boots.
 * Demo cadence defaults to every 10 minutes (REPORT_INTERVAL_MS) so the autonomous
 * cycle is actually observable in a demo instead of waiting a real week; a
 * production deployment would swap this for a real cron/queue trigger instead of
 * an in-process interval, which resets on every restart and only runs on one instance.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __classpilotSchedulerStarted?: boolean };
  if (g.__classpilotSchedulerStarted) return;
  g.__classpilotSchedulerStarted = true;

  const intervalMs = Number(process.env.REPORT_INTERVAL_MS) || 10 * 60 * 1000;
  const { runWeeklyReportsForAllTeachers } = await import("./lib/reports");

  setInterval(() => {
    runWeeklyReportsForAllTeachers().catch((error) => {
      console.error("[scheduler] weekly report run failed:", error);
    });
  }, intervalMs);

  console.log(`[scheduler] autonomous weekly report job started, interval=${intervalMs}ms`);
}
