import OpenAI from "openai";
import { MAX_RETRIES, TIMEOUT_MS } from "./config";
import { EmbeddingError } from "./errors";
import type { EmbedDeps, EmbeddingSettings } from "./types";

// Talks to OpenAI: sends ONE batch of texts and returns the vectors.
// Temporary errors (429 rate limit, 5xx) are retried by the SDK with a growing pause.

const clients = new Map<string, OpenAI>();

function clientFor(apiKey: string): OpenAI {
  let client = clients.get(apiKey);
  if (!client) {
    client = new OpenAI({
      apiKey,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
    clients.set(apiKey, client);
  }
  return client;
}

/** The request we send. Pure, so it can be checked without calling the API. */
export function buildRequestBody(settings: EmbeddingSettings, texts: string[]) {
  return {
    model: settings.model,
    input: texts,
    encoding_format: "float" as const,
    // text-embedding-3-* can shorten their vectors. This keeps a larger model at 1536 numbers,
    // which is what the database expects. (The older ada-002 is fixed at 1536 and has no option.)
    ...(settings.model.startsWith("text-embedding-3")
      ? { dimensions: settings.dimensions }
      : {}),
  };
}

export const requestBatch: EmbedDeps["requestBatch"] = async (
  settings,
  texts,
  signal,
) => {
  try {
    const response = await clientFor(settings.apiKey).embeddings.create(
      buildRequestBody(settings, texts),
      { signal },
    );
    // The API says which input each vector belongs to; do not rely on the order.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    return {
      vectors: ordered.map((item) => item.embedding),
      tokens: response.usage.total_tokens,
    };
  } catch (error) {
    throw toEmbeddingError(error);
  }
};

function toEmbeddingError(error: unknown): EmbeddingError {
  if (error instanceof EmbeddingError) return error;
  if (error instanceof OpenAI.APIUserAbortError) {
    return new EmbeddingError("The embedding request was cancelled", "aborted");
  }
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new EmbeddingError(
    `OpenAI embeddings request failed${status ? ` (HTTP ${status})` : ""}: ${redactKeys(message)}`,
    "api",
  );
}

/** Error messages can echo part of the API key. Never let that reach a log. */
function redactKeys(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");
}
