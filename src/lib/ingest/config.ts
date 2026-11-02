// The numbers that control ingesting a site. Change behaviour here.

/** Pages read at the same time. Each page is fetched, cleaned, chunked, embedded and stored. */
export const PAGE_CONCURRENCY = 4;

/** Most pages read per run (SRS FR-GEN-11: a run may fetch at most 40 pages). */
export const DEFAULT_MAX_PAGES = 40;

/** A page whose Markdown is shorter than this is a stub ("Redirecting...", an empty index). */
export const MIN_PAGE_CHARS = 200;
