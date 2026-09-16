import { NextRequest, NextResponse } from "next/server";
import { GenerateModuleRequestSchema } from "@/lib/schemas";
import { generateTopicModule } from "@/lib/gemini";
import { handleRouteError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = GenerateModuleRequestSchema.parse(await request.json());
    const topicModule = await generateTopicModule(body.rawText);
    return NextResponse.json({ module: topicModule });
  } catch (error) {
    return handleRouteError(error);
  }
}
