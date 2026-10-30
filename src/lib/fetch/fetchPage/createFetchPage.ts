import { DEFAULTS } from "./config";
import { FetchError } from "./errors";
import { fetchOnce } from "./fetchOnce";
import type { FetchDeps, FetchedPage, FetchPageOptions } from "./types";

// Wraps fetchOnce() with the retry: one more attempt (with a short pause) for failures that
// are likely temporary, such as a timeout, a 503 or a dropped connection.

/** Builds a fetcher with the given dependencies. Production code uses `fetchPage` (index.ts). */
export function createFetchPage(deps: FetchDeps) {
  return async function fetchPage(
    url: string,
    overrides: FetchPageOptions = {},
  ): Promise<FetchedPage> {
    const options = { ...DEFAULTS, ...overrides };

    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchOnce(url, options, deps);
      } catch (error) {
        const canRetry =
          error instanceof FetchError &&
          error.retryable &&
          attempt < options.retries;
        if (!canRetry) throw error;

        // Exponential backoff with jitter; honour a short Retry-After if the server sent one.
        const backoff = 500 * 2 ** attempt + Math.random() * 250;
        await sleep(error.retryAfterMs ?? backoff, options.signal);
      }
    }
  };
}

/** Waits without using CPU (a timer), and stops early if the fetch is cancelled. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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
