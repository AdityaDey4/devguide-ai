import { z } from "zod";

// The shape of the model's answer. Every field is required (OpenAI strict mode).

export const UnderstandAnswer = z.object({
  /** The latest question, rewritten so it makes sense without the conversation. */
  standalone: z.string(),
  /** Two or three other ways to ask the same thing. */
  variants: z.array(z.string()),
});
