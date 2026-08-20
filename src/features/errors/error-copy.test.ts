import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/sentry", () => ({
  captureMessage: vi.fn(() => true),
}));

const { captureMessage } = await import("@/lib/observability/sentry");

const { ERROR_COPY, FALLBACK_ERROR_COPY, errorCopyFor, errorCopyForResponse } =
  await import("@/features/errors/error-copy");
const { ERROR_CODES } = await import("@/lib/api/error-codes");

/**
 * These assert the copy RULES, not the exact sentences.
 *
 * Pinning wording would make every improvement to a sentence a test failure,
 * which teaches people to change the test rather than the copy. What must not
 * regress is the shape: no internal vocabulary, no blame, and something to do.
 */
describe("error copy", () => {
  const mapped = Object.keys(ERROR_COPY);

  it("covers the codes a person can actually reach", () => {
    // Sanity, so the assertions below are not vacuous if the map is emptied.
    expect(mapped.length).toBeGreaterThan(20);
  });

  it("never shows an internal code to a person", () => {
    for (const [code, copy] of Object.entries(ERROR_COPY)) {
      expect(copy).not.toContain(code);
      // SCREAMING_SNAKE anywhere in the sentence is the tell.
      expect(copy).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
    }

    expect(FALLBACK_ERROR_COPY).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
  });

  it("is written as sentences, not labels", () => {
    for (const copy of Object.values(ERROR_COPY)) {
      expect(copy.length).toBeGreaterThan(20);
      expect(copy).toMatch(/[.!?]$/);
      expect(copy[0]).toBe(copy[0].toUpperCase());
    }
  });

  /**
   * Rule two: never blame the person.
   *
   * These words are how software usually tells someone they are the problem,
   * and an agent whose verification is pending has done nothing at all.
   */
  it("does not blame the reader", () => {
    for (const copy of Object.values(ERROR_COPY)) {
      expect(copy.toLowerCase()).not.toMatch(
        /\b(invalid|illegal|forbidden|denied|failure|failed|you must|error)\b/,
      );
    }
  });

  it("tells a waiting agent that nothing is required of them", () => {
    // The sharpest case: this one is us owing them, and the copy has to say so.
    expect(ERROR_COPY.AGENT_NOT_VERIFIED.toLowerCase()).toContain("let you know");
  });

  it("says what to do for the gates an agent can act on", () => {
    expect(ERROR_COPY.LISTING_IMAGE_COUNT_INVALID.toLowerCase()).toContain("add at least three");
    expect(ERROR_COPY.AGENT_PROFILE_REQUIRED.toLowerCase()).toContain("profile");
  });
});

describe("errorCopyFor", () => {
  it("returns the mapped sentence for a known code", () => {
    expect(errorCopyFor("LISTING_IMAGE_COUNT_INVALID")).toBe(
      ERROR_COPY.LISTING_IMAGE_COUNT_INVALID,
    );
  });

  it.each([undefined, null, ""])("falls back when the code is %p", (code) => {
    expect(errorCopyFor(code)).toBe(FALLBACK_ERROR_COPY);
  });

  it("falls back rather than showing an unmapped code", () => {
    expect(errorCopyFor("SOME_CODE_NOBODY_MAPPED")).toBe(FALLBACK_ERROR_COPY);
  });

  /**
   * An unmapped code is a path somebody built without deciding what a person
   * should read at the end of it. The fallback is exactly what would otherwise
   * hide that, so it reports itself.
   */
  it("reports an unmapped code so the gap is visible to us", () => {
    vi.mocked(captureMessage).mockClear();

    errorCopyFor("ANOTHER_UNMAPPED_CODE");

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureMessage).mock.calls[0][0]).toContain("ANOTHER_UNMAPPED_CODE");
  });

  it("reports each unmapped code once, not once per render", () => {
    vi.mocked(captureMessage).mockClear();

    errorCopyFor("REPEATED_UNMAPPED_CODE");
    errorCopyFor("REPEATED_UNMAPPED_CODE");
    errorCopyFor("REPEATED_UNMAPPED_CODE");

    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it("does not report a code it has copy for", () => {
    vi.mocked(captureMessage).mockClear();

    errorCopyFor("NOT_FOUND");

    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe("errorCopyForResponse", () => {
  it("reads the code off an API error payload", () => {
    expect(errorCopyForResponse({ error: { code: "UNAUTHENTICATED" } })).toBe(
      ERROR_COPY.UNAUTHENTICATED,
    );
  });

  /**
   * The message must not be able to influence what a person reads. This is the
   * whole point: the API's internal vocabulary stops being copy.
   */
  it("ignores the message entirely, even when the code is unknown", () => {
    const copy = errorCopyForResponse({
      error: { code: "MYSTERY_CODE", message: "invalid input syntax for type uuid" },
    });

    expect(copy).toBe(FALLBACK_ERROR_COPY);
    expect(copy).not.toContain("uuid");
  });

  it.each([null, {}, { error: null }])("falls back for payload %p", (payload) => {
    expect(errorCopyForResponse(payload as never)).toBe(FALLBACK_ERROR_COPY);
  });
});

/**
 * Every registered code either has copy or is deliberately generic.
 *
 * Infrastructure codes are exempt: CLERK_ROLE_CLAIM_MISSING is our deployment
 * being wrong, and there is nothing true and useful to say about it beyond
 * "this is ours". Listing the exemptions explicitly means joining that list is
 * a visible decision rather than an omission nobody notices.
 */
describe("registry coverage", () => {
  const DELIBERATELY_GENERIC = new Set([
    "INTERNAL_ERROR",
    "UPSTREAM_UNAVAILABLE",
    "JOBS_DRAIN_SECRET_UNSET",
    "CLERK_ROLE_CLAIM_MISSING",
    "CLERK_ROLE_CLAIM_UNEXPECTED",
    "CLERK_SESSION_TOKEN_UNREADABLE",
    "CLERK_USER_UNAVAILABLE",
    "CLERK_USER_EMAIL_MISSING",
    "CONFIG_ENV_VAR_MISSING",
    // Machine-to-machine only: a job payload is never shaped by a person, so a
    // person can never be the one to fix it.
    "JOB_PAYLOAD_INVALID",
    // Reachable only by a caller crafting requests directly; the surfaces that
    // could produce it validate first.
    "LISTING_DUPLICATE_DETECTED",
  ]);

  it("has copy for every code that is not deliberately generic", () => {
    const missing = Object.keys(ERROR_CODES).filter(
      (code) => !DELIBERATELY_GENERIC.has(code) && !ERROR_COPY[code],
    );

    expect(missing).toEqual([]);
  });

  it("does not write copy for a code that no longer exists", () => {
    const orphans = Object.keys(ERROR_COPY).filter(
      (code) => !(code in ERROR_CODES),
    );

    expect(orphans).toEqual([]);
  });
});
