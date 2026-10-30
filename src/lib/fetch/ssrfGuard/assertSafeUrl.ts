import dns from "node:dns";
import { isIP } from "node:net";
import { isBlockedAddress } from "./blockedAddresses";
import { isBlockedHostname } from "./blockedHostnames";
import { blockedAddressError, SsrfBlockedError } from "./errors";

// LAYER 1: check a URL before fetching it. Throws SsrfBlockedError if it is not safe.
//
//   await assertSafeUrl("https://zod.dev/api")             -> ok
//   await assertSafeUrl("http://169.254.169.254/latest")   -> throws (metadata service)
//   await assertSafeUrl("http://localtest.me/")            -> throws (DNS says 127.0.0.1)
//
// Call it for the first URL and again for EVERY redirect hop.

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
// Docs sites use the default ports. Anything else (22, 6379, 5432, ...) is refused.
const ALLOWED_PORTS = new Set([80, 443]);

export async function assertSafeUrl(
  input: string | URL,
): Promise<{ url: URL; addresses: string[] }> {
  const url = parseUrl(input); //          1. is it a URL at all?
  checkProtocolLoginAndPort(url); //        2. http(s) only, no user:pass@, port 80/443
  const host = hostnameOf(url); //          3. the host, normalised

  if (isIP(host)) {
    // 4. An IP written straight into the URL skips DNS, so check it here.
    if (isBlockedAddress(host)) throw blockedAddressError(host);
    return { url, addresses: [host] };
  }

  if (isBlockedHostname(host)) {
    // 5. Names like "localhost" or "redis" are refused outright.
    throw new SsrfBlockedError(`Hostname ${host} is not allowed`, "hostname");
  }

  // 6. Look the name up and refuse if ANY address it points to is blocked
  //    (an attacker can mix a public and a private record).
  const addresses = await resolveHost(host);
  const bad = addresses.find(isBlockedAddress);
  if (bad) throw blockedAddressError(bad);
  return { url, addresses };
}

function parseUrl(input: string | URL): URL {
  try {
    return new URL(input);
  } catch {
    throw new SsrfBlockedError("Invalid URL", "protocol");
  }
}

function checkProtocolLoginAndPort(url: URL) {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfBlockedError(
      `Protocol ${url.protocol} is not allowed`,
      "protocol",
    );
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError(
      "URLs with credentials are not allowed",
      "credentials",
    );
  }

  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw new SsrfBlockedError(`Port ${port} is not allowed`, "port");
  }
}

/** The URL parser already turns 2130706433, 0x7f.1 and 017700000001 into 127.0.0.1. */
function hostnameOf(url: URL): string {
  // Remove IPv6 brackets and a trailing dot ("localhost.") before checking.
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

async function resolveHost(host: string): Promise<string[]> {
  let results: dns.LookupAddress[];
  try {
    results = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError(`Could not resolve ${host}`, "dns");
  }
  if (results.length === 0) {
    throw new SsrfBlockedError(`Could not resolve ${host}`, "dns");
  }
  return results.map((entry) => entry.address);
}
