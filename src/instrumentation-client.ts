import * as Sentry from "@sentry/nextjs";
import { publicEnv } from "@/lib/env.client";
import { sentryOptions } from "@/lib/sentry";

// Browser error reporting. Disabled when NEXT_PUBLIC_SENTRY_DSN is not set.
Sentry.init(sentryOptions(publicEnv.NEXT_PUBLIC_SENTRY_DSN));

// Lets Sentry trace App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
