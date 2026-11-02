import type http from "node:http";
import { FetchError } from "./errors";

/**
 * Where a redirect response sends us next. Throws if the redirect is not acceptable.
 * (The caller still runs the SSRF check on the returned URL before requesting it.)
 *
 *   hop = how many redirects were already followed.
 */
export function redirectTarget(
  response: http.IncomingMessage,
  from: URL,
  hop: number,
  maxRedirects: number,
): URL {
  if (hop >= maxRedirects) {
    throw new FetchError(
      `More than ${maxRedirects} redirects`,
      "too_many_redirects",
    );
  }

  const location = response.headers.location;
  if (!location) {
    throw new FetchError("Redirect without a Location header", "bad_redirect");
  }

  let next: URL;
  try {
    next = new URL(location, from); // Location may be relative
  } catch {
    throw new FetchError("Redirect to an invalid URL", "bad_redirect");
  }

  if (from.protocol === "https:" && next.protocol === "http:") {
    throw new FetchError("Redirect from https to http refused", "bad_redirect");
  }
  return next;
}
