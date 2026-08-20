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

const { fieldErrorsFrom, fieldLabel, stateTransitionCopy, validationIssueCopy } =
  await import("@/features/errors/error-copy");

/**
 * The reason this slice exists: VALIDATION_ERROR covered roughly twenty field
 * failures, so the only honest sentence was "some details do not look right".
 * These assert that a specific field now gets a specific sentence.
 */
describe("validation issue copy", () => {
  const ALL_RULES = [
    "required",
    "must_be_positive",
    "must_not_be_negative",
    "must_be_whole_number",
    "invalid_option",
    "not_applicable",
    "min_items",
    "max_items",
    "duplicate",
    "self_contain_shape",
  ] as const;

  it("has a sentence for every rule in the vocabulary", () => {
    for (const rule of ALL_RULES) {
      const copy = validationIssueCopy({ field: "priceNaira", rule });

      expect(copy.length).toBeGreaterThan(10);
      expect(copy).toMatch(/[.!?]$/);
    }
  });

  it("obeys the same two rules as the code copy", () => {
    for (const rule of ALL_RULES) {
      const copy = validationIssueCopy({ field: "title", rule }).toLowerCase();

      expect(copy).not.toMatch(/\b(invalid|failed|failure|error|you must|denied)\b/);
      expect(copy).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
    }
  });

  it("names the field in words, not in code", () => {
    expect(validationIssueCopy({ field: "priceNaira", rule: "required" })).toContain(
      "price",
    );
    expect(
      validationIssueCopy({ field: "priceNaira", rule: "required" }),
    ).not.toContain("priceNaira");
  });

  it("uses the numbers it was given", () => {
    expect(
      validationIssueCopy({ field: "images", meta: { min: 3 }, rule: "min_items" }),
    ).toContain("3");
    expect(
      validationIssueCopy({ field: "images", meta: { max: 10 }, rule: "max_items" }),
    ).toContain("10");
  });

  /**
   * The two cross-field rules. Neither is a property of a single value, so the
   * sentence has to name both sides and offer both ways out — an agent should
   * not have to work out that changing the property type is also a fix.
   */
  it("explains a cross-field rule as a relationship, with both remedies", () => {
    const selfContain = validationIssueCopy({
      field: "bedrooms",
      rule: "self_contain_shape",
    });

    expect(selfContain).toContain("one bedroom");
    expect(selfContain.toLowerCase()).toContain("different property type");

    const months = validationIssueCopy({ field: "subletMonths", rule: "not_applicable" });

    expect(months.toLowerCase()).toContain("sublet");
    expect(months.toLowerCase()).toContain("clear the length");
  });

  /**
   * Caught by running it: `area` rendered as "Add a area." Small, and exactly
   * the kind of wrongness that makes an interface feel unfinished.
   */
  it("never puts 'a' in front of a vowel", () => {
    const fields = [
      "area",
      "amenities",
      "images",
      "title",
      "priceNaira",
      "subletMonths",
      "propertyType",
      "bedrooms",
    ];

    for (const field of fields) {
      for (const rule of ALL_RULES) {
        expect(validationIssueCopy({ field, rule })).not.toMatch(/\ba\s+[aeiou]/i);
      }
    }
  });

  it("falls back to a readable label for an unknown field", () => {
    expect(fieldLabel("somethingNew")).toBe("somethingNew");
  });
});

describe("fieldErrorsFrom", () => {
  const payload = (details: unknown) => ({ error: { code: "VALIDATION_ERROR", details } });

  it("keys the messages by field so a form can place them", () => {
    const fields = fieldErrorsFrom(
      payload({
        issues: [
          { field: "title", rule: "required" },
          { field: "priceNaira", rule: "must_be_positive" },
        ],
        kind: "validation",
      }),
    );

    expect(Object.keys(fields).sort()).toEqual(["priceNaira", "title"]);
    expect(fields.title).toContain("title");
  });

  it("returns nothing for a payload with no details, so the banner still shows", () => {
    expect(fieldErrorsFrom(payload(null))).toEqual({});
    expect(fieldErrorsFrom(null)).toEqual({});
  });

  // Details arrive as JSON and nothing guarantees their shape. A malformed
  // payload must degrade to "no field errors", not crash the component that is
  // already rendering an error.
  it.each([{ kind: "validation" }, { issues: "nope", kind: "validation" }, { kind: "other" }])(
    "ignores malformed details %p",
    (details) => {
      expect(fieldErrorsFrom(payload(details))).toEqual({});
    },
  );

  it("keeps the first issue when one field has two", () => {
    const fields = fieldErrorsFrom(
      payload({
        issues: [
          { field: "subletMonths", rule: "required" },
          { field: "subletMonths", rule: "must_be_positive" },
        ],
        kind: "validation",
      }),
    );

    expect(fields.subletMonths).toBe(
      validationIssueCopy({ field: "subletMonths", rule: "required" }),
    );
  });
});

/**
 * One code, four situations. Without the details the sentence had to describe
 * all four at once.
 */
describe("stateTransitionCopy", () => {
  const payload = (action: string, currentStatus = "approved") => ({
    error: {
      code: "LISTING_STATE_TRANSITION_INVALID",
      details: { action, currentStatus, kind: "state_transition" },
    },
  });

  it.each([
    ["edit", "cannot be edited"],
    ["submit", "already been submitted"],
    ["archive", "live listing"],
    ["remove_image", "draft"],
  ])("says something specific for %s", (action, expected) => {
    expect(stateTransitionCopy(payload(action))?.toLowerCase()).toContain(expected);
  });

  it("gives four distinct sentences rather than one generic one", () => {
    const sentences = ["edit", "submit", "archive", "remove_image"].map((action) =>
      stateTransitionCopy(payload(action)),
    );

    expect(new Set(sentences).size).toBe(4);
  });

  it("is null when the details are absent, so the code's copy is used", () => {
    expect(stateTransitionCopy({ error: { code: "X", details: null } })).toBeNull();
  });

  it("prefers the specific sentence over the code's generic one", () => {
    const generic = errorCopyFor("LISTING_STATE_TRANSITION_INVALID");
    const specific = errorCopyForResponse(payload("archive") as never);

    expect(specific).not.toBe(generic);
    expect(specific.toLowerCase()).toContain("live listing");
  });
});
