import { serverSchema } from "../../env.schema";
import { RerankError } from "./errors";
import type { RerankSettings } from "./types";

// The numbers that control reranking (SRS FR-CHAT-3). Change behaviour here.

/** Chunks kept after reranking. */
export const TOP_K = 5;

/** More than this many candidates are cut before the model sees them (the retriever sends 40). */
export const MAX_CANDIDATES = 40;

/** A candidate longer than this is shortened for the model (about 400 tokens). */
export const MAX_CHARS_PER_CANDIDATE = 1500;

/** The model scores with whole numbers 0 to 10 (steadier than decimals); we divide by this. */
export const SCORE_SCALE = 10;

/** Per request: give up after this long, and retry temporary errors (429, 5xx) this many times. */
export const TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 2;

/**
 * The model and key come from the environment (RERANK_MODEL, OPENAI_API_KEY).
 * Read at call time, from process.env directly, so this works in the app, in scripts and in tests.
 */
export function readSettings(): RerankSettings {
  const parsed = serverSchema
    .pick({ OPENAI_API_KEY: true, RERANK_MODEL: true })
    .safeParse(process.env);

  if (!parsed.success) {
    throw new RerankError("RERANK_MODEL is not a valid model name", "config");
  }
  const { OPENAI_API_KEY, RERANK_MODEL } = parsed.data;
  if (!OPENAI_API_KEY) {
    throw new RerankError(
      "OPENAI_API_KEY is required to rerank. Set it in .env.local.",
      "config",
    );
  }
  return { apiKey: OPENAI_API_KEY, model: RERANK_MODEL };
}
