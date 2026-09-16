import { NextRequest, NextResponse } from "next/server";
import { HintRequestSchema } from "@/lib/schemas";
import { generateHint } from "@/lib/claude";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = HintRequestSchema.parse(await request.json());
    const hint = await generateHint(body);
    return NextResponse.json({ hint });
  } catch (error) {
    return handleRouteError(error);
  }
}
