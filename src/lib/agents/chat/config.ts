// The numbers and fixed texts of the chat (SRS FR-CHAT-2, FR-CHAT-3). Change behaviour here.

/** How many of the latest messages the question is understood against. */
export const HISTORY_MESSAGES = 6;

/**
 * A chunk the reranker scores below this (0 to 1) is not used. If none is left the chat says it
 * does not know instead of letting the model guess from weak material.
 */
export const MIN_RELEVANCE = 0.3;

/** What the chat says when the stored material does not contain the answer. */
export const NOT_COVERED =
  "I couldn't find the answer to that in this guide or the stored documentation.";
