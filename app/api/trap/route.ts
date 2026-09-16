import { NextRequest, NextResponse } from "next/server";
import { GenerateTrapRequestSchema } from "@/lib/schemas";
import { generateTrap } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = GenerateTrapRequestSchema.parse(await request.json());
    const trap = await generateTrap(body.module, body.history);
    return NextResponse.json({ trap });
  } catch (error) {
    return handleRouteError(error);
  }
}
