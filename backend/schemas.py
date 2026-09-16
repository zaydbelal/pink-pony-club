"""Pydantic models mirroring the original lib/schemas.ts (zod) definitions.

Field names intentionally use the same camelCase spelling as the TypeScript
source so the JSON wire format is unchanged and the existing Next.js frontend
requires no changes.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class SyllabusInput(BaseModel):
    subject: str
    unitTitle: str
    gradeLevel: Optional[str] = None
    syllabusText: str


class LectureNotesSection(BaseModel):
    heading: str
    content: str


class LectureNotes(BaseModel):
    title: str
    sections: List[LectureNotesSection]


QuestionType = Literal["short_answer", "long_answer", "mcq"]


class Question(BaseModel):
    id: str
    type: QuestionType
    topic: str
    prompt: str
    options: Optional[List[str]] = None
    answerKey: str
    rubric: str
    points: float


class QuestionPaper(BaseModel):
    title: str
    instructions: str
    questions: List[Question]


class StudentAnswer(BaseModel):
    questionId: str
    answer: str


class QuestionGrade(BaseModel):
    questionId: str
    score: float
    maxScore: float
    feedback: str


class PaperGrade(BaseModel):
    totalScore: float
    maxScore: float
    questionGrades: List[QuestionGrade]


class HintRequest(BaseModel):
    problem: str
    studentAttempt: Optional[str] = None
    hintsGivenSoFar: List[str] = Field(default_factory=list)


class HintResponse(BaseModel):
    hint: str
    isFinalHint: bool


class StudentQuestion(BaseModel):
    id: str
    type: QuestionType
    topic: str
    prompt: str
    options: Optional[List[str]] = None
    points: float


class StudentQuestionPaper(BaseModel):
    title: str
    instructions: str
    questions: List[StudentQuestion]


def to_student_paper(paper: QuestionPaper) -> StudentQuestionPaper:
    """Strips the answer key and grading rubric so a paper is safe to send to students."""
    return StudentQuestionPaper(
        title=paper.title,
        instructions=paper.instructions,
        questions=[
            StudentQuestion(
                id=q.id,
                type=q.type,
                topic=q.topic,
                prompt=q.prompt,
                options=q.options,
                points=q.points,
            )
            for q in paper.questions
        ],
    )


UnitStatus = Literal["draft", "published"]


class Unit(BaseModel):
    id: str
    teacherId: str
    status: UnitStatus
    syllabus: SyllabusInput
    notes: LectureNotes
    paper: QuestionPaper
    createdAt: str


class CreateUnitRequest(BaseModel):
    teacherId: str = Field(default="demo-teacher", min_length=1)
    syllabus: SyllabusInput
    numQuestions: Optional[int] = Field(default=None, ge=1, le=30)


class PatchUnitRequest(BaseModel):
    notes: Optional[LectureNotes] = None
    paper: Optional[QuestionPaper] = None


class CreateSubmissionRequest(BaseModel):
    unitId: str
    studentId: str
    answers: List[StudentAnswer]


class Submission(BaseModel):
    id: str
    unitId: str
    studentId: str
    answers: List[StudentAnswer]
    grade: PaperGrade
    createdAt: str


class TopicStats(BaseModel):
    topic: str
    correctCount: int
    partialCount: int
    incorrectCount: int
    scoredPoints: float
    maxPoints: float
    avgScorePct: float
    isWeak: bool
    sampleMistakes: List[str]


class FollowUpRequest(BaseModel):
    topic: str


class FollowUpMaterial(BaseModel):
    topic: str
    remedialNotes: str
    practiceQuestions: List[Question] = Field(min_length=1)


class AddDocumentRequest(BaseModel):
    title: str = Field(min_length=1)
    sourceText: str = Field(min_length=1)


class RetrievedChunk(BaseModel):
    documentTitle: str
    text: str
    similarity: float


class StudentNeedingAttention(BaseModel):
    studentId: str
    reason: str


class WeeklyReportContent(BaseModel):
    subject: str
    headline: str
    classSummary: str
    studentsNeedingAttention: List[StudentNeedingAttention]
    recommendedActions: List[str]


class Report(BaseModel):
    id: str
    teacherId: str
    periodStart: str
    periodEnd: str
    recipientEmail: str
    content: WeeklyReportContent
    emailSent: bool
    createdAt: str


class GenerateReportRequest(BaseModel):
    teacherId: str = Field(default="demo-teacher", min_length=1)
    recipientEmail: str = "teacher@example.com"
    sinceDays: Optional[int] = Field(default=None, ge=1, le=90)


class Misconception(BaseModel):
    statement: str
    deficiency: str


class FeynmanEvaluation(BaseModel):
    clarityPct: float = Field(ge=0, le=100)
    understoodConstructs: List[str]
    needsClarity: List[str]
    misconception: Optional[Misconception] = None
    nextGuidedPrompt: str


class FeynmanEvaluateRequest(BaseModel):
    studentId: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    explanationText: str = Field(min_length=1)


class FeynmanSession(BaseModel):
    id: str
    unitId: str
    studentId: str
    topic: str
    attemptNumber: int = Field(ge=1)
    explanationText: str
    evaluation: FeynmanEvaluation
    createdAt: str


RemediationStepKind = Literal[
    "concept_recap", "guided_questions", "application_question", "mastery_check"
]


class RemediationStep(BaseModel):
    order: int = Field(ge=1)
    kind: RemediationStepKind
    title: str
    description: str
    estMinutes: int = Field(ge=1)


class RemediationPlan(BaseModel):
    topic: str
    steps: List[RemediationStep] = Field(min_length=1)


class CohortMember(BaseModel):
    studentId: str
    avgScorePct: float


class GenerateRemediationRequest(BaseModel):
    topic: str = Field(min_length=1)
    studentIds: List[str] = Field(min_length=1)


class Assignment(BaseModel):
    id: str
    unitId: str
    topic: str
    plan: RemediationPlan
    studentIds: List[str]
    createdAt: str
