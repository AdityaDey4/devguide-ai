import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ChatQuestion } from "./types";

// Reads questions.jsonl (one JSON question per line) and checks every line has the right shape.
//
//   loadChatQuestions("evals/chat/questions.jsonl") -> [{ id: "stored-01", group: "stored", ... }, ...]

const origin = z.enum(["guide", "stored_docs", "fetched_now", "not_found"]);

const line = z.object({
  id: z.string().min(1),
  technology: z.string().min(1),
  group: z.enum(["stored", "outside", "not_found"]),
  question: z.string().min(1),
  expected: z.array(origin).min(1),
  mentions: z.array(z.string().min(1)).min(1).optional(),
});

export function loadChatQuestions(path: string): ChatQuestion[] {
  const questions = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((text) => text.trim() !== "")
    .map((text, i) => {
      const parsed = line.safeParse(JSON.parse(text));
      if (!parsed.success) {
        throw new Error(`${path} line ${i + 1}: ${parsed.error.message}`);
      }
      return parsed.data;
    });

  const ids = questions.map((q) => q.id);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated) throw new Error(`${path}: id "${repeated}" appears twice`);
  return questions;
}
