"""FastAPI entrypoint for the ClassPilot backend - a Python port of the former
Next.js route handlers under app/api/ plus the instrumentation.ts scheduler.

Run with: uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Must run before any module below reads os.environ (e.g. gemini_client's
# module-level GEMINI_MODEL lookup), and must not depend on the caller's cwd.
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI

from errors import register_error_handlers
from routers import hint, reports, students, submissions, units
from scheduler import start_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_scheduler()
    yield


app = FastAPI(title="ClassPilot API", lifespan=lifespan)

register_error_handlers(app)

app.include_router(units.router)
app.include_router(submissions.router)
app.include_router(students.router)
app.include_router(hint.router)
app.include_router(reports.router)
