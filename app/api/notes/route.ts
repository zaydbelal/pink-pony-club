import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SyllabusInputSchema } from "@/lib/schemas";
import { generateLectureNotes } from "@/lib/claude";
import { handleRouteError } from "@/lib/api-utils";

const RequestSchema = z.object({
  syllabus: SyllabusInputSchema,
});

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await request.json());
    const notes = await generateLectureNotes(body.syllabus);
    return NextResponse.json({ notes });
  } catch (error) {
    return handleRouteError(error);
  }
}
