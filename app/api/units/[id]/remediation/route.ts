import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { GenerateRemediationRequestSchema } from "@/lib/schemas";
import { getUnit, getSubmissionsByUnit, createAssignment, listAssignmentsByUnit, type StoredAssignment } from "@/lib/db";
import { computeTopicStats } from "@/lib/weak-topics";
import { retrieveRelevantChunks } from "@/lib/rag";
import { generateRemediationPlan } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const unit = getUnit(id);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const body = GenerateRemediationRequestSchema.parse(await request.json());

    const cohortSubmissions = getSubmissionsByUnit(id).filter((s) =>
      body.studentIds.includes(s.studentId),
    );
    const stat = computeTopicStats(cohortSubmissions).find((t) => t.topic === body.topic);
    const sampleMistakes = stat?.sampleMistakes ?? [];

    const retrieved = await retrieveRelevantChunks(id, body.topic);

    const plan = await generateRemediationPlan(
      unit.syllabus.subject,
      body.topic,
      sampleMistakes,
      body.studentIds.length,
      retrieved.map((r) => r.text),
    );

    const assignment: StoredAssignment = {
      id: randomUUID(),
      unitId: id,
      topic: body.topic,
      plan,
      studentIds: body.studentIds,
      createdAt: new Date().toISOString(),
    };
    createAssignment(assignment);

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

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
    const assignments = listAssignmentsByUnit(id);
    return NextResponse.json({ assignments });
  } catch (error) {
    return handleRouteError(error);
  }
}
