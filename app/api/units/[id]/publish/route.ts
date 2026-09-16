import { NextRequest, NextResponse } from "next/server";
import { publishUnit } from "@/lib/db";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const unit = publishUnit(id);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    return NextResponse.json({ unit });
  } catch (error) {
    return handleRouteError(error);
  }
}
