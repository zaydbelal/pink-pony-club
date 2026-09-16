import path from "path";
import Database from "better-sqlite3";
import type { LectureNotes, PaperGrade, QuestionPaper, StudentAnswer, SyllabusInput, Unit, UnitStatus } from "./schemas";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(path.join(process.cwd(), "classpilot.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      syllabus_json TEXT NOT NULL,
      notes_json TEXT NOT NULL,
      paper_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

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
  `);
  return db;
}

interface UnitRow {
  id: string;
  status: string;
  syllabus_json: string;
  notes_json: string;
  paper_json: string;
  created_at: string;
}

function rowToUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    status: row.status as UnitStatus,
    syllabus: JSON.parse(row.syllabus_json) as SyllabusInput,
    notes: JSON.parse(row.notes_json) as LectureNotes,
    paper: JSON.parse(row.paper_json) as QuestionPaper,
    createdAt: row.created_at,
  };
}

export function createUnit(unit: Unit): void {
  getDb()
    .prepare(
      `INSERT INTO units (id, status, syllabus_json, notes_json, paper_json, created_at)
       VALUES (@id, @status, @syllabus_json, @notes_json, @paper_json, @created_at)`,
    )
    .run({
      id: unit.id,
      status: unit.status,
      syllabus_json: JSON.stringify(unit.syllabus),
      notes_json: JSON.stringify(unit.notes),
      paper_json: JSON.stringify(unit.paper),
      created_at: unit.createdAt,
    });
}

export function getUnit(id: string): Unit | undefined {
  const row = getDb().prepare(`SELECT * FROM units WHERE id = ?`).get(id) as UnitRow | undefined;
  return row ? rowToUnit(row) : undefined;
}

export function updateUnitContent(
  id: string,
  patch: { notes?: LectureNotes; paper?: QuestionPaper },
): Unit | undefined {
  const existing = getUnit(id);
  if (!existing) return undefined;

  const notes = patch.notes ?? existing.notes;
  const paper = patch.paper ?? existing.paper;
  getDb()
    .prepare(`UPDATE units SET notes_json = ?, paper_json = ? WHERE id = ?`)
    .run(JSON.stringify(notes), JSON.stringify(paper), id);
  return { ...existing, notes, paper };
}

export function publishUnit(id: string): Unit | undefined {
  const existing = getUnit(id);
  if (!existing) return undefined;
  getDb().prepare(`UPDATE units SET status = 'published' WHERE id = ?`).run(id);
  return { ...existing, status: "published" };
}

interface SubmissionRow {
  id: string;
  unit_id: string;
  student_id: string;
  answers_json: string;
  grade_json: string;
  created_at: string;
}

export interface StoredSubmission {
  id: string;
  unitId: string;
  studentId: string;
  answers: StudentAnswer[];
  grade: PaperGrade;
  createdAt: string;
}

function rowToSubmission(row: SubmissionRow): StoredSubmission {
  return {
    id: row.id,
    unitId: row.unit_id,
    studentId: row.student_id,
    answers: JSON.parse(row.answers_json) as StudentAnswer[],
    grade: JSON.parse(row.grade_json) as PaperGrade,
    createdAt: row.created_at,
  };
}

export function createSubmission(submission: StoredSubmission): void {
  getDb()
    .prepare(
      `INSERT INTO submissions (id, unit_id, student_id, answers_json, grade_json, created_at)
       VALUES (@id, @unit_id, @student_id, @answers_json, @grade_json, @created_at)`,
    )
    .run({
      id: submission.id,
      unit_id: submission.unitId,
      student_id: submission.studentId,
      answers_json: JSON.stringify(submission.answers),
      grade_json: JSON.stringify(submission.grade),
      created_at: submission.createdAt,
    });
}

export function getSubmissionsByStudent(studentId: string): StoredSubmission[] {
  const rows = getDb()
    .prepare(`SELECT * FROM submissions WHERE student_id = ? ORDER BY created_at ASC`)
    .all(studentId) as SubmissionRow[];
  return rows.map(rowToSubmission);
}

export function getSubmissionsByUnit(unitId: string): StoredSubmission[] {
  const rows = getDb()
    .prepare(`SELECT * FROM submissions WHERE unit_id = ? ORDER BY created_at ASC`)
    .all(unitId) as SubmissionRow[];
  return rows.map(rowToSubmission);
}
