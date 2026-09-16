"""Pure aggregation over graded submissions - a direct port of lib/weak-topics.ts."""

from __future__ import annotations

from typing import Dict, List

from db import StoredSubmission, get_submissions_by_unit, get_unit
from schemas import CohortMember, TopicStats

WEAK_THRESHOLD_PCT = 60
MAX_SAMPLE_MISTAKES_PER_TOPIC = 3


class _TopicAccumulator:
    def __init__(self) -> None:
        self.correct_count = 0
        self.partial_count = 0
        self.incorrect_count = 0
        self.scored_points = 0.0
        self.max_points = 0.0
        self.sample_mistakes: List[str] = []


def compute_topic_stats(submissions: List[StoredSubmission]) -> List[TopicStats]:
    """Pure aggregation over already-graded submissions - no model call, just arithmetic over stored grades."""
    by_topic: Dict[str, _TopicAccumulator] = {}

    for submission in submissions:
        unit = get_unit(submission.unitId)
        if not unit:
            continue

        question_by_id = {q.id: q for q in unit.paper.questions}

        for question_grade in submission.grade.questionGrades:
            question = question_by_id.get(question_grade.questionId)
            if not question:
                continue

            topic = question.topic
            acc = by_topic.setdefault(topic, _TopicAccumulator())

            acc.scored_points += question_grade.score
            acc.max_points += question_grade.maxScore

            if question_grade.score >= question_grade.maxScore:
                acc.correct_count += 1
            elif question_grade.score <= 0:
                acc.incorrect_count += 1
                if len(acc.sample_mistakes) < MAX_SAMPLE_MISTAKES_PER_TOPIC:
                    acc.sample_mistakes.append(question_grade.feedback)
            else:
                acc.partial_count += 1
                if len(acc.sample_mistakes) < MAX_SAMPLE_MISTAKES_PER_TOPIC:
                    acc.sample_mistakes.append(question_grade.feedback)

    stats: List[TopicStats] = []
    for topic, acc in by_topic.items():
        avg_score_pct = (acc.scored_points / acc.max_points) * 100 if acc.max_points > 0 else 0.0
        stats.append(
            TopicStats(
                topic=topic,
                correctCount=acc.correct_count,
                partialCount=acc.partial_count,
                incorrectCount=acc.incorrect_count,
                scoredPoints=acc.scored_points,
                maxPoints=acc.max_points,
                avgScorePct=avg_score_pct,
                isWeak=avg_score_pct < WEAK_THRESHOLD_PCT,
                sampleMistakes=acc.sample_mistakes,
            )
        )

    stats.sort(key=lambda s: s.avgScorePct)
    return stats


def get_weak_cohort(unit_id: str, topic: str) -> List[CohortMember]:
    """Students in this unit whose average score on `topic` is below the weak threshold."""
    submissions = get_submissions_by_unit(unit_id)
    by_student: Dict[str, List[StoredSubmission]] = {}
    for s in submissions:
        by_student.setdefault(s.studentId, []).append(s)

    cohort: List[CohortMember] = []
    for student_id, student_submissions in by_student.items():
        stat = next(
            (t for t in compute_topic_stats(student_submissions) if t.topic == topic), None
        )
        if stat and stat.isWeak:
            cohort.append(CohortMember(studentId=student_id, avgScorePct=stat.avgScorePct))

    cohort.sort(key=lambda c: c.avgScorePct)
    return cohort
