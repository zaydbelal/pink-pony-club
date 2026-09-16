import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FeynmanEvaluateRequestSchema } from "@/lib/schemas";
import { getUnit, getFeynmanSessions, createFeynmanSession, type StoredFeynmanSession } from "@/lib/db";
import { retrieveRelevantChunks } from "@/lib/rag";
import { evaluateFeynmanExplanation } from "@/lib/gemini";
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

    const body = FeynmanEvaluateRequestSchema.parse(await request.json());

    const relevantQuestions = unit.paper.questions.filter((q) => q.topic === body.topic);
    const notesText = unit.notes.sections.map((s) => `${s.heading}: ${s.content}`).join("\n\n");
    const questionFacts = relevantQuestions
      .map((q) => `Q: ${q.prompt}\nCorrect answer: ${q.answerKey}\nRubric: ${q.rubric}`)
      .join("\n\n");
    const retrieved = await retrieveRelevantChunks(id, body.topic);
    const groundingContext = [notesText, questionFacts, ...retrieved.map((r) => r.text)]
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!groundingContext.trim()) {
      return NextResponse.json(
        { error: "No grounding material found for this topic in the unit's notes, questions, or knowledge base" },
        { status: 400 },
      );
    }

    const priorSessions = getFeynmanSessions(id, body.studentId, body.topic);
    const priorAttempts = priorSessions.map((s) => ({
      attemptNumber: s.attemptNumber,
      clarityPct: s.evaluation.clarityPct,
      misconceptionStatement: s.evaluation.misconception?.statement ?? null,
    }));

    const evaluation = await evaluateFeynmanExplanation(
      unit.syllabus.subject,
      body.topic,
      groundingContext,
      body.explanationText,
      priorAttempts,
    );

    const session: StoredFeynmanSession = {
      id: randomUUID(),
      unitId: id,
      studentId: body.studentId,
      topic: body.topic,
      attemptNumber: priorSessions.length + 1,
      explanationText: body.explanationText,
      evaluation,
      createdAt: new Date().toISOString(),
    };
    createFeynmanSession(session);

    return NextResponse.json({ session, attemptHistory: [...priorSessions, session] }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const studentId = request.nextUrl.searchParams.get("studentId");
    const topic = request.nextUrl.searchParams.get("topic");
    if (!studentId || !topic) {
      return NextResponse.json({ error: "studentId and topic query params are required" }, { status: 400 });
    }
    const sessions = getFeynmanSessions(id, studentId, topic);
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleRouteError(error);
  }
}
