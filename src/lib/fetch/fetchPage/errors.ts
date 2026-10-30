import type http from "node:http";
import { SsrfBlockedError } from "../ssrfGuard";
import {
  MAX_RETRY_AFTER_MS,
  RETRYABLE_NETWORK_CODES,
  RETRYABLE_STATUSES,
} from "./config";

// What can go wrong while fetching, and how raw errors are turned into one clear type.

export type FetchErrorKind =
  | "timeout"
  | "network"
  | "http_status"
  | "too_large"
  | "too_many_redirects"
  | "bad_redirect"
  | "unsupported_content_type"
  | "unsupported_encoding"
  | "aborted";

export class FetchError extends Error {
  readonly status?: number;
  /** True if trying again may help (timeouts, 503, dropped connection). */
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    readonly kind: FetchErrorKind,
    options: {
      status?: number;
      retryable?: boolean;
      retryAfterMs?: number;
    } = {},
  ) {
    super(message);
    this.name = "FetchError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** The error for a response with a status that is not 2xx. */
export function httpStatusError(
  status: number,
  headers: http.IncomingHttpHeaders,
): FetchError {
  const retryAfter = Number(headers["retry-after"]);
  return new FetchError(`HTTP ${status}`, "http_status", {
    status,
    retryable: RETRYABLE_STATUSES.has(status),
    retryAfterMs: Number.isFinite(retryAfter)
      ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
      : undefined,
  });
}

/** Turns whatever was thrown into a FetchError (or leaves a blocked-URL error as it is). */
export function toFetchError(
  error: unknown,
  timeoutSignal: AbortSignal,
  externalSignal: AbortSignal | undefined,
): Error {
  // Matched by name as well as class: if a bundler ever loads the guard module twice,
  // instanceof would fail and a blocked request would be reported as a plain network error.
  if (
    error instanceof FetchError ||
    error instanceof SsrfBlockedError ||
    (error instanceof Error && error.name === "SsrfBlockedError")
  ) {
    return error;
  }
  if (timeoutSignal.aborted) {
    return new FetchError("Request timed out", "timeout", { retryable: true });
  }
  if (externalSignal?.aborted)
    return new FetchError("Request was cancelled", "aborted");

  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return new FetchError(message, "network", {
    retryable: code !== undefined && RETRYABLE_NETWORK_CODES.has(code),
  });
}
