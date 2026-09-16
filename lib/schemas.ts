import { z } from "zod";

export const TopicModuleSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  keyFacts: z.array(z.string().min(1).max(500)).min(3).max(8),
});
export type TopicModule = z.infer<typeof TopicModuleSchema>;

export const GenerateModuleRequestSchema = z.object({
  rawText: z.string().min(1).max(4000),
});
export type GenerateModuleRequest = z.infer<typeof GenerateModuleRequestSchema>;

export const VerdictSchema = z.enum(["correct", "partial", "incorrect"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const TurnRecordSchema = z.object({
  avatarMessage: z.string().min(1).max(1000),
  employeeCorrection: z.string().min(1).max(2000),
  verdict: VerdictSchema,
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

export const TrapSchema = z.object({
  avatarMessage: z.string().min(1).max(1000),
  relatedFact: z.string().min(1).max(500),
  difficulty: DifficultySchema,
});
export type Trap = z.infer<typeof TrapSchema>;

export const GenerateTrapRequestSchema = z.object({
  module: TopicModuleSchema,
  history: z.array(TurnRecordSchema).max(50).default([]),
});
export type GenerateTrapRequest = z.infer<typeof GenerateTrapRequestSchema>;

export const GradeSchema = z.object({
  verdict: VerdictSchema,
  feedback: z.string().min(1).max(1000),
  scoreDelta: z.number(),
});
export type Grade = z.infer<typeof GradeSchema>;

export const GradeRequestSchema = z.object({
  module: TopicModuleSchema,
  trap: TrapSchema,
  employeeCorrection: z.string().min(1).max(2000),
});
export type GradeRequest = z.infer<typeof GradeRequestSchema>;
