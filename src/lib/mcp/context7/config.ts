// The numbers that control the Context7 lookup (docs/03-Architecture.md section 7.1).

export const ENDPOINT = "https://mcp.context7.com/mcp";

/** Each request to Context7 (connect, resolve, query) gives up after this long. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** The whole lookup (connect + resolve + query) gives up after this long. */
export const TOTAL_TIMEOUT_MS = 20_000;

/** At most this many snippets are used, so the prompt stays small (about 2,000 tokens). */
export const MAX_SNIPPETS = 4;

/** A snippet longer than this is cut. */
export const MAX_CHARS_PER_SNIPPET = 1800;
