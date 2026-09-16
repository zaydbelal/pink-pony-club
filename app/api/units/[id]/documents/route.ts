import { NextRequest, NextResponse } from "next/server";
import { AddDocumentRequestSchema } from "@/lib/schemas";
import { getUnit } from "@/lib/db";
import { addDocumentToUnit } from "@/lib/rag";
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

    const body = AddDocumentRequestSchema.parse(await request.json());
    const result = await addDocumentToUnit(id, body.title, body.sourceText);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
