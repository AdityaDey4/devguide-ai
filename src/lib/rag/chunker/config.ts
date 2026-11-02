// The numbers that control chunking (SRS FR-KB-2). Change behaviour here.

/** A chunk is "full enough" at this size; a new top-level section then starts a new chunk. */
export const MIN_TOKENS = 500;

/** Chunks never grow beyond this, except for a code block kept whole (see below). */
export const MAX_TOKENS = 800;

/** About 15% of a typical chunk: how much text is repeated at the start of the next chunk. */
export const OVERLAP_TOKENS = 100;

/** A code block up to this size stays in one chunk, even above MAX_TOKENS. Longer ones are split. */
export const MAX_CODE_TOKENS = 2000;

/**
 * A small leftover (under MIN_TOKENS) may join the code block that follows it, up to this size,
 * instead of being left as a tiny chunk of its own.
 */
export const MERGE_MAX_TOKENS = 1200;

/** Tokens the blank line between two units adds. */
export const JOIN_TOKENS = 2;

/** Room kept free for the ``` lines when a long code block is split into pieces. */
export const FENCE_TOKENS = 20;
