import { captureMessage } from "@/lib/observability/sentry";

/**
 * What a person reads when something goes wrong.
 *
 * There was no layer here. Fourteen components rendered `payload.error.message`
 * straight into the interface, so an agent who submitted without verification
 * read the words AGENT_NOT_VERIFIED in a red box, and one with two photos read
 * LISTING_IMAGE_COUNT_INVALID.
 *
 * That is one defect facing two ways. The API's internal vocabulary was the
 * user's copy, which is why the observability slice had to preserve thrown
 * messages byte-for-byte — rewording a message would have silently changed what
 * a user read — and why a wrapped Postgres error saying "invalid input syntax
 * for type uuid" would have been rendered into somebody's error box rather than
 * merely returned in a body.
 *
 * Keyed on `code`, never on message text. The code is the contract; the message
 * is a developer's note that happens to travel alongside it.
 *
 * TWO RULES, and they are worth more than the plumbing:
 *
 *  1. SAY WHAT TO DO, NOT WHAT WENT WRONG. "Add at least three photos before
 *     submitting" is useful. "Image count invalid" is a description of the
 *     program's opinion of the person.
 *
 *  2. NEVER BLAME THE PERSON. An agent whose verification is still being
 *     reviewed has done nothing wrong — they are waiting on us. Copy that reads
 *     as an accusation for something the reader cannot control is worse than no
 *     copy, because it also makes them feel stupid.
 */

/**
 * Codes a person can actually reach, with the sentence they should read.
 *
 * Infrastructure codes are deliberately absent from the specific list and fall
 * through to the generic copy below: CLERK_ROLE_CLAIM_MISSING is our
 * deployment being wrong, and there is nothing true and useful to say to a user
 * about it beyond "this is ours, try again".
 */
export const ERROR_COPY: Readonly<Record<string, string>> = {
  // ----------------------------------------------------------- entitlement
  AGENT_NOT_VERIFIED:
    "Your identity check needs to finish before you can submit a listing. We will let you know as soon as it is reviewed.",
  AGENT_PROFILE_REQUIRED:
    "Set up your agent profile first — it only takes a moment, and your listings are attached to it.",
  SUBSCRIPTION_REQUIRED:
    "You have used all your submission slots. A subscription gives you more.",
  AGENT_QUOTA_CONFLICT:
    "Your submission slots changed while you were working. Reload the page to see how many you have now.",

  // -------------------------------------------------------------- listings
  LISTING_IMAGE_COUNT_INVALID:
    "Add at least three photos before submitting. Listings with more photos get far more enquiries.",
  LISTING_IMAGE_NOT_UPLOADED:
    "One of the photos did not finish uploading. Try adding it again.",
  LISTING_DUPLICATE_DETECTED:
    "You already have a listing for this property. Edit that one instead of creating a second.",
  LISTING_STATE_TRANSITION_INVALID:
    "This listing cannot be changed in the state it is in. Only drafts and rejected listings can be edited.",
  LISTING_STATE_CONFLICT:
    "This listing was updated somewhere else a moment ago. Reload the page and try again.",
  MEDIA_MIME_TYPE_UNSUPPORTED:
    "That file type is not supported. Use a JPG, PNG or WebP image.",

  // ---------------------------------------------------------- verification
  VERIFICATION_DOCUMENT_NOT_UPLOADED:
    "One of your documents did not finish uploading. Try adding it again.",
  VERIFICATION_NOT_SUBMITTABLE:
    "Your verification cannot be submitted right now. If it is already being reviewed, you do not need to do anything.",
  VERIFICATION_REVIEW_IN_PROGRESS:
    "Your verification is being reviewed. We will let you know when it is done.",
  VERIFICATION_ALREADY_REVIEWED:
    "This verification has already been reviewed, so it cannot be changed.",
  VERIFICATION_STATE_TRANSITION_INVALID:
    "This verification cannot be changed in the state it is in.",
  AGENT_ALREADY_VERIFIED: "You are already verified — nothing more to do here.",
  VERIFICATION_SUBMISSION_NOT_FOUND:
    "We could not find that verification. It may have been withdrawn.",

  // ------------------------------------------------------------ inspection
  INSPECTION_SELF_REQUEST:
    "This is your own listing, so there is no inspection to request.",
  INSPECTION_ALREADY_ACTIVE:
    "You already have an inspection request open for this property. Check your messages to continue that conversation.",
  INSPECTION_DECISION_INVALID: "Choose whether to accept or decline the request.",
  INSPECTION_STATE_TRANSITION_INVALID:
    "This inspection request has already been answered.",
  INSPECTION_NOT_OWNED: "This inspection request belongs to someone else.",
  INSPECTION_NOT_FOUND:
    "We could not find that inspection request. It may have been withdrawn.",

  // ----------------------------------------------------------------- roles
  ROLE_REQUIRED: "Choose whether you are looking for a home or listing one.",
  ROLE_NOT_SELF_SERVICE:
    "That role cannot be chosen here. Contact us if you think you need it.",

  // ------------------------------------------------------------- identity
  UNAUTHENTICATED: "Please sign in to continue.",
  SESSION_TOKEN_UNAVAILABLE: "Your session has expired. Sign in again to continue.",
  UNAUTHORIZED: "You do not have access to this.",

  // -------------------------------------------------------------- generic
  NOT_FOUND: "We could not find that. It may have been removed.",
  AGENT_PROFILE_NOT_FOUND: "We could not find that agent's profile.",
  CHAT_NOT_FOUND: "We could not find that conversation.",
  CONFLICT: "Something changed while you were working. Reload the page and try again.",
  VALIDATION_ERROR: "Some details are missing or do not look right. Check the form and try again.",
  RATE_LIMITED: "That is a lot of requests at once. Wait a moment and try again.",
};

/**
 * What a person reads when the code is one nobody wrote copy for.
 *
 * Honest and useless to nobody: it does not pretend to explain, it does not
 * blame the reader, and it says the one true actionable thing. Deliberately not
 * the raw code, and deliberately not "an unexpected error occurred", which
 * tells the reader only that we were surprised.
 */
export const FALLBACK_ERROR_COPY =
  "Something went wrong on our side. Please try again — if it keeps happening, let us know.";

const reportedCodes = new Set<string>();

/**
 * An unmapped code is a missing sentence, and a missing sentence is a path
 * somebody built without deciding what a person should read at the end of it.
 *
 * Reported rather than merely defaulted, because the fallback is the exact thing
 * that would otherwise hide it: the interface looks fine and nobody learns that
 * a reachable failure has no copy.
 *
 * Deduplicated per page load. A code that fires in a render loop should not
 * produce a thousand identical events, which is how a signal becomes noise and
 * then gets muted.
 */
function reportUnmappedCode(code: string) {
  if (reportedCodes.has(code)) {
    return;
  }

  reportedCodes.add(code);

  captureMessage(`No user-facing copy for error code: ${code}`, {
    alertKind: "error-copy-missing",
    category: "unexpected",
    errorCode: code,
    extra: { code },
    level: "warning",
  });
}

/**
 * The sentence for an error, given the code the API returned.
 *
 * `message` is accepted but deliberately unused for display. It is a developer's
 * note, and the whole point of this module is that it stops being copy. The
 * parameter exists so call sites read naturally and so nobody is tempted to
 * reintroduce `?? payload.error.message` at the end of the chain.
 */
export function errorCopyFor(code: string | null | undefined): string {
  if (!code) {
    return FALLBACK_ERROR_COPY;
  }

  const copy = ERROR_COPY[code];

  if (copy) {
    return copy;
  }

  reportUnmappedCode(code);

  return FALLBACK_ERROR_COPY;
}

type ApiErrorPayload = {
  error?: { code?: string | null; message?: string | null } | null;
} | null;

/**
 * Read a failed API response and return the sentence for it.
 *
 * One place, so a component never has to reach into the payload shape and never
 * has a `message` in scope to be tempted by.
 */
export function errorCopyForResponse(payload: ApiErrorPayload): string {
  return errorCopyFor(payload?.error?.code);
}
