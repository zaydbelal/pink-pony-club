"""Weekly report compilation - a direct port of lib/reports.ts."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import List
from uuid import uuid4

from db import (
    StoredReport,
    StoredSubmission,
    create_report,
    get_submissions_since,
    get_unit,
    list_units,
)
from gemini_client import generate_weekly_report_narrative
from schemas import WeeklyReportContent
from weak_topics import compute_topic_stats

DEFAULT_PERIOD_DAYS = 7

logger = logging.getLogger("classpilot.reports")


def _send_report_email_stub(recipient_email: str, content: WeeklyReportContent) -> bool:
    """
    Stubbed email delivery - logs the report instead of sending it.
    Swap this for a real Resend (or other provider) call later; the report
    content shape (WeeklyReportContent) doesn't need to change.
    """
    attention = (
        "; ".join(f"{s.studentId} ({s.reason})" for s in content.studentsNeedingAttention)
        or "none"
    )
    actions = "; ".join(content.recommendedActions) or "none"
    logger.info(
        "[email:stub] Would send to %s\nSubject: %s\n\n%s\n\n%s\n\n"
        "Students needing attention: %s\nRecommended actions: %s",
        recipient_email,
        content.subject,
        content.headline,
        content.classSummary,
        attention,
        actions,
    )
    return True


def _scope_submissions_to_teacher(
    submissions: List[StoredSubmission], teacher_id: str
) -> List[StoredSubmission]:
    result = []
    for s in submissions:
        unit = get_unit(s.unitId)
        if unit and unit.teacherId == teacher_id:
            result.append(s)
    return result


async def compile_weekly_report(
    teacher_id: str, recipient_email: str, period_days: int = DEFAULT_PERIOD_DAYS
) -> StoredReport:
    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=period_days)

    submissions = _scope_submissions_to_teacher(
        get_submissions_since(period_start.isoformat()), teacher_id
    )

    class_topic_stats = compute_topic_stats(submissions)

    student_ids = list(dict.fromkeys(s.studentId for s in submissions))
    per_student_weak_topics = []
    for student_id in student_ids:
        weak_topics = [
            t
            for t in compute_topic_stats([s for s in submissions if s.studentId == student_id])
            if t.isWeak
        ]
        if weak_topics:
            per_student_weak_topics.append(
                {"studentId": student_id, "weakTopics": [t.model_dump() for t in weak_topics]}
            )

    content = await generate_weekly_report_narrative(
        period_start.isoformat(),
        period_end.isoformat(),
        class_topic_stats,
        per_student_weak_topics,
    )

    email_sent = _send_report_email_stub(recipient_email, content)

    report = StoredReport(
        id=str(uuid4()),
        teacherId=teacher_id,
        periodStart=period_start.isoformat(),
        periodEnd=period_end.isoformat(),
        recipientEmail=recipient_email,
        content=content,
        emailSent=email_sent,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    create_report(report)
    return report


async def run_weekly_reports_for_all_teachers() -> None:
    """Discovers every teacher with at least one unit and compiles a report for each - the autonomous entry point the scheduler calls."""
    teacher_ids = list(dict.fromkeys(u.teacherId for u in list_units()))
    for teacher_id in teacher_ids:
        try:
            await compile_weekly_report(teacher_id, f"{teacher_id}@example.com")
        except Exception as error:
            logger.error("[scheduler] report generation failed for teacher %s: %s", teacher_id, error)
