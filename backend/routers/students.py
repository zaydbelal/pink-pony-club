from __future__ import annotations

from fastapi import APIRouter, HTTPException

import db
from gemini_client import generate_follow_up_material
from rag import retrieve_relevant_chunks
from schemas import FollowUpRequest
from weak_topics import compute_topic_stats

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/{student_id}/weak-topics")
async def student_weak_topics(student_id: str):
    submissions = db.get_submissions_by_student(student_id)
    topic_stats = compute_topic_stats(submissions)
    return {"topicStats": topic_stats, "submissionCount": len(submissions)}


@router.post("/{student_id}/follow-up")
async def student_follow_up(student_id: str, body: FollowUpRequest):
    submissions = db.get_submissions_by_student(student_id)
    topic_stats = compute_topic_stats(submissions)
    stat = next((t for t in topic_stats if t.topic == body.topic), None)
    if not stat:
        raise HTTPException(
            status_code=404, detail="No graded submissions found for this topic yet"
        )

    matching_unit = None
    for s in submissions:
        unit = db.get_unit(s.unitId)
        if unit and any(q.topic == body.topic for q in unit.paper.questions):
            matching_unit = unit
            break
    subject = matching_unit.syllabus.subject if matching_unit else "General"

    retrieved = (
        await retrieve_relevant_chunks(matching_unit.id, body.topic) if matching_unit else []
    )

    follow_up = await generate_follow_up_material(
        subject, body.topic, stat.sampleMistakes, [r.text for r in retrieved]
    )

    return {"followUp": follow_up, "topicStats": stat}
