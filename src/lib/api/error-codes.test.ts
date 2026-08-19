import { describe, expect, it } from "vitest";

import {
  CATEGORY_ALERTS,
  categoryForCode,
  ERROR_CODES,
  httpStatusForCode,
  isKnownErrorCode,
  shouldAlert,
  type ErrorCategory,
} from "@/lib/api/error-codes";

const ALL_CATEGORIES: ErrorCategory[] = [
  "validation",
  "authentication",
  "authorization",
  "business_rule",
  "infrastructure",
  "unexpected",
];

describe("the error registry", () => {
  it("gives every code a category the docs define", () => {
    for (const [code, definition] of Object.entries(ERROR_CODES)) {
      expect(ALL_CATEGORIES, `${code} has an undefined category`).toContain(
        definition.category,
      );
    }
  });

  it("gives every code a plausible HTTP status", () => {
    for (const [code, definition] of Object.entries(ERROR_CODES)) {
      expect(definition.httpStatus, `${code}`).toBeGreaterThanOrEqual(400);
      expect(definition.httpStatus, `${code}`).toBeLessThan(600);
    }
  });

  it("gives every category an alerting decision", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_ALERTS[category], `${category}`).toBeTypeOf("boolean");
    }
  });

  it("alerts on exactly infrastructure and unexpected", () => {
    // An expected 403 must not page anyone; an unexpected 500 must.
    expect(shouldAlert("infrastructure")).toBe(true);
    expect(shouldAlert("unexpected")).toBe(true);
    expect(shouldAlert("validation")).toBe(false);
    expect(shouldAlert("authentication")).toBe(false);
    expect(shouldAlert("authorization")).toBe(false);
    expect(shouldAlert("business_rule")).toBe(false);
  });

  it("never pairs a 5xx status with a category that does not alert", () => {
    // A 5xx nobody hears about is the silent failure this slice exists to end.
    for (const [code, definition] of Object.entries(ERROR_CODES)) {
      if (definition.httpStatus >= 500) {
        expect(shouldAlert(definition.category), `${code} is 5xx but silent`).toBe(true);
      }
    }
  });

  it("treats an unregistered code as unexpected rather than guessing", () => {
    expect(isKnownErrorCode("NOT_A_REAL_CODE")).toBe(false);
    expect(categoryForCode("NOT_A_REAL_CODE")).toBe("unexpected");
    expect(httpStatusForCode("NOT_A_REAL_CODE")).toBe(500);
  });

  it("registers every code the migrated throw sites need", () => {
    const required = [
      "AGENT_NOT_VERIFIED",
      "AGENT_PROFILE_NOT_FOUND",
      "AGENT_PROFILE_REQUIRED",
      "AGENT_QUOTA_CONFLICT",
      "CHAT_NOT_FOUND",
      "CLERK_USER_EMAIL_MISSING",
      "CLERK_USER_UNAVAILABLE",
      "CONFIG_ENV_VAR_MISSING",
      "CONFLICT",
      "INSPECTION_ALREADY_ACTIVE",
      "INSPECTION_NOT_FOUND",
      "INTERNAL_ERROR",
      "LISTING_IMAGE_COUNT_INVALID",
      "LISTING_STATE_CONFLICT",
      "LISTING_STATE_TRANSITION_INVALID",
      "MEDIA_MIME_TYPE_UNSUPPORTED",
      "NOT_FOUND",
      "SUBSCRIPTION_REQUIRED",
      "UNAUTHENTICATED",
      "UNAUTHORIZED",
      "VALIDATION_ERROR",
      "VERIFICATION_SUBMISSION_NOT_FOUND",
    ];

    for (const code of required) {
      expect(isKnownErrorCode(code), `${code} is not registered`).toBe(true);
    }
  });
});
