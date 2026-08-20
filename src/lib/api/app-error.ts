import type { ErrorDetails } from "@/lib/api/error-details";
import {
  categoryForCode,
  type ErrorCategory,
  httpStatusForCode,
} from "@/lib/api/error-codes";

/**
 * A classified application error.
 *
 * Deliberately in its own module, separate from `errors.ts`.
 *
 * `errors.ts` builds HTTP responses, so it imports the logger and the request
 * context — both of which are marked `server-only`. That is correct for them
 * and fatal for anything a client component can reach. `src/lib/env.ts` throws
 * one of these and is imported by `src/lib/db/supabase/browser.ts`, which is a
 * "use client" module, so an AppError living in `errors.ts` would pull
 * `server-only` into the browser bundle and fail the build.
 *
 * Nothing here imports anything but the registry, which is plain data. That is
 * what makes this module safe on both sides of the boundary.
 *
 * `errors.ts` re-exports this class, so `import { AppError } from
 * "@/lib/api/errors"` continues to resolve and no call site had to change.
 */
export class AppError extends Error {
  public readonly httpStatus: number;

  constructor(
    public readonly code: string,
    message: string,
    httpStatus?: number,
    /**
     * Structured context for the client, when the code alone is too coarse.
     *
     * VALIDATION_ERROR covers roughly twenty distinct field failures and
     * LISTING_STATE_TRANSITION_INVALID covers four situations, so the code says
     * what kind of thing went wrong and this says which one. Optional, because
     * most codes are specific enough on their own.
     */
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = "AppError";
    // The registry is the default so a code and its status cannot drift apart.
    // An explicit status is still accepted for the handful of call sites that
    // predate the registry.
    this.httpStatus = httpStatus ?? httpStatusForCode(code);
  }

  get category(): ErrorCategory {
    return categoryForCode(this.code);
  }
}
