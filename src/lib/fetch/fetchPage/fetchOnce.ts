import { REDIRECT_STATUSES } from "./config";
import { decode, isTextual, parseContentType } from "./contentType";
import { FetchError, httpStatusError, toFetchError } from "./errors";
import { openRequest } from "./openRequest";
import { readBody } from "./readBody";
import { redirectTarget } from "./redirects";
import type { FetchDeps, FetchedPage, ResolvedOptions } from "./types";

// ONE attempt at fetching a page, following redirects. This is the main flow.
// The retry around it lives in createFetchPage.ts.

export async function fetchOnce(
  requestedUrl: string,
  options: ResolvedOptions,
  deps: FetchDeps,
): Promise<FetchedPage> {
  // One deadline for the whole attempt, redirects included.
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeoutSignal, options.signal])
    : timeoutSignal;

  try {
    const redirects: string[] = [];
    let current = requestedUrl;

    for (let hop = 0; ; hop++) {
      // 1. Is this URL safe? Checked on the first URL and on every redirect target.
      const { url } = await deps.assertSafeUrl(current);

      // 2. Send the request.
      const response = await openRequest(url, deps, signal);
      const status = response.statusCode ?? 0;

      // 3. A redirect: work out where it goes, then go round again.
      if (REDIRECT_STATUSES.has(status)) {
        response.destroy();
        const next = redirectTarget(response, url, hop, options.maxRedirects);
        redirects.push(url.href);
        current = next.href;
        continue;
      }

      // 4. Any other non-2xx status is an error (404, 503, ...).
      if (status < 200 || status >= 300) {
        response.destroy();
        throw httpStatusError(status, response.headers);
      }

      // 5. Only text-like content is accepted.
      const { mediaType, charset } = parseContentType(
        response.headers["content-type"],
      );
      if (mediaType && !isTextual(mediaType)) {
        response.destroy();
        throw new FetchError(
          `Unsupported content type: ${mediaType}`,
          "unsupported_content_type",
        );
      }

      // 6. Read the body (decompress, enforce the size cap) and hand it back.
      const buffer = await readBody(response, options.maxBytes, signal);
      return {
        requestedUrl,
        url: url.href,
        status,
        contentType: mediaType || "text/plain",
        body: decode(buffer, charset),
        bytes: buffer.length,
        redirects,
        fetchedAt: new Date(),
      };
    }
  } catch (error) {
    throw toFetchError(error, timeoutSignal, options.signal);
  }
}
