import { NextRequest, NextResponse } from "next/server";
import { FollowUpRequestSchema } from "@/lib/schemas";
import { getSubmissionsByStudent, getUnit } from "@/lib/db";
import { computeTopicStats } from "@/lib/weak-topics";
import { generateFollowUpMaterial } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = FollowUpRequestSchema.parse(await request.json());

    const submissions = getSubmissionsByStudent(id);
    const topicStats = computeTopicStats(submissions);
    const stat = topicStats.find((t) => t.topic === body.topic);
    if (!stat) {
      return NextResponse.json(
        { error: "No graded submissions found for this topic yet" },
        { status: 404 },
      );
    }

    const subject =
      submissions
        .map((s) => getUnit(s.unitId))
        .find((unit) => unit?.paper.questions.some((q) => q.topic === body.topic))?.syllabus
        .subject ?? "General";

    const followUp = await generateFollowUpMaterial(subject, body.topic, stat.sampleMistakes);

    return NextResponse.json({ followUp, topicStats: stat });
  } catch (error) {
    return handleRouteError(error);
  }
}
