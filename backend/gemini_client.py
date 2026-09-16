"""Gemini API wrapper - a direct port of lib/gemini.ts onto the google-genai Python SDK."""

from __future__ import annotations

import json
import os
from typing import List, Optional, Type, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from schemas import (
    FeynmanEvaluation,
    FollowUpMaterial,
    HintRequest,
    HintResponse,
    LectureNotes,
    PaperGrade,
    QuestionPaper,
    RemediationPlan,
    StudentAnswer,
    SyllabusInput,
    TopicStats,
    WeeklyReportContent,
)

MODEL = (os.environ.get("GEMINI_MODEL") or "").strip() or "gemini-3.6-flash"
EMBEDDING_MODEL = (os.environ.get("GEMINI_EMBEDDING_MODEL") or "").strip() or "gemini-embedding-001"

_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    return _client


async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embeds a batch of texts, returning one vector per input in the same order."""
    response = await _get_client().aio.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=texts,
    )
    embeddings = response.embeddings
    if not embeddings or len(embeddings) != len(texts):
        raise RuntimeError("Gemini embedding response didn't match the number of inputs")
    result = []
    for e in embeddings:
        if not e.values:
            raise RuntimeError("Gemini returned an embedding with no values")
        result.append(list(e.values))
    return result


def _format_retrieved_context(chunks: Optional[List[str]]) -> str:
    if not chunks:
        return ""
    excerpts = "\n\n".join(f"--- excerpt {i + 1} ---\n{c}" for i, c in enumerate(chunks))
    return (
        "\n\nReference material retrieved from the teacher's knowledge base (use this as your "
        "primary source where relevant, in addition to the syllabus above):\n" + excerpts
    )


T = TypeVar("T", bound=BaseModel)


async def _generate_structured(
    schema: Type[T],
    system_instruction: str,
    prompt: str,
    max_output_tokens: int = 8000,
) -> T:
    response = await _get_client().aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=schema,
            max_output_tokens=max_output_tokens,
        ),
    )

    text = response.text
    if not text:
        raise RuntimeError("Gemini returned an empty response")

    try:
        parsed_json = json.loads(text)
    except json.JSONDecodeError:
        raise RuntimeError("Gemini returned output that wasn't valid JSON")

    try:
        return schema.model_validate(parsed_json)
    except Exception as error:  # pydantic.ValidationError
        raise RuntimeError(
            f"Gemini returned output that didn't match the expected schema: {error}"
        )


async def generate_lecture_notes(
    input: SyllabusInput, retrieved_context: Optional[List[str]] = None
) -> LectureNotes:
    return await _generate_structured(
        schema=LectureNotes,
        system_instruction=(
            "You are an experienced teacher writing lecture notes for a small tuition institution. "
            "Write clear, well-organized notes a teacher can hand directly to students, broken into "
            "logically ordered sections. Stay strictly within the given syllabus scope - do not invent "
            "topics the syllabus doesn't cover."
        ),
        prompt=(
            f"Subject: {input.subject}\n"
            f"Unit: {input.unitTitle}\n"
            + (f"Grade level: {input.gradeLevel}\n" if input.gradeLevel else "")
            + f"Syllabus:\n{input.syllabusText}\n\n"
            "Generate the lecture notes for this unit."
            + _format_retrieved_context(retrieved_context)
        ),
        max_output_tokens=16000,
    )


async def generate_question_paper(
    input: SyllabusInput,
    num_questions: int = 6,
    retrieved_context: Optional[List[str]] = None,
) -> QuestionPaper:
    return await _generate_structured(
        schema=QuestionPaper,
        system_instruction=(
            "You are an experienced teacher writing an exam question paper for a small tuition "
            "institution, strictly from the given syllabus. For every question, also produce an "
            "internal answer key and a short grading rubric - these are for the teacher/grader only "
            "and must never be shown to students. Mix question types where appropriate "
            "(short_answer, long_answer, mcq) and give each question a point value. "
            "Every question id must be unique. Every question must also have a short topic label "
            "(2-5 words, e.g. 'fraction subtraction' or 'photosynthesis - light reactions') naming "
            "the specific sub-topic it tests, granular enough to be useful for tracking which exact "
            "sub-topics a student is weak in - do not just reuse the unit title as the topic."
        ),
        prompt=(
            f"Subject: {input.subject}\n"
            f"Unit: {input.unitTitle}\n"
            + (f"Grade level: {input.gradeLevel}\n" if input.gradeLevel else "")
            + f"Syllabus:\n{input.syllabusText}\n\n"
            f"Generate a question paper with exactly {num_questions} questions covering this syllabus."
            + _format_retrieved_context(retrieved_context)
        ),
        max_output_tokens=16000,
    )


async def grade_submission(paper: QuestionPaper, answers: List[StudentAnswer]) -> PaperGrade:
    answer_by_id = {a.questionId: a.answer for a in answers}
    grading_input = [
        {
            "questionId": q.id,
            "prompt": q.prompt,
            "answerKey": q.answerKey,
            "rubric": q.rubric,
            "maxScore": q.points,
            "studentAnswer": answer_by_id.get(q.id, "(no answer submitted)"),
        }
        for q in paper.questions
    ]

    return await _generate_structured(
        schema=PaperGrade,
        system_instruction=(
            "You are grading a student's exam submission against the teacher's answer key and rubric "
            "for each question. Score fairly, giving partial credit per the rubric where the student's "
            "reasoning is partially correct. Give concise, specific per-question feedback the student "
            "will see. totalScore/maxScore must equal the sum of the per-question scores/maxScores."
        ),
        prompt=f"Grade this submission:\n{json.dumps(grading_input, indent=2)}",
        max_output_tokens=16000,
    )


async def generate_follow_up_material(
    subject: str,
    topic: str,
    sample_mistakes: List[str],
    retrieved_context: Optional[List[str]] = None,
) -> FollowUpMaterial:
    mistakes_text = (
        "\n".join(f"{i + 1}. {m}" for i, m in enumerate(sample_mistakes))
        if sample_mistakes
        else "(no specific feedback available - write general remedial material for this topic)"
    )
    return await _generate_structured(
        schema=FollowUpMaterial,
        system_instruction=(
            "You are an experienced teacher writing targeted remedial material for a small group of "
            "students who are struggling with one specific sub-topic, based on real feedback from "
            "their graded submissions. Write short remedial notes (a few paragraphs, not a full "
            "lecture) that directly address the pattern of mistakes shown, then write 2-4 new "
            "practice questions targeting exactly this sub-topic, each with an answer key, rubric, "
            "point value, and this same topic label. Do not repeat the mistakes verbatim - use them "
            "only to diagnose what to re-teach. If reference material is provided, ground your "
            "explanation in it rather than general knowledge."
        ),
        prompt=(
            f"Subject: {subject}\n"
            f"Weak topic: {topic}\n"
            f"Sample grader feedback on recent mistakes in this topic:\n{mistakes_text}\n\n"
            "Generate the remedial notes and practice questions."
            + _format_retrieved_context(retrieved_context)
        ),
        max_output_tokens=8000,
    )


async def generate_weekly_report_narrative(
    period_start: str,
    period_end: str,
    class_topic_stats: List[TopicStats],
    per_student_weak_topics: List[dict],
) -> WeeklyReportContent:
    return await _generate_structured(
        schema=WeeklyReportContent,
        system_instruction=(
            "You are writing a weekly performance summary email for a tuition center teacher, based "
            "on real aggregated grading data (not speculation). Be concrete and specific - name actual "
            "topics and actual student ids from the data given, never invent ones. Keep the class "
            "summary and headline actionable and brief; a busy teacher should be able to read this in "
            "under a minute and know exactly what to re-teach and who needs help."
        ),
        prompt=(
            f"Reporting period: {period_start} to {period_end}\n\n"
            f"Class-wide topic performance (weakest first):\n"
            f"{json.dumps([s.model_dump() for s in class_topic_stats], indent=2)}\n\n"
            f"Per-student weak topics:\n{json.dumps(per_student_weak_topics, indent=2)}\n\n"
            "Write the weekly report."
        ),
        max_output_tokens=8000,
    )


async def evaluate_feynman_explanation(
    subject: str,
    topic: str,
    grounding_context: str,
    explanation_text: str,
    prior_attempts: List[dict],
) -> FeynmanEvaluation:
    prior_text = ""
    if prior_attempts:
        lines = []
        for a in prior_attempts:
            line = f"Attempt {a['attemptNumber']}: {a['clarityPct']}% clarity"
            if a.get("misconceptionStatement"):
                line += f', misconception: "{a["misconceptionStatement"]}"'
            lines.append(line)
        prior_text = "Prior attempts on this topic:\n" + "\n".join(lines) + "\n\n"

    return await _generate_structured(
        schema=FeynmanEvaluation,
        system_instruction=(
            "You are evaluating a student's free-text explanation of a concept, taught back in their "
            "own words (the Feynman technique). Judge ONLY against the grounding material given - "
            "never introduce facts it doesn't support. Score clarityPct (0-100) on how completely and "
            "correctly the explanation covers the grounding material's key causal mechanisms, not on "
            "writing quality. List understoodConstructs (specific ideas the student got right) and "
            "needsClarity (specific gaps or vague spots) as short phrases, not full sentences. If the "
            "explanation contains a genuine factual error or backwards-causality mistake, set "
            "misconception to {statement: what they said/implied, deficiency: a short category label "
            "e.g. 'structural enzymology', 'pathway topology'} - otherwise set misconception to null; "
            "do not invent a misconception just to fill the field. nextGuidedPrompt should be one "
            "specific follow-up question that would surface the biggest remaining gap."
        ),
        prompt=(
            f"Subject: {subject}\n"
            f"Topic being explained: {topic}\n\n"
            f"Grounding material (the only source of truth for judging correctness):\n{grounding_context}\n\n"
            f"{prior_text}"
            f"Student's explanation (attempt {len(prior_attempts) + 1}):\n\"{explanation_text}\"\n\n"
            "Evaluate this explanation."
        ),
        max_output_tokens=4000,
    )


async def generate_remediation_plan(
    subject: str,
    topic: str,
    sample_mistakes: List[str],
    cohort_size: int,
    retrieved_context: Optional[List[str]] = None,
) -> RemediationPlan:
    mistakes_text = (
        "\n".join(f"{i + 1}. {m}" for i, m in enumerate(sample_mistakes))
        if sample_mistakes
        else "(no specific feedback available - build a general remediation sequence for this topic)"
    )
    return await _generate_structured(
        schema=RemediationPlan,
        system_instruction=(
            "You are a teacher building a short, structured remediation sequence to assign to a group "
            "of students who are weak in one specific sub-topic, based on real feedback from their "
            "graded work. Produce exactly 4 steps, in this order and using these exact kind values: "
            "'concept_recap' (a short re-explanation of the core idea), 'guided_questions' (2-3 "
            "scaffolded questions building up to the concept), 'application_question' (one question "
            "applying it to a new scenario), 'mastery_check' (a short check the teacher can use to "
            "verify the gap closed). Each step needs a concrete title, a one-sentence description of "
            "what it contains, and a realistic estimated minutes. Ground content in the reference "
            "material when provided; otherwise use general subject knowledge for this topic."
        ),
        prompt=(
            f"Subject: {subject}\n"
            f"Weak topic: {topic}\n"
            f"Cohort size: {cohort_size} students\n"
            f"Sample grader feedback on recent mistakes in this topic:\n{mistakes_text}\n\n"
            "Generate the 4-step remediation plan."
            + _format_retrieved_context(retrieved_context)
        ),
        max_output_tokens=4000,
    )


async def generate_hint(req: HintRequest) -> HintResponse:
    tier = len(req.hintsGivenSoFar)
    attempt_line = (
        f"Student's current attempt/progress: {req.studentAttempt}\n"
        if req.studentAttempt
        else "Student has not attempted yet.\n"
    )
    return await _generate_structured(
        schema=HintResponse,
        system_instruction=(
            "You are a tutor giving a student a hint on a practice problem, one graduated step at a "
            "time. Never give the full solution unless this is explicitly the final hint tier (tier 3, "
            "0-indexed: the 4th hint). Each hint should be a small, useful nudge beyond the previous "
            "ones, not a restatement."
        ),
        prompt=(
            f"Problem: {req.problem}\n"
            f"{attempt_line}"
            f"Hints already given (in order): {json.dumps(req.hintsGivenSoFar)}\n"
            f"This will be hint tier {tier} (0-indexed). Give the next hint. "
            "Set isFinalHint to true only if tier >= 3."
        ),
        max_output_tokens=4000,
    )
