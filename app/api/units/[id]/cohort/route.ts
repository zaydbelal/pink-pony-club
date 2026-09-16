import { NextRequest, NextResponse } from "next/server";
import { getUnit } from "@/lib/db";
import { getWeakCohort } from "@/lib/weak-topics";
import { handleRouteError } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const unit = getUnit(id);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const topic = request.nextUrl.searchParams.get("topic");
    if (!topic) {
      return NextResponse.json({ error: "topic query param is required" }, { status: 400 });
    }

    const cohort = getWeakCohort(id, topic);
    return NextResponse.json({ cohort });
  } catch (error) {
    return handleRouteError(error);
  }
}
