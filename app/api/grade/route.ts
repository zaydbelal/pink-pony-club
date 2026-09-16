import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { QuestionPaperSchema, StudentAnswerSchema } from "@/lib/schemas";
import { gradeSubmission } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

const RequestSchema = z.object({
  paper: QuestionPaperSchema,
  answers: z.array(StudentAnswerSchema),
});

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await request.json());
    const grade = await gradeSubmission(body.paper, body.answers);
    return NextResponse.json({ grade });
  } catch (error) {
    return handleRouteError(error);
  }
}
