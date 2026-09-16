import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request body", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return NextResponse.json({ error: `Bad request to Claude: ${error.message}` }, { status: 400 });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: "Claude API authentication failed" }, { status: 500 });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: "Rate limited by Claude API, try again shortly" }, { status: 429 });
  }
  if (error instanceof Anthropic.APIError) {
    return NextResponse.json({ error: `Claude API error: ${error.message}` }, { status: 502 });
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
