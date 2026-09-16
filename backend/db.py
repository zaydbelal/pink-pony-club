"""SQLite persistence layer - a direct port of lib/db.ts onto Python's stdlib sqlite3."""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

from schemas import (
    Assignment,
    Diagnosis,
    FeynmanEvaluation,
    FeynmanSession,
    LectureNotes,
    PaperGrade,
    QuestionPaper,
    RemediationPlan,
    StudentAnswer,
    SyllabusInput,
    Unit,
    WeeklyReportContent,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = REPO_ROOT / "classpilot.db"

_db: Optional[sqlite3.Connection] = None
_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL DEFAULT 'demo-teacher',
  status TEXT NOT NULL,
  syllabus_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  paper_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_units_teacher ON units(teacher_id);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  student_id TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  grade_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_unit ON submissions(unit_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  title TEXT NOT NULL,
  source_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_unit ON documents(unit_id);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_unit ON chunks(unit_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  content_json TEXT NOT NULL,
  email_sent INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_teacher ON reports(teacher_id);

CREATE TABLE IF NOT EXISTS feynman_sessions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  student_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  explanation_text TEXT NOT NULL,
  evaluation_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feynman_student_topic ON feynman_sessions(student_id, unit_id, topic);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  topic TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  student_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assignments_unit ON assignments(unit_id);
"""

# Columns added after the initial release - applied as a best-effort migration
# so an existing local classpilot.db doesn't need to be deleted by hand.
_ASSIGNMENT_MIGRATIONS = [
    "ALTER TABLE assignments ADD COLUMN diagnosis_json TEXT",
    "ALTER TABLE assignments ADD COLUMN review_feedback TEXT",
    "ALTER TABLE assignments ADD COLUMN revised INTEGER NOT NULL DEFAULT 0",
]


def get_db() -> sqlite3.Connection:
    global _db
    if _db is not None:
        return _db
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    for migration in _ASSIGNMENT_MIGRATIONS:
        try:
            conn.execute(migration)
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.commit()
    _db = conn
    return _db


# --- units ---


def _row_to_unit(row: sqlite3.Row) -> Unit:
    return Unit(
        id=row["id"],
        teacherId=row["teacher_id"],
        status=row["status"],
        syllabus=SyllabusInput.model_validate(json.loads(row["syllabus_json"])),
        notes=LectureNotes.model_validate(json.loads(row["notes_json"])),
        paper=QuestionPaper.model_validate(json.loads(row["paper_json"])),
        createdAt=row["created_at"],
    )


def create_unit(unit: Unit) -> None:
    with _lock:
        get_db().execute(
            """INSERT INTO units (id, teacher_id, status, syllabus_json, notes_json, paper_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                unit.id,
                unit.teacherId,
                unit.status,
                unit.syllabus.model_dump_json(),
                unit.notes.model_dump_json(),
                unit.paper.model_dump_json(),
                unit.createdAt,
            ),
        )
        get_db().commit()


def get_unit(unit_id: str) -> Optional[Unit]:
    row = get_db().execute("SELECT * FROM units WHERE id = ?", (unit_id,)).fetchone()
    return _row_to_unit(row) if row else None


def list_units(teacher_id: Optional[str] = None) -> List[Unit]:
    if teacher_id:
        rows = get_db().execute(
            "SELECT * FROM units WHERE teacher_id = ? ORDER BY created_at DESC", (teacher_id,)
        ).fetchall()
    else:
        rows = get_db().execute("SELECT * FROM units ORDER BY created_at DESC").fetchall()
    return [_row_to_unit(r) for r in rows]


def update_unit_content(
    unit_id: str,
    notes: Optional[LectureNotes] = None,
    paper: Optional[QuestionPaper] = None,
) -> Optional[Unit]:
    existing = get_unit(unit_id)
    if not existing:
        return None
    new_notes = notes if notes is not None else existing.notes
    new_paper = paper if paper is not None else existing.paper
    with _lock:
        get_db().execute(
            "UPDATE units SET notes_json = ?, paper_json = ? WHERE id = ?",
            (new_notes.model_dump_json(), new_paper.model_dump_json(), unit_id),
        )
        get_db().commit()
    return existing.model_copy(update={"notes": new_notes, "paper": new_paper})


def publish_unit(unit_id: str) -> Optional[Unit]:
    existing = get_unit(unit_id)
    if not existing:
        return None
    with _lock:
        get_db().execute("UPDATE units SET status = 'published' WHERE id = ?", (unit_id,))
        get_db().commit()
    return existing.model_copy(update={"status": "published"})


# --- submissions ---


class StoredSubmission(BaseModel):
    id: str
    unitId: str
    studentId: str
    answers: List[StudentAnswer]
    grade: PaperGrade
    createdAt: str


def _row_to_submission(row: sqlite3.Row) -> StoredSubmission:
    return StoredSubmission(
        id=row["id"],
        unitId=row["unit_id"],
        studentId=row["student_id"],
        answers=[StudentAnswer.model_validate(a) for a in json.loads(row["answers_json"])],
        grade=PaperGrade.model_validate(json.loads(row["grade_json"])),
        createdAt=row["created_at"],
    )


def create_submission(submission: StoredSubmission) -> None:
    with _lock:
        get_db().execute(
            """INSERT INTO submissions (id, unit_id, student_id, answers_json, grade_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                submission.id,
                submission.unitId,
                submission.studentId,
                json.dumps([a.model_dump() for a in submission.answers]),
                submission.grade.model_dump_json(),
                submission.createdAt,
            ),
        )
        get_db().commit()


def get_submissions_by_student(student_id: str) -> List[StoredSubmission]:
    rows = get_db().execute(
        "SELECT * FROM submissions WHERE student_id = ? ORDER BY created_at ASC", (student_id,)
    ).fetchall()
    return [_row_to_submission(r) for r in rows]


def get_submissions_by_unit(unit_id: str) -> List[StoredSubmission]:
    rows = get_db().execute(
        "SELECT * FROM submissions WHERE unit_id = ? ORDER BY created_at ASC", (unit_id,)
    ).fetchall()
    return [_row_to_submission(r) for r in rows]


def get_submissions_since(since_iso: str) -> List[StoredSubmission]:
    rows = get_db().execute(
        "SELECT * FROM submissions WHERE created_at >= ? ORDER BY created_at ASC", (since_iso,)
    ).fetchall()
    return [_row_to_submission(r) for r in rows]


# --- documents & chunks ---


class StoredDocument(BaseModel):
    id: str
    unitId: str
    title: str
    sourceText: str
    createdAt: str


def create_document(doc: StoredDocument) -> None:
    with _lock:
        get_db().execute(
            """INSERT INTO documents (id, unit_id, title, source_text, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (doc.id, doc.unitId, doc.title, doc.sourceText, doc.createdAt),
        )
        get_db().commit()


class StoredChunk(BaseModel):
    id: str
    documentId: str
    unitId: str
    chunkIndex: int
    text: str
    embedding: List[float]


def create_chunks(chunks: List[StoredChunk]) -> None:
    with _lock:
        conn = get_db()
        conn.executemany(
            """INSERT INTO chunks (id, document_id, unit_id, chunk_index, text, embedding_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            [
                (
                    c.id,
                    c.documentId,
                    c.unitId,
                    c.chunkIndex,
                    c.text,
                    json.dumps(c.embedding),
                )
                for c in chunks
            ],
        )
        conn.commit()


class ChunkWithEmbedding(BaseModel):
    id: str
    documentId: str
    documentTitle: str
    text: str
    embedding: List[float]


def get_chunks_by_unit(unit_id: str) -> List[ChunkWithEmbedding]:
    rows = get_db().execute(
        """SELECT chunks.*, documents.title AS document_title
           FROM chunks JOIN documents ON documents.id = chunks.document_id
           WHERE chunks.unit_id = ?""",
        (unit_id,),
    ).fetchall()
    return [
        ChunkWithEmbedding(
            id=r["id"],
            documentId=r["document_id"],
            documentTitle=r["document_title"],
            text=r["text"],
            embedding=json.loads(r["embedding_json"]),
        )
        for r in rows
    ]


# --- reports ---


class StoredReport(BaseModel):
    id: str
    teacherId: str
    periodStart: str
    periodEnd: str
    recipientEmail: str
    content: WeeklyReportContent
    emailSent: bool
    createdAt: str


def create_report(report: StoredReport) -> None:
    with _lock:
        get_db().execute(
            """INSERT INTO reports
                 (id, teacher_id, period_start, period_end, recipient_email, content_json, email_sent, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                report.id,
                report.teacherId,
                report.periodStart,
                report.periodEnd,
                report.recipientEmail,
                report.content.model_dump_json(),
                1 if report.emailSent else 0,
                report.createdAt,
            ),
        )
        get_db().commit()


def _row_to_report(row: sqlite3.Row) -> StoredReport:
    return StoredReport(
        id=row["id"],
        teacherId=row["teacher_id"],
        periodStart=row["period_start"],
        periodEnd=row["period_end"],
        recipientEmail=row["recipient_email"],
        content=WeeklyReportContent.model_validate(json.loads(row["content_json"])),
        emailSent=row["email_sent"] == 1,
        createdAt=row["created_at"],
    )


def list_reports(teacher_id: Optional[str] = None) -> List[StoredReport]:
    if teacher_id:
        rows = get_db().execute(
            "SELECT * FROM reports WHERE teacher_id = ? ORDER BY created_at DESC", (teacher_id,)
        ).fetchall()
    else:
        rows = get_db().execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
    return [_row_to_report(r) for r in rows]


def get_latest_report(teacher_id: Optional[str] = None) -> Optional[StoredReport]:
    reports = list_reports(teacher_id)
    return reports[0] if reports else None


# --- feynman sessions ---


class StoredFeynmanSession(BaseModel):
    id: str
    unitId: str
    studentId: str
    topic: str
    attemptNumber: int
    explanationText: str
    evaluation: FeynmanEvaluation
    createdAt: str


def create_feynman_session(session: StoredFeynmanSession) -> None:
    with _lock:
        get_db().execute(
            """INSERT INTO feynman_sessions
                 (id, unit_id, student_id, topic, attempt_number, explanation_text, evaluation_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session.id,
                session.unitId,
                session.studentId,
                session.topic,
                session.attemptNumber,
                session.explanationText,
                session.evaluation.model_dump_json(),
                session.createdAt,
            ),
        )
        get_db().commit()


def _row_to_feynman_session(row: sqlite3.Row) -> StoredFeynmanSession:
    return StoredFeynmanSession(
        id=row["id"],
        unitId=row["unit_id"],
        studentId=row["student_id"],
        topic=row["topic"],
        attemptNumber=row["attempt_number"],
        explanationText=row["explanation_text"],
        evaluation=FeynmanEvaluation.model_validate(json.loads(row["evaluation_json"])),
        createdAt=row["created_at"],
    )


def get_feynman_sessions(unit_id: str, student_id: str, topic: str) -> List[StoredFeynmanSession]:
    rows = get_db().execute(
        """SELECT * FROM feynman_sessions
           WHERE unit_id = ? AND student_id = ? AND topic = ?
           ORDER BY attempt_number ASC""",
        (unit_id, student_id, topic),
    ).fetchall()
    return [_row_to_feynman_session(r) for r in rows]


# --- assignments ---


class StoredAssignment(BaseModel):
    id: str
    unitId: str
    topic: str
    plan: RemediationPlan
    studentIds: List[str]
    createdAt: str
    diagnosis: Optional[Diagnosis] = None
    reviewFeedback: Optional[str] = None
    revised: bool = False


def create_assignment(assignment: StoredAssignment) -> None:
    with _lock:
        get_db().execute(
            """INSERT INTO assignments
                 (id, unit_id, topic, plan_json, student_ids_json, created_at,
                  diagnosis_json, review_feedback, revised)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                assignment.id,
                assignment.unitId,
                assignment.topic,
                assignment.plan.model_dump_json(),
                json.dumps(assignment.studentIds),
                assignment.createdAt,
                assignment.diagnosis.model_dump_json() if assignment.diagnosis else None,
                assignment.reviewFeedback,
                1 if assignment.revised else 0,
            ),
        )
        get_db().commit()


def _row_to_assignment(row: sqlite3.Row) -> StoredAssignment:
    diagnosis_json = row["diagnosis_json"] if "diagnosis_json" in row.keys() else None
    return StoredAssignment(
        id=row["id"],
        unitId=row["unit_id"],
        topic=row["topic"],
        plan=RemediationPlan.model_validate(json.loads(row["plan_json"])),
        studentIds=json.loads(row["student_ids_json"]),
        createdAt=row["created_at"],
        diagnosis=Diagnosis.model_validate(json.loads(diagnosis_json)) if diagnosis_json else None,
        reviewFeedback=row["review_feedback"] if "review_feedback" in row.keys() else None,
        revised=bool(row["revised"]) if "revised" in row.keys() else False,
    )


def list_assignments_by_unit(unit_id: str) -> List[StoredAssignment]:
    rows = get_db().execute(
        "SELECT * FROM assignments WHERE unit_id = ? ORDER BY created_at DESC", (unit_id,)
    ).fetchall()
    return [_row_to_assignment(r) for r in rows]
