import { NextRequest, NextResponse } from "next/server";
import { listReports } from "@/lib/db";
import { handleRouteError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const teacherId = request.nextUrl.searchParams.get("teacherId") ?? undefined;
    const reports = listReports(teacherId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleRouteError(error);
  }
}
