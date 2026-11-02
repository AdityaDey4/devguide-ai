import { z } from "zod";
import { SCORE_SCALE } from "./config";
import { RerankError } from "./errors";

// Reads the model's answer and turns it into one relevance number per candidate.
//
//   '{"scores":[{"n":1,"score":9},{"n":2,"score":3}]}'  with 3 candidates
//     -> [0.9, 0.3, 0]        (candidate 3 was not scored: counts as 0)

const answer = z.object({
  scores: z.array(z.object({ n: z.number(), score: z.number() })),
});

export function parseScores(text: string, count: number): number[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RerankError("The reranker did not return valid JSON", "format");
  }
  const parsed = answer.safeParse(json);
  if (!parsed.success) {
    throw new RerankError(
      "The reranker's answer did not have the expected shape",
      "format",
    );
  }

  const relevance = new Array<number>(count).fill(0);
  for (const { n, score } of parsed.data.scores) {
    if (Number.isInteger(n) && n >= 1 && n <= count) {
      relevance[n - 1] =
        Math.min(Math.max(score, 0), SCORE_SCALE) / SCORE_SCALE;
    }
  }
  return relevance;
}
