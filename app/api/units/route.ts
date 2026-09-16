import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { CreateUnitRequestSchema, toStudentPaper, type Unit } from "@/lib/schemas";
import { generateLectureNotes, generateQuestionPaper } from "@/lib/gemini";
import { createUnit, listUnits } from "@/lib/db";
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
      teacherId: body.teacherId,
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

export async function GET(request: NextRequest) {
  try {
    const teacherId = request.nextUrl.searchParams.get("teacherId") ?? undefined;
    const status = request.nextUrl.searchParams.get("status");

    let units = listUnits(teacherId);
    if (status === "published" || status === "draft") {
      units = units.filter((u) => u.status === status);
    }

    const isStudentView = request.nextUrl.searchParams.get("view") === "student";
    if (isStudentView) {
      units = units.filter((u) => u.status === "published");
      return NextResponse.json({
        units: units.map((u) => ({ ...u, paper: toStudentPaper(u.paper) })),
      });
    }

    return NextResponse.json({ units });
  } catch (error) {
    return handleRouteError(error);
  }
}
