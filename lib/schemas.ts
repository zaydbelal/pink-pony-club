/**
 * Shared TypeScript types for the API's JSON shapes.
 * Runtime validation now happens in the Python backend (backend/schemas.py);
 * these are plain type definitions kept in sync with it for the frontend.
 */

export interface SyllabusInput {
  subject: string;
  unitTitle: string;
  gradeLevel?: string;
  syllabusText: string;
}

export interface LectureNotes {
  title: string;
  sections: { heading: string; content: string }[];
}

export type QuestionType = "short_answer" | "long_answer" | "mcq";

export interface Question {
  id: string;
  type: QuestionType;
  topic: string;
  prompt: string;
  options?: string[];
  answerKey: string;
  rubric: string;
  points: number;
}

export interface QuestionPaper {
  title: string;
  instructions: string;
  questions: Question[];
}

export interface StudentAnswer {
  questionId: string;
  answer: string;
}

export interface QuestionGrade {
  questionId: string;
  score: number;
  maxScore: number;
  feedback: string;
}

export interface PaperGrade {
  totalScore: number;
  maxScore: number;
  questionGrades: QuestionGrade[];
}

export interface HintRequest {
  problem: string;
  studentAttempt?: string;
  hintsGivenSoFar: string[];
}

export interface HintResponse {
  hint: string;
  isFinalHint: boolean;
}

export type StudentQuestion = Omit<Question, "answerKey" | "rubric">;
export type StudentQuestionPaper = Omit<QuestionPaper, "questions"> & {
  questions: StudentQuestion[];
};

export type UnitStatus = "draft" | "published";

export interface Unit {
  id: string;
  teacherId: string;
  status: UnitStatus;
  syllabus: SyllabusInput;
  notes: LectureNotes;
  paper: QuestionPaper;
  createdAt: string;
}

export interface CreateUnitRequest {
  teacherId: string;
  syllabus: SyllabusInput;
  numQuestions?: number;
}

export interface PatchUnitRequest {
  notes?: LectureNotes;
  paper?: QuestionPaper;
}

export interface CreateSubmissionRequest {
  unitId: string;
  studentId: string;
  answers: StudentAnswer[];
}

export interface Submission {
  id: string;
  unitId: string;
  studentId: string;
  answers: StudentAnswer[];
  grade: PaperGrade;
  createdAt: string;
}

export interface TopicStats {
  topic: string;
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  scoredPoints: number;
  maxPoints: number;
  avgScorePct: number;
  isWeak: boolean;
  sampleMistakes: string[];
}

export interface FollowUpRequest {
  topic: string;
}

export interface FollowUpMaterial {
  topic: string;
  remedialNotes: string;
  practiceQuestions: Question[];
}

export interface AddDocumentRequest {
  title: string;
  sourceText: string;
}

export interface RetrievedChunk {
  documentTitle: string;
  text: string;
  similarity: number;
}

export interface WeeklyReportContent {
  subject: string;
  headline: string;
  classSummary: string;
  studentsNeedingAttention: { studentId: string; reason: string }[];
  recommendedActions: string[];
}

export interface Report {
  id: string;
  periodStart: string;
  periodEnd: string;
  recipientEmail: string;
  content: WeeklyReportContent;
  emailSent: boolean;
  createdAt: string;
}

export interface GenerateReportRequest {
  teacherId: string;
  recipientEmail: string;
  sinceDays?: number;
}

// --- Feynman Mode: student explains a topic back, AI scores clarity and finds gaps ---

export interface Misconception {
  statement: string;
  deficiency: string;
}

export interface FeynmanEvaluation {
  clarityPct: number;
  understoodConstructs: string[];
  needsClarity: string[];
  misconception: Misconception | null;
  nextGuidedPrompt: string;
}

export interface FeynmanEvaluateRequest {
  studentId: string;
  topic: string;
  explanationText: string;
}

export interface FeynmanSession {
  id: string;
  unitId: string;
  studentId: string;
  topic: string;
  attemptNumber: number;
  explanationText: string;
  evaluation: FeynmanEvaluation;
  createdAt: string;
}

// --- Teacher remediation: generate and dispatch a step-by-step plan to a weak cohort ---

export type RemediationStepKind =
  | "concept_recap"
  | "guided_questions"
  | "application_question"
  | "mastery_check";

export interface RemediationStep {
  order: number;
  kind: RemediationStepKind;
  title: string;
  description: string;
  estMinutes: number;
}

export interface RemediationPlan {
  topic: string;
  steps: RemediationStep[];
}

export interface CohortMember {
  studentId: string;
  avgScorePct: number;
}

export interface GenerateRemediationRequest {
  topic: string;
  studentIds: string[];
}

export interface Assignment {
  id: string;
  unitId: string;
  topic: string;
  plan: RemediationPlan;
  studentIds: string[];
  createdAt: string;
}
