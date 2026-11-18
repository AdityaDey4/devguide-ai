// The numbers and fixed texts of the chat (SRS FR-CHAT-2, FR-CHAT-3, FR-CHAT-6). Change behaviour here.

/** How many of the latest messages the question is understood against. */
export const HISTORY_MESSAGES = 6;

/**
 * A chunk the reranker scores below this (0 to 1) is not used. If none is left the chat says it
 * does not know instead of letting the model guess from weak material.
 */
export const MIN_RELEVANCE = 0.3;

/** What the chat says when the stored material does not contain the answer. */
export const NOT_COVERED =
  "I couldn't find the answer to that in this guide or in the documentation I could look up.";

/** Live lookup in the official docs (FR-CHAT-6): how many pages are downloaded and read. */
export const LIVE_PAGES = 2;

/** The whole live lookup (search, download, clean) gives up after this long. */
export const LIVE_TIMEOUT_MS = 20_000;

/** A downloaded page is cut to this many characters before it is chunked (about 5,000 tokens). */
export const LIVE_MAX_CHARS = 20_000;

/**
 * The most chunks from outside the stored text that go to the reranker, which reads at most 40
 * candidates in all (the stored chunks kept so far come first).
 */
export const MAX_EXTERNAL_CHUNKS = 30;

/** What the chat says to a message that is not a question about the technology (see understand). */
export const DIRECT_REPLIES = {
  greeting: (name: string) =>
    `I'm here to help with ${name}. Ask me anything and I'll answer from its documentation.`,
  unclear: (name: string) =>
    `I didn't understand that. Try asking a question about ${name}, for example how to install it or how to use one of its features.`,
  other_topic: (name: string) =>
    `This chat is about ${name}, so I can't help with that here. Ask me something about ${name}.`,
} as const;
