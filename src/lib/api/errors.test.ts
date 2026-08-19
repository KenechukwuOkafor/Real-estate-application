import { describe, expect, it } from "vitest";

import { AppError, resolveRouteError } from "@/lib/api/errors";

/**
 * The status contract, pinned code by code.
 *
 * Each row is a code the throw-site migration produces and the HTTP status the
 * old message-matching resolver produced for the same failure. Two rows are
 * deliberate changes and are marked; every other row must match exactly. This
 * table is what makes a 60-site refactor reviewable — the diff is large, but
 * the client-visible surface is asserted here in one place.
 */
const PINNED: ReadonlyArray<[code: string, httpStatus: number]> = [
  ["UNAUTHENTICATED", 401],
  ["UNAUTHORIZED", 403],
  ["AGENT_NOT_VERIFIED", 403],
  ["SUBSCRIPTION_REQUIRED", 403],
  ["NOT_FOUND", 404],
  ["AGENT_PROFILE_NOT_FOUND", 404],
  ["CHAT_NOT_FOUND", 404],
  ["INSPECTION_NOT_FOUND", 404],
  ["VERIFICATION_SUBMISSION_NOT_FOUND", 404],
  ["CONFLICT", 409],
  ["INSPECTION_ALREADY_ACTIVE", 409],
  ["LISTING_STATE_CONFLICT", 409],
  ["AGENT_QUOTA_CONFLICT", 409],
  ["VALIDATION_ERROR", 422],
  ["AGENT_PROFILE_REQUIRED", 422],
  ["LISTING_IMAGE_COUNT_INVALID", 422],
  ["LISTING_STATE_TRANSITION_INVALID", 422],
  // Deliberate change: was 500. An unsupported MIME type is the caller's
  // problem and always was; it reached 500 only because the sentinel string
  // matched no pattern.
  ["MEDIA_MIME_TYPE_UNSUPPORTED", 422],
  // Deliberate change: was 422, because the message contains "required".
  // A missing environment variable is a deployment fault.
  ["CONFIG_ENV_VAR_MISSING", 500],
  ["CLERK_USER_UNAVAILABLE", 500],
  ["CLERK_USER_EMAIL_MISSING", 500],
  ["INTERNAL_ERROR", 500],
];

describe("the pinned status contract", () => {
  it.each(PINNED)("%s resolves to %i", (code, httpStatus) => {
    const resolved = resolveRouteError(new AppError(code, "Any message at all."));

    expect(resolved.code).toBe(code);
    expect(resolved.httpStatus).toBe(httpStatus);
  });

  it("takes the status from the registry, not from the throw site", () => {
    // No third argument. The code alone decides.
    expect(resolveRouteError(new AppError("NOT_FOUND", "Gone.")).httpStatus).toBe(404);
  });
});

describe("resolveRouteError does not classify by message text", () => {
  /**
   * The hazard this slice exists to remove.
   *
   * The old resolver matched `message.includes("invalid")` to 422 and returned
   * the matched message verbatim. A Postgres error reads
   * "invalid input syntax for type uuid", so any code path that wrapped a
   * database failure in an Error would have echoed it to an unauthenticated
   * caller with a 422. It was unreachable only because a PostgrestError is a
   * plain object, not an Error instance. That is safety by accident.
   */
  it("does not echo a database error, and does not call it a 422", () => {
    const resolved = resolveRouteError(
      new Error('invalid input syntax for type uuid: "not-a-uuid"'),
    );

    expect(resolved.httpStatus).toBe(500);
    expect(resolved.code).toBe("INTERNAL_ERROR");
    expect(resolved.message).not.toContain("invalid input syntax");
    expect(resolved.message).not.toContain("uuid");
  });

  const ONCE_MATCHED = [
    "Unauthenticated request.",
    "Admin role is required.",
    "Listing not found.",
    "AGENT_NOT_VERIFIED",
    "LISTING_STATE_CONFLICT",
    "Something is invalid.",
    "A name is required.",
    "This cannot be done.",
    "That already exists.",
  ];

  it.each(ONCE_MATCHED)(
    "treats %j as unexpected, because it is a bare Error",
    (message) => {
      const resolved = resolveRouteError(new Error(message));

      expect(resolved.httpStatus).toBe(500);
      expect(resolved.code).toBe("INTERNAL_ERROR");
      expect(resolved.unexpected).toBe(true);
    },
  );

  it("returns a fixed message for anything unclassified, never the thrown text", () => {
    const secretish = new Error("connect ECONNREFUSED 10.0.0.5:5432");

    expect(resolveRouteError(secretish).message).not.toContain("10.0.0.5");
  });

  it("classifies a PostgrestError-shaped plain object as unexpected", () => {
    // Not an Error instance. The old resolver reached its 500 fallthrough by
    // luck; this asserts it is now reached by rule.
    const postgrest = {
      code: "22P02",
      details: null,
      hint: null,
      message: 'invalid input syntax for type uuid: "x"',
    };

    expect(resolveRouteError(postgrest).httpStatus).toBe(500);
  });
});

describe("categories", () => {
  it("marks an AppError as expected and a bare Error as unexpected", () => {
    expect(resolveRouteError(new AppError("NOT_FOUND", "Gone.")).unexpected).toBe(false);
    expect(resolveRouteError(new Error("Gone.")).unexpected).toBe(true);
  });

  it("carries the category so an operator can filter denials from breakage", () => {
    expect(resolveRouteError(new AppError("UNAUTHORIZED", "No.")).category).toBe(
      "authorization",
    );
    expect(resolveRouteError(new Error("boom")).category).toBe("unexpected");
  });

  it("preserves an AppError's own message, which is written for a human", () => {
    const resolved = resolveRouteError(new AppError("NOT_FOUND", "Listing not found."));

    expect(resolved.message).toBe("Listing not found.");
  });
});
