import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { CreateUnitRequestSchema, type Unit } from "@/lib/schemas";
import { generateLectureNotes, generateQuestionPaper } from "@/lib/gemini";
import { createUnit } from "@/lib/db";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = CreateUnitRequestSchema.parse(await request.json());

    const [notes, paper] = await Promise.all([
      generateLectureNotes(body.syllabus),
      generateQuestionPaper(body.syllabus, body.numQuestions),
    ]);

    const unit: Unit = {
      id: randomUUID(),
      status: "draft",
      syllabus: body.syllabus,
      notes,
      paper,
      createdAt: new Date().toISOString(),
    };
    createUnit(unit);

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
