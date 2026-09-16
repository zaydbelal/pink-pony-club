from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

import db
import gemini_client
from rag import add_document_to_unit, retrieve_relevant_chunks
from schemas import (
    AddDocumentRequest,
    CreateUnitRequest,
    FeynmanEvaluateRequest,
    GenerateRemediationRequest,
    PatchUnitRequest,
    Unit,
    to_student_paper,
)
from weak_topics import compute_topic_stats, get_weak_cohort

router = APIRouter(prefix="/api/units", tags=["units"])


@router.post("", status_code=201)
async def create_unit(body: CreateUnitRequest):
    notes, paper = await asyncio.gather(
        gemini_client.generate_lecture_notes(body.syllabus),
        gemini_client.generate_question_paper(body.syllabus, body.numQuestions or 6),
    )

    unit = Unit(
        id=str(uuid4()),
        teacherId=body.teacherId,
        status="draft",
        syllabus=body.syllabus,
        notes=notes,
        paper=paper,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    db.create_unit(unit)

    return {"unit": unit}


@router.get("")
async def list_units(
    teacherId: Optional[str] = None,
    status: Optional[str] = None,
    view: Optional[str] = None,
):
    units = db.list_units(teacherId)
    if status in ("published", "draft"):
        units = [u for u in units if u.status == status]

    if view == "student":
        units = [u for u in units if u.status == "published"]
        return {
            "units": [
                {**u.model_dump(), "paper": to_student_paper(u.paper).model_dump()} for u in units
            ]
        }

    return {"units": units}


@router.get("/{unit_id}")
async def get_unit(unit_id: str, view: Optional[str] = None):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    if view == "student":
        if unit.status != "published":
            raise HTTPException(status_code=403, detail="Unit is not published yet")
        return {"unit": {**unit.model_dump(), "paper": to_student_paper(unit.paper).model_dump()}}

    return {"unit": unit}


@router.patch("/{unit_id}")
async def patch_unit(unit_id: str, body: PatchUnitRequest):
    unit = db.update_unit_content(unit_id, notes=body.notes, paper=body.paper)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {"unit": unit}


@router.post("/{unit_id}/publish")
async def publish_unit(unit_id: str):
    unit = db.publish_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {"unit": unit}


@router.post("/{unit_id}/regenerate")
async def regenerate_unit(unit_id: str):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    query = f"{unit.syllabus.subject} - {unit.syllabus.unitTitle}: {unit.syllabus.syllabusText}"
    retrieved = await retrieve_relevant_chunks(unit_id, query)
    retrieved_context = [r.text for r in retrieved]

    notes, paper = await asyncio.gather(
        gemini_client.generate_lecture_notes(unit.syllabus, retrieved_context),
        gemini_client.generate_question_paper(
            unit.syllabus, len(unit.paper.questions), retrieved_context
        ),
    )

    updated = db.update_unit_content(unit_id, notes=notes, paper=paper)
    return {"unit": updated, "retrievedChunks": len(retrieved)}


@router.post("/{unit_id}/documents", status_code=201)
async def add_document(unit_id: str, body: AddDocumentRequest):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    result = await add_document_to_unit(unit_id, body.title, body.sourceText)
    return result


@router.get("/{unit_id}/weak-topics")
async def unit_weak_topics(unit_id: str):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    submissions = db.get_submissions_by_unit(unit_id)
    topic_stats = compute_topic_stats(submissions)
    return {"topicStats": topic_stats, "submissionCount": len(submissions)}


@router.get("/{unit_id}/cohort")
async def unit_cohort(unit_id: str, topic: Optional[str] = Query(default=None)):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    if not topic:
        raise HTTPException(status_code=400, detail="topic query param is required")

    cohort = get_weak_cohort(unit_id, topic)
    return {"cohort": cohort}


@router.post("/{unit_id}/feynman", status_code=201)
async def create_feynman_session(unit_id: str, body: FeynmanEvaluateRequest):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    relevant_questions = [q for q in unit.paper.questions if q.topic == body.topic]
    notes_text = "\n\n".join(f"{s.heading}: {s.content}" for s in unit.notes.sections)
    question_facts = "\n\n".join(
        f"Q: {q.prompt}\nCorrect answer: {q.answerKey}\nRubric: {q.rubric}"
        for q in relevant_questions
    )
    retrieved = await retrieve_relevant_chunks(unit_id, body.topic)
    grounding_context = "\n\n---\n\n".join(
        part for part in [notes_text, question_facts, *[r.text for r in retrieved]] if part
    )

    if not grounding_context.strip():
        raise HTTPException(
            status_code=400,
            detail="No grounding material found for this topic in the unit's notes, questions, or knowledge base",
        )

    prior_sessions = db.get_feynman_sessions(unit_id, body.studentId, body.topic)
    prior_attempts = [
        {
            "attemptNumber": s.attemptNumber,
            "clarityPct": s.evaluation.clarityPct,
            "misconceptionStatement": s.evaluation.misconception.statement
            if s.evaluation.misconception
            else None,
        }
        for s in prior_sessions
    ]

    evaluation = await gemini_client.evaluate_feynman_explanation(
        unit.syllabus.subject,
        body.topic,
        grounding_context,
        body.explanationText,
        prior_attempts,
    )

    session = db.StoredFeynmanSession(
        id=str(uuid4()),
        unitId=unit_id,
        studentId=body.studentId,
        topic=body.topic,
        attemptNumber=len(prior_sessions) + 1,
        explanationText=body.explanationText,
        evaluation=evaluation,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    db.create_feynman_session(session)

    return {"session": session, "attemptHistory": [*prior_sessions, session]}


@router.get("/{unit_id}/feynman")
async def list_feynman_sessions(
    unit_id: str, studentId: Optional[str] = None, topic: Optional[str] = None
):
    if not studentId or not topic:
        raise HTTPException(
            status_code=400, detail="studentId and topic query params are required"
        )
    sessions = db.get_feynman_sessions(unit_id, studentId, topic)
    return {"sessions": sessions}


@router.post("/{unit_id}/remediation", status_code=201)
async def create_remediation(unit_id: str, body: GenerateRemediationRequest):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    cohort_submissions = [
        s for s in db.get_submissions_by_unit(unit_id) if s.studentId in body.studentIds
    ]
    stat = next(
        (t for t in compute_topic_stats(cohort_submissions) if t.topic == body.topic), None
    )
    sample_mistakes = stat.sampleMistakes if stat else []

    retrieved = await retrieve_relevant_chunks(unit_id, body.topic)
    retrieved_context = [r.text for r in retrieved]
    cohort_size = len(body.studentIds)
    subject = unit.syllabus.subject

    # Multi-agent pipeline: Diagnostician -> Content -> Reviewer (one revision
    # pass if the Reviewer rejects the first draft).
    diagnosis = await gemini_client.diagnose_weak_topic(
        subject, body.topic, sample_mistakes, cohort_size, retrieved_context
    )
    plan = await gemini_client.generate_remediation_plan(
        subject, body.topic, diagnosis, cohort_size, retrieved_context
    )
    verdict = await gemini_client.review_remediation_plan(
        body.topic, diagnosis, plan, sample_mistakes
    )

    revised = False
    if not verdict.approved:
        plan = await gemini_client.generate_remediation_plan(
            subject,
            body.topic,
            diagnosis,
            cohort_size,
            retrieved_context,
            reviewer_feedback=verdict.feedback,
        )
        revised = True

    assignment = db.StoredAssignment(
        id=str(uuid4()),
        unitId=unit_id,
        topic=body.topic,
        plan=plan,
        studentIds=body.studentIds,
        createdAt=datetime.now(timezone.utc).isoformat(),
        diagnosis=diagnosis,
        reviewFeedback=verdict.feedback,
        revised=revised,
    )
    db.create_assignment(assignment)

    return {"assignment": assignment}


@router.get("/{unit_id}/remediation")
async def list_remediation(unit_id: str):
    unit = db.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    assignments = db.list_assignments_by_unit(unit_id)
    return {"assignments": assignments}
