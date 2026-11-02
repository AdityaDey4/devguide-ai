// The numbers that control discovery (SRS FR-GEN-3, FR-ING-1). Change behaviour here.

/** Longest list returned (FR-GEN-3). */
export const MAX_PAGES = 500;

/** llms.txt and sitemap.xml only count as "found" if they list at least this many pages. */
export const MIN_USEFUL_PAGES = 5;

// The link crawl (last resort).
export const CRAWL_MAX_DEPTH = 2; // start page = depth 0
export const CRAWL_MAX_PAGES = 100;

/** Pages fetched at the same time while crawling. */
export const CONCURRENCY = 4;

// A sitemap can point to other sitemaps. Limit how far we follow.
export const SITEMAP_MAX_DEPTH = 2;
export const SITEMAP_MAX_FILES = 10;
