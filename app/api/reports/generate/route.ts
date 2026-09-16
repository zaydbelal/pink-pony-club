import { NextRequest, NextResponse } from "next/server";
import { GenerateReportRequestSchema } from "@/lib/schemas";
import { compileWeeklyReport } from "@/lib/reports";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = GenerateReportRequestSchema.parse(await request.json());
    const report = await compileWeeklyReport(body.teacherId, body.recipientEmail, body.sinceDays);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
