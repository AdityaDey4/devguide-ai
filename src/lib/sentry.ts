import type * as Sentry from "@sentry/nextjs";

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

// Span attributes that carry the request URL. The dataCollection switches don't cover these,
// so they are scrubbed in beforeSendSpan (tests showed ?code=... reaching Sentry via http.target).
const QUERY_ATTRIBUTES = ["url.query", "http.query"];
const URL_ATTRIBUTES = ["http.target", "http.url", "url.full"];
const stripQuery = (url: string) => url.split(/[?#]/)[0];

// Shared Sentry options for the server, edge and browser SDKs.
// Privacy first: events carry stack traces and routes, not user content (SRS SEC-1, SEC-3).
export function sentryOptions(dsn: string | undefined): SentryOptions {
  return {
    // No DSN means the SDK stays disabled (local dev, CI).
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    beforeSendSpan(span) {
      const attributes = span.attributes;
      if (!attributes) return span;

      for (const key of QUERY_ATTRIBUTES) delete attributes[key];
      for (const key of URL_ATTRIBUTES) {
        const attribute: unknown = attributes[key];
        if (typeof attribute === "string") {
          attributes[key] = stripQuery(attribute);
        } else if (
          typeof attribute === "object" &&
          attribute !== null &&
          "value" in attribute &&
          typeof attribute.value === "string"
        ) {
          attribute.value = stripQuery(attribute.value);
        }
      }
      return span;
    },
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      // Auth callbacks carry ?code=..., and searches carry user text.
      urlQueryParams: false,
      // Prompts and model output may contain user questions and fetched documents.
      genAI: { inputs: false, outputs: false },
    },
  };
}
