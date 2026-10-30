import { assertSafeUrl, safeLookup } from "../ssrfGuard";
import { createFetchPage } from "./createFetchPage";

// Fetches one page safely (SRS SEC-5, section 5 error handling):
//   10 s timeout per attempt, 2 MB cap (after decompression), max 3 redirects,
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
// createFetchPage.ts adds the retry around all of that.

export { createFetchPage } from "./createFetchPage";
export { FetchError } from "./errors";
export type { FetchErrorKind } from "./errors";
export type { FetchDeps, FetchedPage, FetchPageOptions } from "./types";

/**
 * The guarded fetcher. Always checks every hop and every connection against the SSRF guard.
 * (`createFetchPage(deps)` exists only so tests can use a local server; never use it in the app.)
 */
export const fetchPage = createFetchPage({ assertSafeUrl, lookup: safeLookup });
