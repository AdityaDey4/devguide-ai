import type { Ranked } from "../../rag/reranker";

// Where an answer came from (SRS FR-CHAT-8), so the person knows how far to trust it.
//
//   guide         the guide's own text
//   stored_docs   documentation we already had stored (official pages, Context7 snippets)
//   fetched_now   text found just now, outside the stored knowledge, while answering this question
//   not_found     nothing answered it
//
// It is worked out from the chunks the answer actually cited. If it cites text found just now,
// that is what the person should hear about; otherwise stored docs; otherwise the guide alone.

export type ChatOrigin = "guide" | "stored_docs" | "fetched_now" | "not_found";

/** Ids of chunks found just now start with this (set in mergeAndRerank); stored chunks have UUIDs. */
export const FRESH_PREFIX = "fresh:";

export const isFresh = (chunk: Ranked): boolean =>
  chunk.id.startsWith(FRESH_PREFIX);

/** The origin of an answer that was written from `used` (the chunks it cited). */
export function originOf(used: Ranked[]): ChatOrigin {
  if (used.some(isFresh)) return "fetched_now";
  if (used.some((chunk) => chunk.sourceType !== "guide")) return "stored_docs";
  return "guide";
}
