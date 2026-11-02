import { assertSafeUrl, safeLookup } from "../ssrfGuard";
import { DEFAULTS } from "./config";
import { fetchOnce } from "./fetchOnce";
import { retryDelay, shouldRetry, sleep } from "./retry";
import type { FetchDeps, FetchedPage, FetchPageOptions } from "./types";

// Fetches one page safely (SRS SEC-5, section 5 error handling):
//   10 s timeout per attempt, 5 MB cap (after decompression), max 3 redirects,
//   1 retry with backoff for transient failures. Numbers live in config.ts.
// Node only: do not import this from client code.
//
// How a fetch works (read fetchOnce.ts for the details):
//   1. assertSafeUrl   is the URL safe? (ssrfGuard, layer 1)
//   2. openRequest     send the request, connecting through safeLookup (layer 2)
//   3. redirects.ts    on a redirect, pick the next URL and start again at 1
//   4. status check    404, 503, ... become a FetchError
//   5. content type    only text-like pages are accepted
//   6. readBody        decompress and enforce the size cap
// The function below adds one retry around all of that; retry.ts holds the rules.

export { FetchError } from "./errors";
export type { FetchErrorKind } from "./errors";
export type { FetchDeps, FetchedPage, FetchPageOptions } from "./types";

/** The guard used in the app. Tests pass their own as the third argument of fetchPage. */
const realDeps: FetchDeps = { assertSafeUrl, lookup: safeLookup };

export async function fetchPage(
  url: string,
  overrides: FetchPageOptions = {},
  deps: FetchDeps = realDeps,
): Promise<FetchedPage> {
  const options = { ...DEFAULTS, ...overrides };

  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, options, deps);
    } catch (error) {
      if (!shouldRetry(error, attempt, options)) throw error;
      await sleep(retryDelay(error, attempt), options.signal);
    }
  }
}
