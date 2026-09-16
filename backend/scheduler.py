"""
Starts the autonomous weekly-report scheduler once when the API server boots.
Demo cadence defaults to every 10 minutes (REPORT_INTERVAL_MS) so the autonomous
cycle is actually observable in a demo instead of waiting a real week; a
production deployment would swap this for a real cron/queue trigger instead of
an in-process loop, which resets on every restart and only runs on one instance.

n8n/weekly-reports-workflow.json is exactly that external replacement - it
calls the same POST /api/reports/generate endpoint on a real cron schedule
from outside the process. Set SCHEDULER_ENABLED=false when running that
workflow so reports aren't generated twice.

A direct port of instrumentation.ts.
"""

from __future__ import annotations

import asyncio
import logging
import os

from reports import run_weekly_reports_for_all_teachers

logger = logging.getLogger("classpilot.scheduler")

_task: asyncio.Task | None = None


async def _loop(interval_seconds: float) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await run_weekly_reports_for_all_teachers()
        except Exception as error:
            logger.error("[scheduler] weekly report run failed: %s", error)


def start_scheduler() -> None:
    global _task
    if _task is not None:
        return

    if (os.environ.get("SCHEDULER_ENABLED") or "true").strip().lower() in ("false", "0", "no"):
        logger.info("[scheduler] disabled via SCHEDULER_ENABLED - not starting the in-process loop")
        return

    interval_ms = int(os.environ.get("REPORT_INTERVAL_MS") or 0) or 10 * 60 * 1000
    interval_seconds = interval_ms / 1000

    _task = asyncio.create_task(_loop(interval_seconds))
    logger.info("[scheduler] autonomous weekly report job started, interval=%sms", interval_ms)
