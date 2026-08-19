/**
 * Server and edge runtime initialisation.
 *
 * Next calls register() once per runtime before any request is handled, which
 * is the only place early enough to catch an error thrown while a module is
 * still loading.
 */
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/observability/sentry";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(baseSentryOptions());
  }
}

/**
 * Errors Next catches itself — thrown in a Server Component, a layout, or
 * during streaming — never reach our route handlers, so `routeErrorResponse`
 * cannot see them. This is the only hook that does.
 *
 * The view tracker taught the lesson this closes: the system knew something was
 * wrong and had no way to say so.
 */
export const onRequestError = Sentry.captureRequestError;
