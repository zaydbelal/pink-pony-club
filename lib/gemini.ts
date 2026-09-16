import { GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";
import {
  LectureNotesSchema,
  PaperGradeSchema,
  QuestionPaperSchema,
  HintResponseSchema,
  FollowUpMaterialSchema,
  WeeklyReportContentSchema,
  type SyllabusInput,
  type QuestionPaper,
  type StudentAnswer,
  type HintRequest,
  type TopicStats,
} from "./schemas";

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** Embeds a batch of texts, returning one vector per input in the same order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
  });
  const embeddings = response.embeddings;
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error("Gemini embedding response didn't match the number of inputs");
  }
  return embeddings.map((e) => {
    if (!e.values) throw new Error("Gemini returned an embedding with no values");
    return e.values;
  });
}

function formatRetrievedContext(chunks?: string[]): string {
  if (!chunks || chunks.length === 0) return "";
  return (
    "\n\nReference material retrieved from the teacher's knowledge base (use this as your " +
    "primary source where relevant, in addition to the syllabus above):\n" +
    chunks.map((c, i) => `--- excerpt ${i + 1} ---\n${c}`).join("\n\n")
  );
}

/** Gemini's responseJsonSchema only supports a subset of JSON Schema keywords - strip the rest. */
function toResponseJsonSchema(schema: ZodType) {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

async function generateStructured<T>(options: {
  schema: ZodType<T>;
  systemInstruction: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const response = await client.models.generateContent({
    model: MODEL,
    contents: options.prompt,
    config: {
      systemInstruction: options.systemInstruction,
      responseMimeType: "application/json",
      responseJsonSchema: toResponseJsonSchema(options.schema),
      maxOutputTokens: options.maxOutputTokens ?? 8000,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned output that wasn't valid JSON");
  }

  const result = options.schema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `Gemini returned output that didn't match the expected schema: ${result.error.message}`,
    );
  }
  return result.data;
}

export async function generateLectureNotes(input: SyllabusInput, retrievedContext?: string[]) {
  return generateStructured({
    schema: LectureNotesSchema,
    systemInstruction:
      "You are an experienced teacher writing lecture notes for a small tuition institution. " +
      "Write clear, well-organized notes a teacher can hand directly to students, broken into " +
      "logically ordered sections. Stay strictly within the given syllabus scope - do not invent " +
      "topics the syllabus doesn't cover.",
    prompt:
      `Subject: ${input.subject}\n` +
      `Unit: ${input.unitTitle}\n` +
      (input.gradeLevel ? `Grade level: ${input.gradeLevel}\n` : "") +
      `Syllabus:\n${input.syllabusText}\n\n` +
      "Generate the lecture notes for this unit." +
      formatRetrievedContext(retrievedContext),
    maxOutputTokens: 16000,
  });
}

export async function generateQuestionPaper(
  input: SyllabusInput,
  numQuestions = 6,
  retrievedContext?: string[],
) {
  return generateStructured({
    schema: QuestionPaperSchema,
    systemInstruction:
      "You are an experienced teacher writing an exam question paper for a small tuition " +
      "institution, strictly from the given syllabus. For every question, also produce an " +
      "internal answer key and a short grading rubric - these are for the teacher/grader only " +
      "and must never be shown to students. Mix question types where appropriate " +
      "(short_answer, long_answer, mcq) and give each question a point value. " +
      "Every question id must be unique. Every question must also have a short topic label " +
      "(2-5 words, e.g. 'fraction subtraction' or 'photosynthesis - light reactions') naming " +
      "the specific sub-topic it tests, granular enough to be useful for tracking which exact " +
      "sub-topics a student is weak in - do not just reuse the unit title as the topic.",
    prompt:
      `Subject: ${input.subject}\n` +
      `Unit: ${input.unitTitle}\n` +
      (input.gradeLevel ? `Grade level: ${input.gradeLevel}\n` : "") +
      `Syllabus:\n${input.syllabusText}\n\n` +
      `Generate a question paper with exactly ${numQuestions} questions covering this syllabus.` +
      formatRetrievedContext(retrievedContext),
    maxOutputTokens: 16000,
  });
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

  return generateStructured({
    schema: PaperGradeSchema,
    systemInstruction:
      "You are grading a student's exam submission against the teacher's answer key and rubric " +
      "for each question. Score fairly, giving partial credit per the rubric where the student's " +
      "reasoning is partially correct. Give concise, specific per-question feedback the student " +
      "will see. totalScore/maxScore must equal the sum of the per-question scores/maxScores.",
    prompt: `Grade this submission:\n${JSON.stringify(gradingInput, null, 2)}`,
    maxOutputTokens: 16000,
  });
}

export async function generateFollowUpMaterial(
  subject: string,
  topic: string,
  sampleMistakes: string[],
  retrievedContext?: string[],
) {
  return generateStructured({
    schema: FollowUpMaterialSchema,
    systemInstruction:
      "You are an experienced teacher writing targeted remedial material for a small group of " +
      "students who are struggling with one specific sub-topic, based on real feedback from " +
      "their graded submissions. Write short remedial notes (a few paragraphs, not a full " +
      "lecture) that directly address the pattern of mistakes shown, then write 2-4 new " +
      "practice questions targeting exactly this sub-topic, each with an answer key, rubric, " +
      "point value, and this same topic label. Do not repeat the mistakes verbatim - use them " +
      "only to diagnose what to re-teach. If reference material is provided, ground your " +
      "explanation in it rather than general knowledge.",
    prompt:
      `Subject: ${subject}\n` +
      `Weak topic: ${topic}\n` +
      `Sample grader feedback on recent mistakes in this topic:\n` +
      (sampleMistakes.length
        ? sampleMistakes.map((m, i) => `${i + 1}. ${m}`).join("\n")
        : "(no specific feedback available - write general remedial material for this topic)") +
      "\n\nGenerate the remedial notes and practice questions." +
      formatRetrievedContext(retrievedContext),
    maxOutputTokens: 8000,
  });
}

export async function generateWeeklyReportNarrative(
  periodStart: string,
  periodEnd: string,
  classTopicStats: TopicStats[],
  perStudentWeakTopics: { studentId: string; weakTopics: TopicStats[] }[],
) {
  return generateStructured({
    schema: WeeklyReportContentSchema,
    systemInstruction:
      "You are writing a weekly performance summary email for a tuition center teacher, based " +
      "on real aggregated grading data (not speculation). Be concrete and specific - name actual " +
      "topics and actual student ids from the data given, never invent ones. Keep the class " +
      "summary and headline actionable and brief; a busy teacher should be able to read this in " +
      "under a minute and know exactly what to re-teach and who needs help.",
    prompt:
      `Reporting period: ${periodStart} to ${periodEnd}\n\n` +
      `Class-wide topic performance (weakest first):\n${JSON.stringify(classTopicStats, null, 2)}\n\n` +
      `Per-student weak topics:\n${JSON.stringify(perStudentWeakTopics, null, 2)}\n\n` +
      "Write the weekly report.",
    maxOutputTokens: 8000,
  });
}

export async function generateHint(req: HintRequest) {
  const tier = req.hintsGivenSoFar.length;
  return generateStructured({
    schema: HintResponseSchema,
    systemInstruction:
      "You are a tutor giving a student a hint on a practice problem, one graduated step at a " +
      "time. Never give the full solution unless this is explicitly the final hint tier (tier 3, " +
      "0-indexed: the 4th hint). Each hint should be a small, useful nudge beyond the previous " +
      "ones, not a restatement.",
    prompt:
      `Problem: ${req.problem}\n` +
      (req.studentAttempt
        ? `Student's current attempt/progress: ${req.studentAttempt}\n`
        : "Student has not attempted yet.\n") +
      `Hints already given (in order): ${JSON.stringify(req.hintsGivenSoFar)}\n` +
      `This will be hint tier ${tier} (0-indexed). Give the next hint. ` +
      `Set isFinalHint to true only if tier >= 3.`,
    maxOutputTokens: 4000,
  });
}
