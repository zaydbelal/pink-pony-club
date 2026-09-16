import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  LectureNotesSchema,
  PaperGradeSchema,
  QuestionPaperSchema,
  HintResponseSchema,
  type SyllabusInput,
  type QuestionPaper,
  type StudentAnswer,
  type HintRequest,
} from "./schemas";

const MODEL = "claude-opus-5";

const client = new Anthropic();

function required<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Claude returned output that didn't match the ${label} schema`);
  }
  return value;
}

export async function generateLectureNotes(input: SyllabusInput) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system:
      "You are an experienced teacher writing lecture notes for a small tuition institution. " +
      "Write clear, well-organized notes a teacher can hand directly to students, broken into " +
      "logically ordered sections. Stay strictly within the given syllabus scope - do not invent " +
      "topics the syllabus doesn't cover.",
    messages: [
      {
        role: "user",
        content:
          `Subject: ${input.subject}\n` +
          `Unit: ${input.unitTitle}\n` +
          (input.gradeLevel ? `Grade level: ${input.gradeLevel}\n` : "") +
          `Syllabus:\n${input.syllabusText}\n\n` +
          "Generate the lecture notes for this unit.",
      },
    ],
    output_config: { format: zodOutputFormat(LectureNotesSchema) },
  });
  return required(response.parsed_output, "LectureNotes");
}

export async function generateQuestionPaper(
  input: SyllabusInput,
  numQuestions = 6,
) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system:
      "You are an experienced teacher writing an exam question paper for a small tuition " +
      "institution, strictly from the given syllabus. For every question, also produce an " +
      "internal answer key and a short grading rubric - these are for the teacher/grader only " +
      "and must never be shown to students. Mix question types where appropriate " +
      "(short_answer, long_answer, mcq) and give each question a point value. " +
      "Every question id must be unique.",
    messages: [
      {
        role: "user",
        content:
          `Subject: ${input.subject}\n` +
          `Unit: ${input.unitTitle}\n` +
          (input.gradeLevel ? `Grade level: ${input.gradeLevel}\n` : "") +
          `Syllabus:\n${input.syllabusText}\n\n` +
          `Generate a question paper with exactly ${numQuestions} questions covering this syllabus.`,
      },
    ],
    output_config: { format: zodOutputFormat(QuestionPaperSchema) },
  });
  return required(response.parsed_output, "QuestionPaper");
}

export async function gradeSubmission(
  paper: QuestionPaper,
  answers: StudentAnswer[],
) {
  const answerById = new Map(answers.map((a) => [a.questionId, a.answer]));
  const gradingInput = paper.questions.map((q) => ({
    questionId: q.id,
    prompt: q.prompt,
    answerKey: q.answerKey,
    rubric: q.rubric,
    maxScore: q.points,
    studentAnswer: answerById.get(q.id) ?? "(no answer submitted)",
  }));

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system:
      "You are grading a student's exam submission against the teacher's answer key and rubric " +
      "for each question. Score fairly, giving partial credit per the rubric where the student's " +
      "reasoning is partially correct. Give concise, specific per-question feedback the student " +
      "will see. totalScore/maxScore must equal the sum of the per-question scores/maxScores.",
    messages: [
      {
        role: "user",
        content: `Grade this submission:\n${JSON.stringify(gradingInput, null, 2)}`,
      },
    ],
    output_config: { format: zodOutputFormat(PaperGradeSchema) },
  });
  return required(response.parsed_output, "PaperGrade");
}

export async function generateHint(req: HintRequest) {
  const tier = req.hintsGivenSoFar.length;
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system:
      "You are a tutor giving a student a hint on a practice problem, one graduated step at a " +
      "time. Never give the full solution unless this is explicitly the final hint tier (tier 3, " +
      "0-indexed: the 4th hint). Each hint should be a small, useful nudge beyond the previous " +
      "ones, not a restatement.",
    messages: [
      {
        role: "user",
        content:
          `Problem: ${req.problem}\n` +
          (req.studentAttempt
            ? `Student's current attempt/progress: ${req.studentAttempt}\n`
            : "Student has not attempted yet.\n") +
          `Hints already given (in order): ${JSON.stringify(req.hintsGivenSoFar)}\n` +
          `This will be hint tier ${tier} (0-indexed). Give the next hint. ` +
          `Set isFinalHint to true only if tier >= 3.`,
      },
    ],
    output_config: { format: zodOutputFormat(HintResponseSchema) },
  });
  return required(response.parsed_output, "HintResponse");
}
