import { NextRequest, NextResponse } from "next/server";
import { GradeRequestSchema } from "@/lib/schemas";
import { gradeCorrection } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = GradeRequestSchema.parse(await request.json());
    const grade = await gradeCorrection(body.module, body.trap, body.employeeCorrection);
    return NextResponse.json({ grade });
  } catch (error) {
    return handleRouteError(error);
  }
}
