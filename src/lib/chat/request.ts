import { z } from "zod";

// What the chat route accepts (POST /api/chat). The page keeps the conversation (M6), so it sends
// the earlier messages along with the new question.
//
//   { "slug": "zod", "question": "and a URL?",
//     "history": [{ "role": "user", "content": "How do I validate an email?" }, ...] }

export const MAX_BODY_CHARS = 60_000;
export const MAX_QUESTION_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 20; // only the last 6 are used; the rest is refused, not trimmed
const MAX_MESSAGE_CHARS = 8000;

export const ChatRequest = z.object({
  slug: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MAX_MESSAGE_CHARS),
      }),
    )
    .max(MAX_HISTORY_MESSAGES),
});

export type ChatRequestType = z.infer<typeof ChatRequest>;
