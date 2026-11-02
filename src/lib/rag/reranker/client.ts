import OpenAI from "openai";
import { MAX_RETRIES, TIMEOUT_MS } from "./config";
import { RerankError } from "./errors";
import type { RerankDeps } from "./types";

// Talks to OpenAI: sends the messages and returns the model's JSON answer as text.
// Temporary errors (429, 5xx) are retried by the SDK with a growing pause.

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

/** The shape of the answer we require (structured output: the API enforces it). */
const ANSWER_SCHEMA = {
  name: "relevance_scores",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["scores"],
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["n", "score"],
          properties: { n: { type: "integer" }, score: { type: "integer" } },
        },
      },
    },
  },
} as const;

export const ask: RerankDeps["ask"] = async (settings, messages, signal) => {
  try {
    const response = await clientFor(settings.apiKey).chat.completions.create(
      {
        model: settings.model,
        messages,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: ANSWER_SCHEMA },
      },
      { signal },
    );
    return response.choices[0]?.message.content ?? "";
  } catch (error) {
    throw toRerankError(error);
  }
};

function toRerankError(error: unknown): RerankError {
  if (error instanceof RerankError) return error;
  if (error instanceof OpenAI.APIUserAbortError) {
    return new RerankError("The rerank request was cancelled", "aborted");
  }
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new RerankError(
    `OpenAI rerank request failed${status ? ` (HTTP ${status})` : ""}: ${message.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***")}`,
    "api",
  );
}
