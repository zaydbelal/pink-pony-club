import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { CreateSubmissionRequestSchema } from "@/lib/schemas";
import { gradeSubmission } from "@/lib/gemini";
import { getUnit, createSubmission, type StoredSubmission } from "@/lib/db";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = CreateSubmissionRequestSchema.parse(await request.json());

    const unit = getUnit(body.unitId);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    if (unit.status !== "published") {
      return NextResponse.json({ error: "Unit is not published yet" }, { status: 403 });
    }

    const grade = await gradeSubmission(unit.paper, body.answers);

    const submission: StoredSubmission = {
      id: randomUUID(),
      unitId: body.unitId,
      studentId: body.studentId,
      answers: body.answers,
      grade,
      createdAt: new Date().toISOString(),
    };
    createSubmission(submission);

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
