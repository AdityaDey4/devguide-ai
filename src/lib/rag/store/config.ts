import type { SourceType } from "./types";

// The numbers that control storing (SRS FR-KB-5). Change behaviour here.

/** After this many days a chunk stops being used in search. `null` = never expires. */
export const EXPIRY_DAYS: Record<SourceType, number | null> = {
  official: 90, // official docs pages
  context7: 30, // snippets from Context7
  guide: null, //  our own generated guides: replaced on a new version instead
};

/** Rows per insert. Each row carries a 1,536-number vector, so requests get big quickly. */
export const INSERT_BATCH_SIZE = 50;

/** Hashes per lookup (they travel in the URL, so keep them few). */
export const LOOKUP_BATCH_SIZE = 50;
