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
      prompt: question.prompt,
      options: question.options,
      points: question.points,
    })),
  };
}
