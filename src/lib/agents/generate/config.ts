// The numbers that control how a guide is checked and finished. Change behaviour here.

/**
 * Fewer pages than this from the docs start page means it was probably the wrong place (java: the
 * site root was a stub and only 1 page was found), so the official site's own address is tried too.
 */
export const MIN_DISCOVERED_PAGES = 5;

/** A failing section is rewritten at most this many times, then saved with a "needs review" flag (FR-GEN-7). */
export const MAX_REWRITES = 2;
