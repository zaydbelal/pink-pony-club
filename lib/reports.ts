import { randomUUID } from "crypto";
import {
  getSubmissionsSince,
  getUnit,
  createReport,
  listUnits,
  type StoredSubmission,
  type StoredReport,
} from "./db";
import { computeTopicStats } from "./weak-topics";
import { generateWeeklyReportNarrative } from "./gemini";
import type { WeeklyReportContent } from "./schemas";

const DEFAULT_PERIOD_DAYS = 7;

/**
 * Stubbed email delivery - logs the report instead of sending it.
 * Swap this for a real Resend (or other provider) call later; the report
 * content shape (WeeklyReportContent) doesn't need to change.
 */
async function sendReportEmailStub(
  recipientEmail: string,
  content: WeeklyReportContent,
): Promise<boolean> {
  console.log(
    `[email:stub] Would send to ${recipientEmail}\n` +
      `Subject: ${content.subject}\n\n` +
      `${content.headline}\n\n${content.classSummary}\n\n` +
      `Students needing attention: ${content.studentsNeedingAttention
        .map((s) => `${s.studentId} (${s.reason})`)
        .join("; ") || "none"}\n` +
      `Recommended actions: ${content.recommendedActions.join("; ") || "none"}`,
  );
  return true;
}

function scopeSubmissionsToTeacher(
  submissions: StoredSubmission[],
  teacherId: string,
): StoredSubmission[] {
  return submissions.filter((s) => getUnit(s.unitId)?.teacherId === teacherId);
}

export async function compileWeeklyReport(
  teacherId: string,
  recipientEmail: string,
  periodDays = DEFAULT_PERIOD_DAYS,
): Promise<StoredReport> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const submissions = scopeSubmissionsToTeacher(
    getSubmissionsSince(periodStart.toISOString()),
    teacherId,
  );

  const classTopicStats = computeTopicStats(submissions);

  const studentIds = Array.from(new Set(submissions.map((s) => s.studentId)));
  const perStudentWeakTopics = studentIds
    .map((studentId) => ({
      studentId,
      weakTopics: computeTopicStats(submissions.filter((s) => s.studentId === studentId)).filter(
        (t) => t.isWeak,
      ),
    }))
    .filter((s) => s.weakTopics.length > 0);

  const content = await generateWeeklyReportNarrative(
    periodStart.toISOString(),
    periodEnd.toISOString(),
    classTopicStats,
    perStudentWeakTopics,
  );

  const emailSent = await sendReportEmailStub(recipientEmail, content);

  const report: StoredReport = {
    id: randomUUID(),
    teacherId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    recipientEmail,
    content,
    emailSent,
    createdAt: new Date().toISOString(),
  };
  createReport(report);
  return report;
}

/** Discovers every teacher with at least one unit and compiles a report for each - the autonomous entry point the scheduler calls. */
export async function runWeeklyReportsForAllTeachers(): Promise<void> {
  const teacherIds = Array.from(new Set(listUnits().map((u) => u.teacherId)));
  for (const teacherId of teacherIds) {
    try {
      await compileWeeklyReport(teacherId, `${teacherId}@example.com`);
    } catch (error) {
      console.error(`[scheduler] report generation failed for teacher ${teacherId}:`, error);
    }
  }
}
