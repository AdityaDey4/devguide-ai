import { readFileSync } from "node:fs";
import { z } from "zod";
import type { EvalQuestion } from "./types";

// Reads retrieval.jsonl (one JSON question per line) and checks every line has the right shape.
//
//   loadQuestions("evals/retrieval.jsonl") -> [{ id: "zod-01", technology: "zod", ... }, ...]

const line = z.object({
  id: z.string().min(1),
  technology: z.string().min(1),
  question: z.string().min(1),
  expectedUrls: z.array(z.url()).min(1),
});

export function loadQuestions(path: string): EvalQuestion[] {
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
