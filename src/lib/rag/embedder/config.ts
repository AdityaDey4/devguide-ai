import { serverSchema } from "../../env.schema";
import { EmbeddingError } from "./errors";
import type { EmbeddingSettings } from "./types";

// The numbers that control embedding. Change behaviour here.

/** Texts per request (SRS: at most 100). */
export const BATCH_SIZE = 100;

/** A request is also kept under this many tokens in total (the API allows 300,000). */
export const MAX_BATCH_TOKENS = 250_000;

/** The model refuses a single text longer than this. We refuse it first, without a request. */
export const MAX_INPUT_TOKENS = 8191;

/** Length of every vector. Must match the database column vector(1536). */
export const DIMENSIONS = 1536;

/** Requests in flight at the same time. */
export const CONCURRENCY = 3;

/** Per request: give up after this long, and retry temporary errors (429, 5xx) this many times. */
export const TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 3;

/**
 * The model and key come from the environment (EMBEDDING_MODEL, OPENAI_API_KEY).
 * Read at call time, from process.env directly, so this works in the app, in scripts and in tests.
 */
export function readSettings(): EmbeddingSettings {
  const parsed = serverSchema
    .pick({ OPENAI_API_KEY: true, EMBEDDING_MODEL: true })
    .safeParse(process.env);

  if (!parsed.success) {
    throw new EmbeddingError(
      "EMBEDDING_MODEL is not a valid model name",
      "config",
    );
  }
  const { OPENAI_API_KEY, EMBEDDING_MODEL } = parsed.data;
  if (!OPENAI_API_KEY) {
    throw new EmbeddingError(
      "OPENAI_API_KEY is required to create embeddings. Set it in .env.local.",
      "config",
    );
  }
  return {
    apiKey: OPENAI_API_KEY,
    model: EMBEDDING_MODEL,
    dimensions: DIMENSIONS,
  };
}
