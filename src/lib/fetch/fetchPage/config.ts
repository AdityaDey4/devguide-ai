// The numbers and lists that control how fetching behaves. Change behaviour here.

/** Used when the caller does not pass an option. */
export const DEFAULTS = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024, // 2 MB, counted after decompression
  maxRedirects: 3,
  retries: 1,
} as const;

export const USER_AGENT = "DevGuideAI-Fetcher/1.0";

export const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Failures that are worth one more try. A 404 or a blocked URL never is.
export const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
export const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
]);

/** A server's Retry-After header is honoured, but never longer than this. */
export const MAX_RETRY_AFTER_MS = 5_000;
