// The numbers that control retrieval (SRS FR-CHAT-2, FR-CHAT-3). Change behaviour here.

/** Rewrites of the question that are searched (the question itself counts as one). */
export const MAX_VARIANTS = 3;

/** Results asked from each search (vector top 20 and keyword top 20 are merged inside it). */
export const MATCH_COUNT = 20;

/** Candidates handed to the reranker after the variants are merged (Architecture section 6). */
export const MAX_CANDIDATES = 40;
