@AGENTS.md
# EduManager AI — Hackathon Project Guidelines

## Stack & Environment
- **Framework**: Next.js 16 (App Router, Server Actions, Route Handlers), React 19, TypeScript 5.
- **SDK**: Google GenAI SDK (`@google/genai`), Zod 4 for schema enforcement and validation.
- **Model**: Gemini models via `@google/genai` (e.g., `gemini-2.5-flash` or default configured in `.env.example`).
- **Styling**: Modern CSS modules / Vanilla CSS / Tailwind (if added), responsive desktop & mobile.

## Project Scope & Domain
EduManager AI is an autonomous tutoring operations platform targeted at **Small Businesses** (independent coaching centers, tuition academies, vocational trainers) under the **Education + GenAI + Autonomous Workflows** vertical.

### Core Domain Flow
1. **Curriculum & Content**: Manager uploads/inputs syllabus -> generates structured lecture notes & exam papers (`/api/notes`, `/api/paper`).
2. **Evaluation & Remediation**: Ingests student submissions -> auto-grades with rubric (`/api/grade`), provides progressive hints (`/api/hint`).
3. **Analytics & Teacher Coaching (Target Feature)**: Aggregates student test performance to identify systemic topic weaknesses, frequent mistake patterns, and generates actionable, prioritized pedagogical recommendations for the teacher/manager.

## Architecture & Coding Standards
- **Strict Structured Outputs**: Always use `toResponseJsonSchema` and Zod schemas with `responseMimeType: "application/json"` for Gemini API calls to guarantee machine-readable payloads.
- **Type Safety**: Maintain end-to-end typing in `lib/schemas.ts`. Never use `any`.
- **Error Handling**: Use `handleRouteError` from `lib/api-utils.ts` in all API route handlers (`app/api/*`).
- **Separation of Concerns**:
  - LLM calls live in `lib/gemini.ts`.
  - Data contracts & Zod schemas live in `lib/schemas.ts`.
  - API routes in `app/api/` remain thin controllers that validate inputs and call `lib/gemini.ts`.