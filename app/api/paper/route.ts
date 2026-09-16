import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SyllabusInputSchema } from "@/lib/schemas";
import { generateQuestionPaper } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

const RequestSchema = z.object({
  syllabus: SyllabusInputSchema,
  numQuestions: z.number().int().min(1).max(30).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await request.json());
    const paper = await generateQuestionPaper(body.syllabus, body.numQuestions);
    return NextResponse.json({ paper });
  } catch (error) {
    return handleRouteError(error);
  }
}
