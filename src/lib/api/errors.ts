import { NextResponse } from "next/server";

import type { ErrorDetails } from "@/lib/api/error-details";
import { AppError } from "@/lib/api/app-error";
import type { ErrorCategory } from "@/lib/api/error-codes";
import { createApiMeta } from "@/lib/api/response";
import { currentContext } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/sentry";

/**
 * Re-exported so every existing `import { AppError } from "@/lib/api/errors"`
 * keeps resolving. The class itself lives in a module free of `server-only`,
 * because this one is not — see app-error.ts for why that matters.
 */
export { AppError };

type ResolvedError = {
  /** Structured context when the code alone is too coarse. Null otherwise. */
  details: ErrorDetails | null;
  code: string;
  httpStatus: number;
  message: string;
  category: ErrorCategory;
  /** True when the error carried no classification of its own. */
  unexpected: boolean;
};

/**
 * The message returned for anything we did not classify.
 *
 * Deliberately fixed. The previous resolver fell through to `error.message`,
 * which meant an unhandled internal error returned its own text to the caller —
 * a stack-adjacent string, a database error, a filesystem path. Whatever the
 * cause, the caller learns only that it failed; the detail goes to the logs and
 * to Sentry, where it belongs.
 */
const OPAQUE_MESSAGE = "An unexpected error occurred.";

/**
 * Classify an error.
 *
 * NO MESSAGE MATCHING. This function used to decide HTTP status by inspecting
 * English text — `message.includes("invalid")` meant 422, `endsWith(" not
 * found.")` meant 404 — and then returned that same matched message to the
 * client. Three things were wrong with it:
 *
 *  - Rewording a message silently changed its status code.
 *  - Any message containing "invalid" was misclassified, including database
 *    errors like `invalid input syntax for type uuid`, which would have been
 *    echoed verbatim to an unauthenticated caller with a 422.
 *  - It was safe from that last one only because a PostgrestError is a plain
 *    object rather than an Error instance, so `error.message` was undefined.
 *    Safety by accident is not safety.
 *
 * Classification now comes from the code an AppError carries. Anything else is
 * unexpected by definition — which is the honest answer, and the one that gets
 * it reported rather than quietly shaped into a 4xx.
 */
export function resolveRouteError(error: unknown): ResolvedError {
  if (error instanceof AppError) {
    return {
      category: error.category,
      code: error.code,
      // Carried through rather than dropped here. The resolver is the only
      // thing between a throw site and the response, so anything it discards is
      // gone.
      details: error.details ?? null,
      httpStatus: error.httpStatus,
      message: error.message,
      unexpected: false,
    };
  }

  return {
    category: "unexpected",
    code: "INTERNAL_ERROR",
    // Nothing structured to say about an error we did not recognise, and
    // guessing would be worse than silence.
    details: null,
    httpStatus: 500,
    message: OPAQUE_MESSAGE,
    unexpected: true,
  };
}

/**
 * Turn an error into a response, and — the point of this slice — stop throwing
 * away why it happened.
 *
 * Before, a 500 returned INTERNAL_ERROR and the cause vanished. Diagnosing one
 * meant hand-instrumenting the route and reproducing the failure, which is time
 * spent recovering information the failing request already had.
 *
 * Three things happen now, in a fixed order:
 *
 *  1. Structured log, always. Even for expected errors, because a 403 that
 *     suddenly appears ten thousand times is a story the logs can tell.
 *  2. Sentry, if the category warrants it. Validation failures and denials do
 *     not; infrastructure and unexpected errors do. Alerting on the expected is
 *     how people learn to ignore alerts.
 *  3. The same sanitized response as before.
 *
 * The client contract is unchanged. Only our visibility is.
 */
export function routeErrorResponse(error: unknown, requestId: string) {
  const resolved = resolveRouteError(error);

  // Both observability calls are wrapped, and the wrapping is the point.
  //
  // reportError already swallows its own failures, and the logger writes to a
  // console that does not normally throw. Neither guarantee is enforced by
  // anything, and both live in modules this one does not own. A monitoring
  // failure turning a handled 404 into an unhandled 500 is the precise
  // inversion this slice exists to prevent, so the boundary asserts it rather
  // than trusting it.
  try {
    log[resolved.unexpected ? "error" : "warn"]({
      error,
      errorCode: resolved.code,
      event: resolved.unexpected ? "RequestFailedUnexpectedly" : "RequestRejected",
      httpStatus: resolved.httpStatus,
      // The category is the field an operator filters on to separate "the
      // system said no" from "the system broke".
      errorCategory: resolved.category,
      message: resolved.unexpected
        ? // The opaque message goes to the client; the real one goes here.
          error instanceof Error
          ? error.message
          : String(error)
        : resolved.message,
      requestId,
    });
  } catch {
    // Intentionally empty. Nothing above this can help, and the response below
    // is what the caller is waiting for.
  }

  try {
    reportError(error, {
      category: resolved.category,
      errorCode: resolved.code,
      requestId,
      userId: currentContext()?.userId,
    });
  } catch {
    // Intentionally empty. See above.
  }

  return NextResponse.json(
    {
      error: {
        code: resolved.code,
        details: resolved.details,
        message: resolved.message,
      },
      meta: createApiMeta(requestId),
    },
    { status: resolved.httpStatus },
  );
}
