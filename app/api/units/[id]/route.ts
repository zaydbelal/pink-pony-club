import { NextRequest, NextResponse } from "next/server";
import { PatchUnitRequestSchema, toStudentPaper } from "@/lib/schemas";
import { getUnit, updateUnitContent } from "@/lib/db";
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

    const isStudentView = request.nextUrl.searchParams.get("view") === "student";
    if (isStudentView) {
      if (unit.status !== "published") {
        return NextResponse.json({ error: "Unit is not published yet" }, { status: 403 });
      }
      return NextResponse.json({ unit: { ...unit, paper: toStudentPaper(unit.paper) } });
    }

    return NextResponse.json({ unit });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PatchUnitRequestSchema.parse(await request.json());
    const unit = updateUnitContent(id, body);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    return NextResponse.json({ unit });
  } catch (error) {
    return handleRouteError(error);
  }
}
