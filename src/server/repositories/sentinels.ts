import "server-only";

import { AppError } from "@/lib/api/errors";

/**
 * Turn a raised database sentinel into the AppError it stands for.
 *
 * The SECURITY DEFINER functions in 0015, 0020, 0022 and 0030 raise code-shaped
 * strings — LISTING_NOT_FOUND, INSPECTION_COMPLETION_WINDOW_CLOSED — with
 * SQLSTATEs alongside. That is the function's API, not prose: the sentinel is
 * an identifier and the SQLSTATE is its class, so matching on it is not the
 * message-text classification this codebase removed. Matching on a HUMAN
 * sentence would be.
 *
 * Without this the sentinel arrives as an unrecognised Postgres error and
 * resolves to INTERNAL_ERROR, which tells a caller that a race they lost was
 * our fault and pages someone for a 404.
 *
 * This lives here rather than beside the listing repository because 0030 gave
 * the inspection repository the same need, and a second copy of the table is
 * how the two drift: the copy that is not updated silently starts reporting
 * INTERNAL_ERROR for a refusal the database stated perfectly clearly.
 */
const SENTINELS: Array<[string, string, string]> = [
  ["LISTING_IMAGE_NOT_FOUND", "LISTING_IMAGE_NOT_FOUND", "Image not found on this listing."],
  ["LISTING_NOT_FOUND", "LISTING_NOT_FOUND", "Listing not found."],
  [
    "LISTING_STATE_TRANSITION_INVALID",
    "LISTING_STATE_TRANSITION_INVALID",
    "The listing changed state before this could be applied.",
  ],
  ["LISTING_ARCHIVED_IS_TERMINAL", "LISTING_STATE_TRANSITION_INVALID", "An archived listing cannot be changed."],
  [
    "LISTING_REVISION_ALREADY_PENDING",
    "LISTING_REVISION_ALREADY_PENDING",
    "This listing already has a change awaiting review.",
  ],
  [
    "LISTING_REVISION_ALREADY_REVIEWED",
    "LISTING_REVISION_ALREADY_REVIEWED",
    "This change has already been reviewed.",
  ],
  [
    "LISTING_REVISION_NOT_FOUND",
    "LISTING_REVISION_NOT_FOUND",
    "That change could not be found.",
  ],
  // 0030. Matching is by `includes`, so a sentinel that is a substring of
  // another must be listed first or the broader one will swallow it. None of
  // these overlap today; the ordering is kept deliberate so that stays checkable.
  [
    "INSPECTION_COMPLETION_WINDOW_CLOSED",
    "INSPECTION_COMPLETION_WINDOW_CLOSED",
    "The four day window to mark this inspection complete has passed.",
  ],
  [
    "INSPECTION_COMPLETED_IS_TERMINAL",
    "INSPECTION_STATE_TRANSITION_INVALID",
    "A completed inspection cannot be changed.",
  ],
  // The SQL sentinel is spelled out in full for readability inside the
  // function; the app code it maps to is the one that already existed.
  [
    "INSPECTION_REQUEST_NOT_FOUND",
    "INSPECTION_NOT_FOUND",
    "Inspection request not found.",
  ],
  [
    "INSPECTION_STATE_TRANSITION_INVALID",
    "INSPECTION_STATE_TRANSITION_INVALID",
    "The inspection changed state before this could be applied.",
  ],
  [
    "INSPECTION_DECISION_INVALID",
    "INSPECTION_STATE_TRANSITION_INVALID",
    "An inspection request can only be accepted or declined.",
  ],
  [
    "INSPECTION_EXPIRED",
    "INSPECTION_EXPIRED",
    "This inspection request passed its 48 hour window before it was answered.",
  ],
  ["UNAUTHENTICATED", "UNAUTHENTICATED", "Sign in to continue."],
];

export function mapDatabaseSentinel(error: unknown): never {
  const message = (error as { message?: string })?.message ?? "";

  for (const [sentinel, code, text] of SENTINELS) {
    if (message.includes(sentinel)) {
      throw new AppError(code, text);
    }
  }

  throw error;
}
