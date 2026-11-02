// RULE 2: which host NAMES are off limits, whatever DNS says about them.
//
//   isBlockedHostname("localhost")                -> true
//   isBlockedHostname("redis")                    -> true   (no dot: only exists inside a network)
//   isBlockedHostname("metadata.google.internal") -> true
//   isBlockedHostname("zod.dev")                  -> false

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
];

export function isBlockedHostname(host: string): boolean {
  if (host === "localhost") return true;
  // Single-label names (redis, db, metadata) only exist on internal networks.
  if (!host.includes(".")) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
