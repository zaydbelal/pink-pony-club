import { NextRequest, NextResponse } from "next/server";
import { getUnit, getSubmissionsByUnit } from "@/lib/db";
import { computeTopicStats } from "@/lib/weak-topics";
import { handleRouteError } from "@/lib/api-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const unit = getUnit(id);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const submissions = getSubmissionsByUnit(id);
    const topicStats = computeTopicStats(submissions);
    return NextResponse.json({ topicStats, submissionCount: submissions.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
