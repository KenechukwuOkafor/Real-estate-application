import * as Sentry from "@sentry/nextjs";

import {
  categoryForCode,
  type ErrorCategory,
  shouldAlert,
} from "@/lib/api/error-codes";
import { sanitizeEvent } from "@/lib/observability/sanitize";

/**
 * Sentry wiring, shared by the browser, the server and the edge runtime.
 *
 * Three rules shape everything here, and all three come from the brief:
 *
 *  - Sentry being unavailable must never fail a request. Every entry point is
 *    wrapped and swallows its own failure. An observability tool that can take
 *    the application down is worse than no observability tool.
 *  - Development never transmits. Local work is loud in the terminal instead;
 *    see the logger. Sending from a laptop pollutes the same issue stream an
 *    on-call engineer is meant to trust.
 *  - Nothing sensitive leaves. `beforeSend` runs the sanitizer over every event,
 *    which is the last gate before transmission rather than a convention
 *    observed at call sites.
 */

export function appEnvironment() {
  return process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development";
}

/**
 * The release, so an error can be tied to a deploy. ADR-026 requires it.
 *
 * Vercel injects the commit SHA; NEXT_PUBLIC_RELEASE is the escape hatch for
 * anywhere else. "unknown" is deliberate — a missing release should be visible
 * in Sentry rather than silently absent.
 */
export function appRelease() {
  return (
    process.env.NEXT_PUBLIC_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "unknown"
  );
}

/**
 * Environments permitted to transmit.
 *
 * An allow-list, not a deny-list. The previous gate was
 * `appEnvironment() !== "development"`, and appEnvironment() falls back to
 * NODE_ENV — which is "test" under vitest. A DSN in .env.local would therefore
 * have made the entire test suite transmit to the same issue stream an on-call
 * engineer is meant to trust. Anything not named here, including "test" and
 * unset, stays local and loud.
 */
const TRANSMITTING_ENVIRONMENTS = new Set(["preview", "production"]);

export function sentryEnabled() {
  return (
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    TRANSMITTING_ENVIRONMENTS.has(appEnvironment())
  );
}

export function baseSentryOptions() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: sentryEnabled(),
    environment: appEnvironment(),
    release: appRelease(),

    // Off. ADR-026 mentions performance, but tracing is a later slice and a
    // default sample rate silently bills for data nobody reads.
    tracesSampleRate: 0,

    // The SDK's own defaults would attach cookies and headers. We remove them
    // here as well as in beforeSend, so a mistake in one is not a disclosure.
    sendDefaultPii: false,

    beforeSend(event: unknown) {
      try {
        return sanitizeEvent(event as Record<string, unknown>);
      } catch {
        // A sanitizer that throws must drop the event, never pass it through
        // unredacted. Losing one report is strictly better than leaking.
        return null;
      }
    },

    beforeBreadcrumb(crumb: unknown) {
      try {
        const breadcrumb = crumb as { category?: string };

        // Console breadcrumbs replay our own logs back into the event, which
        // doubles the surface for disclosure and adds nothing: the logs are
        // already structured and already shipped.
        if (breadcrumb?.category === "console") {
          return null;
        }

        return crumb;
      } catch {
        return null;
      }
    },
  };
}

export type ReportContext = {
  requestId?: string;
  /**
   * What kind of alert this is, as a Sentry tag.
   *
   * The alert rules a human configures match on this, so an event without it
   * lands in Sentry and notifies nobody. "absence" for a signal that should be
   * arriving and is not; "view-unresolved" for a view that recorded nothing.
   */
  alertKind?: string;
  userId?: string;
  errorCode?: string;
  category?: ErrorCategory;
  route?: string;
  extra?: Record<string, unknown>;
};

/**
 * Report an error, if it is worth reporting.
 *
 * Categories decide. A validation failure or a 403 is the system working as
 * designed; sending those trains people to ignore Sentry, which is how the
 * genuinely broken thing gets missed. Infrastructure and unexpected errors go.
 *
 * Never throws.
 */
export function reportError(error: unknown, context: ReportContext = {}) {
  const category = context.category ?? categoryForCode(context.errorCode ?? "");

  if (!shouldAlert(category)) {
    return false;
  }

  return captureUnconditionally(error, context, category);
}

/**
 * Report regardless of category. For the absence alerts, which are not errors
 * in any request and have no code to classify.
 */
export function captureUnconditionally(
  error: unknown,
  context: ReportContext = {},
  category: ErrorCategory = "unexpected",
) {
  try {
    if (!sentryEnabled()) {
      return false;
    }

    Sentry.withScope((scope) => {
      scope.setTag("error.category", category);

      if (context.alertKind) scope.setTag("alert.kind", context.alertKind);
      if (context.errorCode) scope.setTag("error.code", context.errorCode);
      if (context.requestId) scope.setTag("request.id", context.requestId);
      if (context.route) scope.setTag("route", context.route);
      if (context.userId) scope.setUser({ id: context.userId });
      if (context.extra) scope.setExtras(context.extra);

      Sentry.captureException(error);
    });

    return true;
  } catch {
    // Swallowed on purpose. Reporting is best-effort and must never surface as
    // a request failure.
    return false;
  }
}

/**
 * Report a condition rather than a thrown error — used by the absence alerts,
 * where nothing threw and that is precisely the problem.
 */
export function captureMessage(
  message: string,
  context: ReportContext & { level?: "warning" | "error" } = {},
) {
  try {
    if (!sentryEnabled()) {
      return false;
    }

    Sentry.withScope((scope) => {
      scope.setLevel(context.level ?? "warning");
      scope.setTag("error.category", context.category ?? "infrastructure");

      if (context.alertKind) scope.setTag("alert.kind", context.alertKind);
      if (context.requestId) scope.setTag("request.id", context.requestId);
      if (context.extra) scope.setExtras(context.extra);

      Sentry.captureMessage(message);
    });

    return true;
  } catch {
    return false;
  }
}
