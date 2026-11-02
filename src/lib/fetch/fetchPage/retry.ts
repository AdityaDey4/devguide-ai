import { FetchError } from "./errors";
import type { ResolvedOptions } from "./types";

// The retry rules: one more attempt (after a short pause) for failures likely to be temporary,
// such as a timeout, a 503 or a dropped connection. A 404 or a blocked URL is never retried.

/** Is another attempt worth it? `attempt` starts at 0 for the first try. */
export function shouldRetry(
  error: unknown,
  attempt: number,
  options: ResolvedOptions,
): error is FetchError {
  return (
    error instanceof FetchError && error.retryable && attempt < options.retries
  );
}

/** How long to wait: the server's Retry-After if it sent one, else exponential backoff with jitter. */
export function retryDelay(error: FetchError, attempt: number): number {
  return error.retryAfterMs ?? 500 * 2 ** attempt + Math.random() * 250;
}

/** Waits without using CPU (a timer), and stops early if the fetch is cancelled. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new FetchError("Request was cancelled", "aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new FetchError("Request was cancelled", "aborted"));
      },
      { once: true },
    );
  });
}
