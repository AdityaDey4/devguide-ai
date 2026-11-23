// The numbers of the chat's answer cache. Change behaviour here.

/** A cached question this similar (cosine, 1 = same meaning) or more counts as "the same question". */
export const MIN_SIMILARITY = 0.95;

/** Before saving, a cached question this similar means the answer is already there: skip. */
export const DUPLICATE_SIMILARITY = 0.98;

/** How long a saved answer is served. Docs change, so it is not kept for ever. */
export const TTL_DAYS = 14;

/** A longer question is neither looked up nor saved (it is probably not a plain question). */
export const MAX_QUESTION_CHARS = 500;
