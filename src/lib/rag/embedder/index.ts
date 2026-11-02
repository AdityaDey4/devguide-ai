import { createLimiter } from "../../limiter";
import { makeBatches } from "./batches";
import { requestBatch } from "./client";
import { CONCURRENCY, readSettings } from "./config";
import { EmbeddingError } from "./errors";
import type { EmbedDeps, EmbedOptions, EmbedResult } from "./types";

export { EmbeddingError } from "./errors";
export type { EmbeddingErrorKind } from "./errors";
export type { EmbedOptions, EmbedResult } from "./types";

// Turns texts into vectors (lists of 1,536 numbers) with OpenAI, for search by meaning.
//
//   const { embeddings, tokens } = await embedTexts(["How do I validate an email?", "..."]);
//   embeddings[0] -> [0.0123, -0.0456, ... 1,536 numbers]   (for the first text)
//
// Read this file first: it is the whole recipe. Node only: do not import it from client code.

export function createEmbedder(deps: EmbedDeps) {
  return async function embedTexts(
    texts: string[],
    options: EmbedOptions = {},
  ): Promise<EmbedResult> {
    if (texts.length === 0) return { embeddings: [], tokens: 0 };

    const settings = deps.settings(); //          1. which model, which key (fails early if missing)
    const batches = makeBatches(texts); //        2. groups of up to 100 texts (refuses bad texts)

    const limit = createLimiter(CONCURRENCY);
    const embeddings: number[][] = new Array(texts.length);
    let tokens = 0;

    await Promise.all(
      batches.map((batch) =>
        limit(async () => {
          // 3. send the batch (3 requests at a time)
          const result = await deps.requestBatch(
            settings,
            batch.texts,
            options.signal,
          );
          // 4. make sure the vectors are what the database expects
          checkVectors(result.vectors, batch.texts.length, settings.dimensions);
          // 5. put each vector back at the position of its text
          result.vectors.forEach(
            (vector, i) => (embeddings[batch.start + i] = vector),
          );
          tokens += result.tokens;
        }),
      ),
    );

    return { embeddings, tokens };
  };
}

function checkVectors(
  vectors: number[][],
  expectedCount: number,
  dimensions: number,
) {
  if (vectors.length !== expectedCount) {
    throw new EmbeddingError(
      `Sent ${expectedCount} texts but received ${vectors.length} vectors`,
      "api",
    );
  }
  const wrong = vectors.find((vector) => vector.length !== dimensions);
  if (wrong) {
    throw new EmbeddingError(
      `The model returned ${wrong.length} numbers per vector; the database expects ${dimensions}`,
      "dimension",
    );
  }
}

/** The real embedder: calls OpenAI with the key and model from the environment. */
export const embedTexts = createEmbedder({
  settings: readSettings,
  requestBatch,
});
