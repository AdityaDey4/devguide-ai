import { countTokens } from "../chunker/tokens";
import { BATCH_SIZE, MAX_BATCH_TOKENS, MAX_INPUT_TOKENS } from "./config";
import { EmbeddingError } from "./errors";

// Groups texts into batches for the API, and refuses texts that cannot be embedded.
//
//   250 normal texts            -> 3 batches: 100, 100, 50
//   100 texts of 6,000 tokens   -> 3 batches: 41, 41, 18   (a batch stays under 250,000 tokens)
//   a text of 9,000 tokens      -> error, before anything is sent

export type Batch = {
  /** Index of the batch's first text in the original list (to put the vectors back in order). */
  start: number;
  texts: string[];
};

export function makeBatches(texts: string[]): Batch[] {
  const batches: Batch[] = [];
  let current: string[] = [];
  let start = 0;
  let tokens = 0;

  texts.forEach((text, index) => {
    if (text.trim() === "") {
      throw new EmbeddingError(
        `Text #${index} is empty and cannot be embedded`,
        "input",
      );
    }
    const size = countTokens(text);
    if (size > MAX_INPUT_TOKENS) {
      throw new EmbeddingError(
        `Text #${index} has ${size} tokens; the model accepts at most ${MAX_INPUT_TOKENS}`,
        "input",
      );
    }

    const full =
      current.length >= BATCH_SIZE || tokens + size > MAX_BATCH_TOKENS;
    if (current.length > 0 && full) {
      batches.push({ start, texts: current });
      current = [];
      start = index;
      tokens = 0;
    }
    current.push(text);
    tokens += size;
  });

  if (current.length > 0) batches.push({ start, texts: current });
  return batches;
}
