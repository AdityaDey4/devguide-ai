import * as Sentry from "@sentry/nextjs";
import { serverSchema } from "@/lib/env.schema";
import { sentryOptions } from "@/lib/sentry";

// Runs once per server instance (Node.js and Edge runtimes). With no SENTRY_DSN the SDK
// stays disabled, so local development and CI need no Sentry account.
export function register() {
  // Only the DSN is validated here, so a missing Supabase key can't hide error reporting.
  const { SENTRY_DSN } = serverSchema
    .pick({ SENTRY_DSN: true })
    .parse(process.env);

  Sentry.init(sentryOptions(SENTRY_DSN));
}

// Reports errors from Server Components, route handlers and Server Actions.
export const onRequestError = Sentry.captureRequestError;
