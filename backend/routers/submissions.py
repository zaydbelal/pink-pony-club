from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

import db
from gemini_client import grade_submission
from schemas import CreateSubmissionRequest

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


@router.post("", status_code=201)
async def create_submission(body: CreateSubmissionRequest):
    unit = db.get_unit(body.unitId)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    if unit.status != "published":
        raise HTTPException(status_code=403, detail="Unit is not published yet")

    grade = await grade_submission(unit.paper, body.answers)

    submission = db.StoredSubmission(
        id=str(uuid4()),
        unitId=body.unitId,
        studentId=body.studentId,
        answers=body.answers,
        grade=grade,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    db.create_submission(submission)

    return {"submission": submission}
