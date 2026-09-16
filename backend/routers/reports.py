from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

import db
from reports import compile_weekly_report
from schemas import GenerateReportRequest

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("")
async def list_reports(teacherId: Optional[str] = None):
    reports = db.list_reports(teacherId)
    return {"reports": reports}


@router.post("/generate", status_code=201)
async def generate_report(body: GenerateReportRequest):
    report = await compile_weekly_report(
        body.teacherId, body.recipientEmail, body.sinceDays or 7
    )
    return {"report": report}
