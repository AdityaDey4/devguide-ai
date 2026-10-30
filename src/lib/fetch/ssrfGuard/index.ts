// SSRF protection for the page fetcher (SRS SEC-5, AC-11).
//
// Fetched URLs come from the web, so they must never reach our own network
// (this machine, the database, the cloud metadata service, ...).
//
// Two layers, and both are needed:
//   1. assertSafeUrl  checks the URL and every address its hostname resolves to.
//   2. safeLookup     re-checks at connect time, which stops DNS rebinding.
//
// The two rules they share live in blockedAddresses.ts and blockedHostnames.ts.
// Node only (uses dns/net): do not import this from client code.

export { assertSafeUrl } from "./assertSafeUrl";
export { isBlockedAddress } from "./blockedAddresses";
export { SsrfBlockedError } from "./errors";
export type { SsrfReason } from "./errors";
export { safeLookup } from "./safeLookup";
