from __future__ import annotations

from fastapi import APIRouter

from gemini_client import generate_hint
from schemas import HintRequest

router = APIRouter(prefix="/api/hint", tags=["hint"])


@router.post("")
async def create_hint(body: HintRequest):
    hint = await generate_hint(body)
    return {"hint": hint}
