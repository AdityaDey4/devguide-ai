import { z } from "zod";

// The grader's answer (SRS FR-CHAT-5). Every field is required (OpenAI strict mode), so "nothing
// missing" is an empty string.

export const GradeAnswer = z.object({
  verdict: z.enum(["GOOD", "PARTIAL", "BAD"]),
  /** What information the question needs that the excerpts do not have. Empty when GOOD. */
  missing: z.string(),
});

export type Grade = z.infer<typeof GradeAnswer>;
