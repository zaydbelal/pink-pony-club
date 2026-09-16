import { NextRequest, NextResponse } from "next/server";
import { getSubmissionsByStudent } from "@/lib/db";
import { computeTopicStats } from "@/lib/weak-topics";
import { handleRouteError } from "@/lib/api-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const submissions = getSubmissionsByStudent(id);
    const topicStats = computeTopicStats(submissions);
    return NextResponse.json({ topicStats, submissionCount: submissions.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
