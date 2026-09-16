import { ApiError, GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";
import {
  TopicModuleSchema,
  TrapSchema,
  GradeSchema,
  type TopicModule,
  type TurnRecord,
  type Trap,
} from "./schemas";

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

let cachedClient: GoogleGenAI | null = null;

/** Lazily builds the client so a missing key fails with a clear message at call time, not a cryptic Google Cloud ADC error. */
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment (see .env.example) before calling the Gemini API.",
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/** Gemini's responseJsonSchema only supports a subset of JSON Schema keywords - strip the rest. */
function toResponseJsonSchema(schema: ZodType) {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** Retries once on rate limits, server errors, and the flaky-but-transient shapes of a bad generation. */
function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 429 || error.status >= 500;
  }
  return (
    error instanceof Error &&
    (error.message === "Gemini returned an empty response" ||
      error.message === "Gemini returned output that wasn't valid JSON" ||
      error.message.startsWith("Gemini returned output that didn't match the expected schema"))
  );
}

async function generateStructuredOnce<T>(options: {
  schema: ZodType<T>;
  systemInstruction: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const response = await getClient().models.generateContent({
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

async function generateStructured<T>(options: {
  schema: ZodType<T>;
  systemInstruction: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<T> {
  try {
    return await generateStructuredOnce(options);
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }
    return await generateStructuredOnce(options);
  }
}

export async function generateTopicModule(rawText: string) {
  return generateStructured({
    schema: TopicModuleSchema,
    systemInstruction:
      "You turn a piece of raw company text (a policy paragraph, an onboarding excerpt, a " +
      "procedure) into a training topic module for an employee-teaches-the-AI exercise. " +
      "Extract a short title, a one-paragraph summary, and a list of key facts - the specific, " +
      "checkable rules an employee must get right about this topic. Stay strictly within what " +
      "the source text says; do not invent facts it doesn't support. Produce at least 3 and at " +
      "most 8 key facts, each a single self-contained statement.",
    prompt: `Raw company text:\n${rawText}\n\nGenerate the topic module.`,
    maxOutputTokens: 8000,
  });
}

export async function generateTrap(topicModule: TopicModule, history: TurnRecord[]) {
  const correctCount = history.filter((h) => h.verdict === "correct").length;
  const incorrectCount = history.filter((h) => h.verdict === "incorrect").length;

  return generateStructured({
    schema: TrapSchema,
    systemInstruction:
      "You are a naive, eager AI avatar (a new hire) being taught this topic by an employee. " +
      "After hearing the employee's explanation, you respond with ONE plausible but incorrect " +
      "misconception about the topic - a realistic mistake someone new might make, not an " +
      "absurd or obviously wrong one. Ground every misconception in one of the module's key " +
      "facts (set relatedFact to that fact, verbatim or near-verbatim). Do not repeat a " +
      "misconception already covered in the conversation history. Adapt difficulty to how the " +
      "employee has been doing so far: raise difficulty after consecutive correct corrections, " +
      "lower it after incorrect ones, and pick a fact not yet covered when possible.",
    prompt:
      `Topic module: ${topicModule.title}\n` +
      `Summary: ${topicModule.summary}\n` +
      `Key facts:\n${topicModule.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n` +
      `Conversation so far (${history.length} turns, ${correctCount} correct, ${incorrectCount} incorrect):\n` +
      (history.length
        ? history
            .map(
              (h, i) =>
                `${i + 1}. Avatar said: "${h.avatarMessage}" -> Employee corrected: ` +
                `"${h.employeeCorrection}" -> Verdict: ${h.verdict}`,
            )
            .join("\n")
        : "(none yet - this is the first misconception)") +
      "\n\nGenerate the next misconception the avatar raises.",
    maxOutputTokens: 4000,
  });
}

export async function gradeCorrection(
  topicModule: TopicModule,
  trap: Trap,
  employeeCorrection: string,
) {
  return generateStructured({
    schema: GradeSchema,
    systemInstruction:
      "You are grading whether an employee correctly caught and fixed the AI avatar's " +
      "misconception. Judge against the module's key facts, in particular the fact the " +
      "misconception targeted. correct = fully and clearly corrects the misconception; " +
      "partial = catches the error but is vague, incomplete, or slightly imprecise; " +
      "incorrect = misses the error, agrees with the misconception, or is off-topic. " +
      "scoreDelta should be +10 for correct, +3 for partial, -5 for incorrect. Feedback should " +
      "be concise and specific, addressed directly to the employee.",
    prompt:
      `Topic module: ${topicModule.title}\n` +
      `Key facts:\n${topicModule.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n` +
      `Avatar's misconception: "${trap.avatarMessage}"\n` +
      `Fact this misconception targets: "${trap.relatedFact}"\n` +
      `Employee's correction: "${employeeCorrection}"\n\n` +
      "Grade this correction.",
    maxOutputTokens: 2000,
  });
}
