import { NextRequest, NextResponse } from "next/server";
import { getUnit, updateUnitContent } from "@/lib/db";
import { retrieveRelevantChunks } from "@/lib/rag";
import { generateLectureNotes, generateQuestionPaper } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const unit = getUnit(id);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const query = `${unit.syllabus.subject} - ${unit.syllabus.unitTitle}: ${unit.syllabus.syllabusText}`;
    const retrieved = await retrieveRelevantChunks(id, query);
    const retrievedContext = retrieved.map((r) => r.text);

    const [notes, paper] = await Promise.all([
      generateLectureNotes(unit.syllabus, retrievedContext),
      generateQuestionPaper(unit.syllabus, unit.paper.questions.length, retrievedContext),
    ]);

    const updated = updateUnitContent(id, { notes, paper });
    return NextResponse.json({ unit: updated, retrievedChunks: retrieved.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
