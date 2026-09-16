import { getUnit, getSubmissionsByUnit, type StoredSubmission } from "./db";
import type { TopicStats, CohortMember } from "./schemas";

const WEAK_THRESHOLD_PCT = 60;
const MAX_SAMPLE_MISTAKES_PER_TOPIC = 3;

interface TopicAccumulator {
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  scoredPoints: number;
  maxPoints: number;
  sampleMistakes: string[];
}

/** Pure aggregation over already-graded submissions - no model call, just arithmetic over stored grades. */
export function computeTopicStats(submissions: StoredSubmission[]): TopicStats[] {
  const byTopic = new Map<string, TopicAccumulator>();

  for (const submission of submissions) {
    const unit = getUnit(submission.unitId);
    if (!unit) continue;

    const questionById = new Map(unit.paper.questions.map((q) => [q.id, q]));

    for (const questionGrade of submission.grade.questionGrades) {
      const question = questionById.get(questionGrade.questionId);
      if (!question) continue;

      const topic = question.topic;
      const acc = byTopic.get(topic) ?? {
        correctCount: 0,
        partialCount: 0,
        incorrectCount: 0,
        scoredPoints: 0,
        maxPoints: 0,
        sampleMistakes: [],
      };

      acc.scoredPoints += questionGrade.score;
      acc.maxPoints += questionGrade.maxScore;

      if (questionGrade.score >= questionGrade.maxScore) {
        acc.correctCount += 1;
      } else if (questionGrade.score <= 0) {
        acc.incorrectCount += 1;
        if (acc.sampleMistakes.length < MAX_SAMPLE_MISTAKES_PER_TOPIC) {
          acc.sampleMistakes.push(questionGrade.feedback);
        }
      } else {
        acc.partialCount += 1;
        if (acc.sampleMistakes.length < MAX_SAMPLE_MISTAKES_PER_TOPIC) {
          acc.sampleMistakes.push(questionGrade.feedback);
        }
      }

      byTopic.set(topic, acc);
    }
  }

  const stats: TopicStats[] = Array.from(byTopic.entries()).map(([topic, acc]) => {
    const avgScorePct = acc.maxPoints > 0 ? (acc.scoredPoints / acc.maxPoints) * 100 : 0;
    return {
      topic,
      correctCount: acc.correctCount,
      partialCount: acc.partialCount,
      incorrectCount: acc.incorrectCount,
      scoredPoints: acc.scoredPoints,
      maxPoints: acc.maxPoints,
      avgScorePct,
      isWeak: avgScorePct < WEAK_THRESHOLD_PCT,
      sampleMistakes: acc.sampleMistakes,
    };
  });

  return stats.sort((a, b) => a.avgScorePct - b.avgScorePct);
}

/** Students in this unit whose average score on `topic` is below the weak threshold. */
export function getWeakCohort(unitId: string, topic: string): CohortMember[] {
  const submissions = getSubmissionsByUnit(unitId);
  const byStudent = new Map<string, StoredSubmission[]>();
  for (const s of submissions) {
    const list = byStudent.get(s.studentId) ?? [];
    list.push(s);
    byStudent.set(s.studentId, list);
  }

  const cohort: CohortMember[] = [];
  for (const [studentId, studentSubmissions] of byStudent) {
    const stat = computeTopicStats(studentSubmissions).find((t) => t.topic === topic);
    if (stat?.isWeak) {
      cohort.push({ studentId, avgScorePct: stat.avgScorePct });
    }
  }
  return cohort.sort((a, b) => a.avgScorePct - b.avgScorePct);
}
