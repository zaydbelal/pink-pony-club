import path from "path";
import Database from "better-sqlite3";
import type {
  LectureNotes,
  PaperGrade,
  QuestionPaper,
  StudentAnswer,
  SyllabusInput,
  Unit,
  UnitStatus,
  WeeklyReportContent,
  FeynmanEvaluation,
  RemediationPlan,
} from "./schemas";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(path.join(process.cwd(), "classpilot.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
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
  `);
  return db;
}

interface UnitRow {
  id: string;
  teacher_id: string;
  status: string;
  syllabus_json: string;
  notes_json: string;
  paper_json: string;
  created_at: string;
}

function rowToUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    teacherId: row.teacher_id,
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
      `INSERT INTO units (id, teacher_id, status, syllabus_json, notes_json, paper_json, created_at)
       VALUES (@id, @teacher_id, @status, @syllabus_json, @notes_json, @paper_json, @created_at)`,
    )
    .run({
      id: unit.id,
      teacher_id: unit.teacherId,
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

export function listUnits(teacherId?: string): Unit[] {
  const rows = teacherId
    ? (getDb()
        .prepare(`SELECT * FROM units WHERE teacher_id = ? ORDER BY created_at DESC`)
        .all(teacherId) as UnitRow[])
    : (getDb().prepare(`SELECT * FROM units ORDER BY created_at DESC`).all() as UnitRow[]);
  return rows.map(rowToUnit);
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

export function getSubmissionsSince(sinceIso: string): StoredSubmission[] {
  const rows = getDb()
    .prepare(`SELECT * FROM submissions WHERE created_at >= ? ORDER BY created_at ASC`)
    .all(sinceIso) as SubmissionRow[];
  return rows.map(rowToSubmission);
}

export interface StoredDocument {
  id: string;
  unitId: string;
  title: string;
  sourceText: string;
  createdAt: string;
}

export function createDocument(doc: StoredDocument): void {
  getDb()
    .prepare(
      `INSERT INTO documents (id, unit_id, title, source_text, created_at)
       VALUES (@id, @unit_id, @title, @source_text, @created_at)`,
    )
    .run({
      id: doc.id,
      unit_id: doc.unitId,
      title: doc.title,
      source_text: doc.sourceText,
      created_at: doc.createdAt,
    });
}

export interface StoredChunk {
  id: string;
  documentId: string;
  unitId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export function createChunks(chunks: StoredChunk[]): void {
  const insert = getDb().prepare(
    `INSERT INTO chunks (id, document_id, unit_id, chunk_index, text, embedding_json)
     VALUES (@id, @document_id, @unit_id, @chunk_index, @text, @embedding_json)`,
  );
  const insertMany = getDb().transaction((rows: StoredChunk[]) => {
    for (const chunk of rows) {
      insert.run({
        id: chunk.id,
        document_id: chunk.documentId,
        unit_id: chunk.unitId,
        chunk_index: chunk.chunkIndex,
        text: chunk.text,
        embedding_json: JSON.stringify(chunk.embedding),
      });
    }
  });
  insertMany(chunks);
}

interface ChunkRow {
  id: string;
  document_id: string;
  unit_id: string;
  chunk_index: number;
  text: string;
  embedding_json: string;
  document_title: string;
}

export interface ChunkWithEmbedding {
  id: string;
  documentId: string;
  documentTitle: string;
  text: string;
  embedding: number[];
}

export function getChunksByUnit(unitId: string): ChunkWithEmbedding[] {
  const rows = getDb()
    .prepare(
      `SELECT chunks.*, documents.title AS document_title
       FROM chunks JOIN documents ON documents.id = chunks.document_id
       WHERE chunks.unit_id = ?`,
    )
    .all(unitId) as ChunkRow[];
  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    text: row.text,
    embedding: JSON.parse(row.embedding_json) as number[],
  }));
}

export interface StoredReport {
  id: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  recipientEmail: string;
  content: WeeklyReportContent;
  emailSent: boolean;
  createdAt: string;
}

export function createReport(report: StoredReport): void {
  getDb()
    .prepare(
      `INSERT INTO reports (id, teacher_id, period_start, period_end, recipient_email, content_json, email_sent, created_at)
       VALUES (@id, @teacher_id, @period_start, @period_end, @recipient_email, @content_json, @email_sent, @created_at)`,
    )
    .run({
      id: report.id,
      teacher_id: report.teacherId,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      recipient_email: report.recipientEmail,
      content_json: JSON.stringify(report.content),
      email_sent: report.emailSent ? 1 : 0,
      created_at: report.createdAt,
    });
}

interface ReportRow {
  id: string;
  teacher_id: string;
  period_start: string;
  period_end: string;
  recipient_email: string;
  content_json: string;
  email_sent: number;
  created_at: string;
}

function rowToReport(row: ReportRow): StoredReport {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    recipientEmail: row.recipient_email,
    content: JSON.parse(row.content_json) as WeeklyReportContent,
    emailSent: row.email_sent === 1,
    createdAt: row.created_at,
  };
}

export function listReports(teacherId?: string): StoredReport[] {
  const rows = teacherId
    ? (getDb()
        .prepare(`SELECT * FROM reports WHERE teacher_id = ? ORDER BY created_at DESC`)
        .all(teacherId) as ReportRow[])
    : (getDb().prepare(`SELECT * FROM reports ORDER BY created_at DESC`).all() as ReportRow[]);
  return rows.map(rowToReport);
}

export function getLatestReport(teacherId?: string): StoredReport | undefined {
  return listReports(teacherId)[0];
}

export interface StoredFeynmanSession {
  id: string;
  unitId: string;
  studentId: string;
  topic: string;
  attemptNumber: number;
  explanationText: string;
  evaluation: FeynmanEvaluation;
  createdAt: string;
}

export function createFeynmanSession(session: StoredFeynmanSession): void {
  getDb()
    .prepare(
      `INSERT INTO feynman_sessions
         (id, unit_id, student_id, topic, attempt_number, explanation_text, evaluation_json, created_at)
       VALUES (@id, @unit_id, @student_id, @topic, @attempt_number, @explanation_text, @evaluation_json, @created_at)`,
    )
    .run({
      id: session.id,
      unit_id: session.unitId,
      student_id: session.studentId,
      topic: session.topic,
      attempt_number: session.attemptNumber,
      explanation_text: session.explanationText,
      evaluation_json: JSON.stringify(session.evaluation),
      created_at: session.createdAt,
    });
}

interface FeynmanSessionRow {
  id: string;
  unit_id: string;
  student_id: string;
  topic: string;
  attempt_number: number;
  explanation_text: string;
  evaluation_json: string;
  created_at: string;
}

function rowToFeynmanSession(row: FeynmanSessionRow): StoredFeynmanSession {
  return {
    id: row.id,
    unitId: row.unit_id,
    studentId: row.student_id,
    topic: row.topic,
    attemptNumber: row.attempt_number,
    explanationText: row.explanation_text,
    evaluation: JSON.parse(row.evaluation_json) as FeynmanEvaluation,
    createdAt: row.created_at,
  };
}

export function getFeynmanSessions(
  unitId: string,
  studentId: string,
  topic: string,
): StoredFeynmanSession[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM feynman_sessions
       WHERE unit_id = ? AND student_id = ? AND topic = ?
       ORDER BY attempt_number ASC`,
    )
    .all(unitId, studentId, topic) as FeynmanSessionRow[];
  return rows.map(rowToFeynmanSession);
}

export interface StoredAssignment {
  id: string;
  unitId: string;
  topic: string;
  plan: RemediationPlan;
  studentIds: string[];
  createdAt: string;
}

export function createAssignment(assignment: StoredAssignment): void {
  getDb()
    .prepare(
      `INSERT INTO assignments (id, unit_id, topic, plan_json, student_ids_json, created_at)
       VALUES (@id, @unit_id, @topic, @plan_json, @student_ids_json, @created_at)`,
    )
    .run({
      id: assignment.id,
      unit_id: assignment.unitId,
      topic: assignment.topic,
      plan_json: JSON.stringify(assignment.plan),
      student_ids_json: JSON.stringify(assignment.studentIds),
      created_at: assignment.createdAt,
    });
}

interface AssignmentRow {
  id: string;
  unit_id: string;
  topic: string;
  plan_json: string;
  student_ids_json: string;
  created_at: string;
}

function rowToAssignment(row: AssignmentRow): StoredAssignment {
  return {
    id: row.id,
    unitId: row.unit_id,
    topic: row.topic,
    plan: JSON.parse(row.plan_json) as RemediationPlan,
    studentIds: JSON.parse(row.student_ids_json) as string[],
    createdAt: row.created_at,
  };
}

export function listAssignmentsByUnit(unitId: string): StoredAssignment[] {
  const rows = getDb()
    .prepare(`SELECT * FROM assignments WHERE unit_id = ? ORDER BY created_at DESC`)
    .all(unitId) as AssignmentRow[];
  return rows.map(rowToAssignment);
}
