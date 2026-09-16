import { z } from "zod";

export const SyllabusInputSchema = z.object({
  subject: z.string(),
  unitTitle: z.string(),
  gradeLevel: z.string().optional(),
  syllabusText: z.string(),
});
export type SyllabusInput = z.infer<typeof SyllabusInputSchema>;

export const LectureNotesSchema = z.object({
  title: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      content: z.string(),
    }),
  ),
});
export type LectureNotes = z.infer<typeof LectureNotesSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["short_answer", "long_answer", "mcq"]),
  topic: z.string(),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  answerKey: z.string(),
  rubric: z.string(),
  points: z.number(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionPaperSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  questions: z.array(QuestionSchema),
});
export type QuestionPaper = z.infer<typeof QuestionPaperSchema>;

export const StudentAnswerSchema = z.object({
  questionId: z.string(),
  answer: z.string(),
});
export type StudentAnswer = z.infer<typeof StudentAnswerSchema>;

export const QuestionGradeSchema = z.object({
  questionId: z.string(),
  score: z.number(),
  maxScore: z.number(),
  feedback: z.string(),
});
export type QuestionGrade = z.infer<typeof QuestionGradeSchema>;

export const PaperGradeSchema = z.object({
  totalScore: z.number(),
  maxScore: z.number(),
  questionGrades: z.array(QuestionGradeSchema),
});
export type PaperGrade = z.infer<typeof PaperGradeSchema>;

export const HintRequestSchema = z.object({
  problem: z.string(),
  studentAttempt: z.string().optional(),
  hintsGivenSoFar: z.array(z.string()).default([]),
});
export type HintRequest = z.infer<typeof HintRequestSchema>;

export const HintResponseSchema = z.object({
  hint: z.string(),
  isFinalHint: z.boolean(),
});
export type HintResponse = z.infer<typeof HintResponseSchema>;

export type StudentQuestion = Omit<Question, "answerKey" | "rubric">;
export type StudentQuestionPaper = Omit<QuestionPaper, "questions"> & {
  questions: StudentQuestion[];
};

/** Strips the answer key and grading rubric so a paper is safe to send to students. */
export function toStudentPaper(paper: QuestionPaper): StudentQuestionPaper {
  return {
    ...paper,
    questions: paper.questions.map((question) => ({
      id: question.id,
      type: question.type,
      topic: question.topic,
      prompt: question.prompt,
      options: question.options,
      points: question.points,
    })),
  };
}

export const UnitStatusSchema = z.enum(["draft", "published"]);
export type UnitStatus = z.infer<typeof UnitStatusSchema>;

export const UnitSchema = z.object({
  id: z.string(),
  teacherId: z.string(),
  status: UnitStatusSchema,
  syllabus: SyllabusInputSchema,
  notes: LectureNotesSchema,
  paper: QuestionPaperSchema,
  createdAt: z.string(),
});
export type Unit = z.infer<typeof UnitSchema>;

export const CreateUnitRequestSchema = z.object({
  teacherId: z.string().min(1).default("demo-teacher"),
  syllabus: SyllabusInputSchema,
  numQuestions: z.number().int().min(1).max(30).optional(),
});
export type CreateUnitRequest = z.infer<typeof CreateUnitRequestSchema>;

export const PatchUnitRequestSchema = z.object({
  notes: LectureNotesSchema.optional(),
  paper: QuestionPaperSchema.optional(),
});
export type PatchUnitRequest = z.infer<typeof PatchUnitRequestSchema>;

export const CreateSubmissionRequestSchema = z.object({
  unitId: z.string(),
  studentId: z.string(),
  answers: z.array(StudentAnswerSchema),
});
export type CreateSubmissionRequest = z.infer<typeof CreateSubmissionRequestSchema>;

export const Submission = z.object({
  id: z.string(),
  unitId: z.string(),
  studentId: z.string(),
  answers: z.array(StudentAnswerSchema),
  grade: PaperGradeSchema,
  createdAt: z.string(),
});
export type Submission = z.infer<typeof Submission>;

export const TopicStatsSchema = z.object({
  topic: z.string(),
  correctCount: z.number(),
  partialCount: z.number(),
  incorrectCount: z.number(),
  scoredPoints: z.number(),
  maxPoints: z.number(),
  avgScorePct: z.number(),
  isWeak: z.boolean(),
  sampleMistakes: z.array(z.string()),
});
export type TopicStats = z.infer<typeof TopicStatsSchema>;

export const FollowUpRequestSchema = z.object({
  topic: z.string(),
});
export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;

export const FollowUpMaterialSchema = z.object({
  topic: z.string(),
  remedialNotes: z.string(),
  practiceQuestions: z.array(QuestionSchema).min(1),
});
export type FollowUpMaterial = z.infer<typeof FollowUpMaterialSchema>;

export const AddDocumentRequestSchema = z.object({
  title: z.string().min(1),
  sourceText: z.string().min(1),
});
export type AddDocumentRequest = z.infer<typeof AddDocumentRequestSchema>;

export const RetrievedChunkSchema = z.object({
  documentTitle: z.string(),
  text: z.string(),
  similarity: z.number(),
});
export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;

export const WeeklyReportContentSchema = z.object({
  subject: z.string(),
  headline: z.string(),
  classSummary: z.string(),
  studentsNeedingAttention: z.array(
    z.object({
      studentId: z.string(),
      reason: z.string(),
    }),
  ),
  recommendedActions: z.array(z.string()),
});
export type WeeklyReportContent = z.infer<typeof WeeklyReportContentSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  recipientEmail: z.string(),
  content: WeeklyReportContentSchema,
  emailSent: z.boolean(),
  createdAt: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

export const GenerateReportRequestSchema = z.object({
  teacherId: z.string().min(1).default("demo-teacher"),
  recipientEmail: z.string().default("teacher@example.com"),
  sinceDays: z.number().int().min(1).max(90).optional(),
});
export type GenerateReportRequest = z.infer<typeof GenerateReportRequestSchema>;
