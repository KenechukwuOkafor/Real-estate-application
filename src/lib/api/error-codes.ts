/**
 * The error registry: every code, its category, and its HTTP status.
 *
 * This exists because classification used to be done by matching English text
 * in error messages — `message.includes("invalid")` meant 422, `message.endsWith
 * (" not found.")` meant 404. That is fragile in three separate ways, and the
 * third one is the dangerous one:
 *
 *  - Rewording a message silently changes its HTTP status.
 *  - A message that happens to contain "invalid" is misclassified.
 *  - The matched message was echoed to the client verbatim, so any thrown Error
 *    whose text contained "invalid" would have returned a database error to the
 *    caller with a 422. That was unreachable only because a PostgrestError is a
 *    plain object rather than an Error instance — an accident, not a design.
 *
 * Classification is now a lookup on a code. Messages are for humans and are
 * never parsed.
 *
 * REB-ARCH-009 defines the categories; they exist to give alerting different
 * thresholds. An expected 403 is not an incident. An unexpected 500 is.
 */

/**
 * Alerting categories, from the observability architecture.
 *
 * `alerts` is the operational meaning: whether reaching Sentry is signal or
 * noise. A validation failure is the system working — a user sent something
 * wrong and was told so. Paging on those trains people to ignore the pager.
 */
export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "business_rule"
  | "infrastructure"
  | "unexpected";

export const CATEGORY_ALERTS: Record<ErrorCategory, boolean> = {
  // Someone sent a bad request and was told. Not our problem to fix at 3am.
  validation: false,
  // Expected constantly: expired sessions, signed-out tabs, crawlers.
  authentication: false,
  // A denial is the boundary doing its job. Spikes matter, individual events
  // do not — that is a rate alert in Sentry, not a per-event report.
  authorization: false,
  // The domain refusing an operation. Expected, and the user can act on it.
  business_rule: false,
  // A dependency we own the relationship with failed. Actionable.
  infrastructure: true,
  // We do not know what happened, which is the definition of worth looking at.
  unexpected: true,
};

type ErrorDefinition = {
  category: ErrorCategory;
  httpStatus: number;
};

/**
 * Every code the API can return.
 *
 * Adding a throw site means adding a code here. That is deliberate friction: it
 * forces the author to decide, once, whether the failure is expected and who
 * should hear about it.
 */
export const ERROR_CODES = {
  // ---------------------------------------------------------- validation
  VALIDATION_ERROR: { category: "validation", httpStatus: 422 },
  JOB_PAYLOAD_INVALID: { category: "validation", httpStatus: 422 },

  // ------------------------------------------------------ authentication
  UNAUTHENTICATED: { category: "authentication", httpStatus: 401 },

  // ------------------------------------------------------- authorization
  UNAUTHORIZED: { category: "authorization", httpStatus: 403 },
  AGENT_NOT_VERIFIED: { category: "authorization", httpStatus: 403 },
  SUBSCRIPTION_REQUIRED: { category: "authorization", httpStatus: 403 },

  // ------------------------------------------------------- business rule
  NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  CONFLICT: { category: "business_rule", httpStatus: 409 },
  LISTING_DUPLICATE_DETECTED: { category: "business_rule", httpStatus: 409 },
  LISTING_IMAGE_COUNT_INVALID: { category: "business_rule", httpStatus: 422 },
  LISTING_STATE_TRANSITION_INVALID: { category: "business_rule", httpStatus: 422 },
  MEDIA_MIME_TYPE_UNSUPPORTED: { category: "business_rule", httpStatus: 422 },
  AGENT_PROFILE_REQUIRED: { category: "business_rule", httpStatus: 422 },
  RATE_LIMITED: { category: "business_rule", httpStatus: 429 },

  // Compare-and-set failures: another request moved the row between our read
  // and our write. The client should reload and retry, so 409 rather than 422.
  LISTING_STATE_CONFLICT: { category: "business_rule", httpStatus: 409 },
  AGENT_QUOTA_CONFLICT: { category: "business_rule", httpStatus: 409 },

  // ------------------------------------------------------ infrastructure
  // A dependency failed, or is misconfigured. Someone must act.
  JOBS_DRAIN_SECRET_UNSET: { category: "infrastructure", httpStatus: 500 },
  UPSTREAM_UNAVAILABLE: { category: "infrastructure", httpStatus: 502 },

  // --------------------------------------------- verification lifecycle
  VERIFICATION_ALREADY_REVIEWED: { category: "business_rule", httpStatus: 409 },
  VERIFICATION_NOT_SUBMITTABLE: { category: "business_rule", httpStatus: 409 },
  VERIFICATION_REVIEW_IN_PROGRESS: { category: "business_rule", httpStatus: 409 },
  VERIFICATION_STATE_TRANSITION_INVALID: { category: "business_rule", httpStatus: 422 },
  VERIFICATION_DOCUMENT_NOT_UPLOADED: { category: "business_rule", httpStatus: 422 },
  AGENT_ALREADY_VERIFIED: { category: "business_rule", httpStatus: 409 },

  // ------------------------------------------------ inspection lifecycle
  INSPECTION_DECISION_INVALID: { category: "validation", httpStatus: 422 },
  INSPECTION_NOT_OWNED: { category: "authorization", httpStatus: 403 },
  INSPECTION_SELF_REQUEST: { category: "business_rule", httpStatus: 422 },
  INSPECTION_STATE_TRANSITION_INVALID: { category: "business_rule", httpStatus: 422 },

  // ------------------------------------------------------------- listings
  LISTING_IMAGE_NOT_UPLOADED: { category: "business_rule", httpStatus: 422 },

  // ----------------------------------------------------------------- roles
  ROLE_NOT_SELF_SERVICE: { category: "authorization", httpStatus: 403 },
  ROLE_REQUIRED: { category: "validation", httpStatus: 422 },

  // ------------------------------------------------------------- identity
  // Clerk is configured wrongly or is failing. Nobody signing in can proceed,
  // and no user action fixes it, so these alert.
  CLERK_ROLE_CLAIM_MISSING: { category: "infrastructure", httpStatus: 500 },
  CLERK_ROLE_CLAIM_UNEXPECTED: { category: "infrastructure", httpStatus: 500 },
  CLERK_SESSION_TOKEN_UNREADABLE: { category: "infrastructure", httpStatus: 500 },
  SESSION_TOKEN_UNAVAILABLE: { category: "authentication", httpStatus: 401 },

  // --------------------------------------------------- resource not found
  // Distinct codes rather than one NOT_FOUND, because "which thing was
  // missing" is the first question asked when one of these appears in Sentry,
  // and reading it off the tag beats reading it off a message.
  AGENT_PROFILE_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  // Raised by public.archive_own_listing and public.remove_listing_image. They
  // were sentinels with no registered code, so if either fired — a race between
  // the service's check and the function's — the raw Postgres error resolved to
  // INTERNAL_ERROR and told the agent it was our fault for what is a 404.
  LISTING_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  LISTING_IMAGE_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  // Revisions. A pending one is a conflict rather than a validation failure:
  // nothing the agent sent is wrong, there is simply already a change waiting.
  LISTING_REVISION_ALREADY_PENDING: { category: "business_rule", httpStatus: 409 },
  LISTING_REVISION_ALREADY_REVIEWED: { category: "business_rule", httpStatus: 409 },
  LISTING_REVISION_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  CHAT_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  INSPECTION_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  VERIFICATION_SUBMISSION_NOT_FOUND: { category: "business_rule", httpStatus: 404 },

  // ------------------------------------------------- inspection lifecycle
  INSPECTION_ALREADY_ACTIVE: { category: "business_rule", httpStatus: 409 },

  // ------------------------------------------------- identity and config
  // Nobody can sign in and no user action fixes it, so these alert. They were
  // 500s before by accident of matching no string pattern; now they are 500s
  // on purpose, which is the difference between silence and a page.
  CLERK_USER_UNAVAILABLE: { category: "infrastructure", httpStatus: 500 },
  CLERK_USER_EMAIL_MISSING: { category: "infrastructure", httpStatus: 500 },

  // A missing environment variable used to return 422 VALIDATION_ERROR,
  // because its message contains the word "required". It is a deployment
  // fault, not a caller fault.
  CONFIG_ENV_VAR_MISSING: { category: "infrastructure", httpStatus: 500 },

  // ----------------------------------------------------------- unexpected
  INTERNAL_ERROR: { category: "unexpected", httpStatus: 500 },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isKnownErrorCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/**
 * The category for a code.
 *
 * An unregistered code is `unexpected` rather than a guess. Alerting on
 * something we failed to classify is the safe direction: the cost is noise, and
 * the cost of the other direction is silence.
 */
export function categoryForCode(code: string): ErrorCategory {
  return isKnownErrorCode(code) ? ERROR_CODES[code].category : "unexpected";
}

export function httpStatusForCode(code: string): number {
  return isKnownErrorCode(code) ? ERROR_CODES[code].httpStatus : 500;
}

export function shouldAlert(category: ErrorCategory): boolean {
  return CATEGORY_ALERTS[category];
}
