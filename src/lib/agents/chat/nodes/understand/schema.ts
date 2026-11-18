import { z } from "zod";

// The shape of the model's answer. Every field is required (OpenAI strict mode).

/** What kind of message this is: only a "question" is searched for. */
export const INTENTS = [
  "question",
  "greeting",
  "unclear",
  "other_topic",
] as const;
export type Intent = (typeof INTENTS)[number];

export const UnderstandAnswer = z.object({
  /** question | greeting | unclear | other_topic (see the rules in prompt.ts). */
  intent: z.enum(INTENTS),
  /** The latest question, rewritten so it makes sense without the conversation. */
  standalone: z.string(),
  /** Two or three other ways to ask the same thing. */
  variants: z.array(z.string()),
});
