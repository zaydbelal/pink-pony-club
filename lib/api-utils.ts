import { ApiError } from "@google/genai";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request body", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return NextResponse.json(
        { error: "Rate limited by Gemini API, try again shortly" },
        { status: 429 },
      );
    }
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "Gemini API authentication failed" }, { status: 500 });
    }
    if (error.status >= 400 && error.status < 500) {
      return NextResponse.json({ error: `Bad request to Gemini: ${error.message}` }, { status: 400 });
    }
    return NextResponse.json({ error: `Gemini API error: ${error.message}` }, { status: 502 });
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
