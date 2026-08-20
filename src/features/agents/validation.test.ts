/**
 * The duration rules at the validation layer.
 *
 * The database CHECK is the guarantee and is asserted separately, against a
 * real Postgres, in listing-duration-integration.test.ts. These assertions
 * cover the other half: that an agent who gets it wrong receives a 422 saying
 * what to fix, rather than a constraint violation surfacing as a 500.
 *
 * Both layers are deliberate. Validation alone would hold only until the next
 * caller; the constraint alone would answer every mistake with "internal error".
 */
import { describe, expect, it } from "vitest";

import { validateDraftListingInput } from "@/features/agents/validation";
import type { ValidationIssue } from "@/lib/api/error-details";
import type { AgentDraftListingInput } from "@/features/agents/types";

function draft(overrides: Partial<AgentDraftListingInput> = {}): AgentDraftListingInput {
  return {
    amenities: [],
    area: "Odenigbo",
    bathrooms: 1,
    bedrooms: 1,
    description: "A tidy self contain close to campus.",
    priceNaira: 250000,
    propertyType: "1_bedroom",
    rentalDuration: "yearly",
    subletMonths: null,
    title: "One bedroom near UNN",
    ...overrides,
  };
}

/**
 * The issues an input produces, or an empty list if it is valid.
 *
 * Assertions are on the structured issues rather than on the message, because
 * the message is a developer's note now and pinning prose is what made these
 * tests fail when the wording improved.
 */
function issuesFor(input: AgentDraftListingInput): ValidationIssue[] {
  try {
    validateDraftListingInput(input);
    return [];
  } catch (error) {
    const details = (error as { details?: { issues?: ValidationIssue[] } }).details;
    return details?.issues ?? [];
  }
}

describe("validateDraftListingInput — rental duration", () => {
  it("accepts a yearly listing with no month count", () => {
    expect(() => validateDraftListingInput(draft())).not.toThrow();
  });

  it("accepts a monthly listing with no month count", () => {
    expect(() =>
      validateDraftListingInput(draft({ rentalDuration: "monthly" })),
    ).not.toThrow();
  });

  it("accepts a sublet with a month count", () => {
    expect(() =>
      validateDraftListingInput(
        draft({ rentalDuration: "sublet", subletMonths: 4 }),
      ),
    ).not.toThrow();
  });

  it("refuses a sublet with no month count", () => {
    expect(issuesFor(draft({ rentalDuration: "sublet" }))).toEqual([
      { field: "subletMonths", rule: "required" },
    ]);
  });

  it("refuses a yearly listing that carries a month count", () => {
    expect(issuesFor(draft({ subletMonths: 4 }))).toEqual([
      { field: "subletMonths", rule: "not_applicable" },
    ]);
  });

  it("refuses a monthly listing that carries a month count", () => {
    expect(
      issuesFor(draft({ rentalDuration: "monthly", subletMonths: 4 })),
    ).toEqual([{ field: "subletMonths", rule: "not_applicable" }]);
  });

  it("refuses a sublet of zero months", () => {
    expect(
      issuesFor(draft({ rentalDuration: "sublet", subletMonths: 0 })),
    ).toEqual([{ field: "subletMonths", rule: "must_be_positive" }]);
  });

  it("refuses a fractional sublet length", () => {
    expect(
      issuesFor(draft({ rentalDuration: "sublet", subletMonths: 2.5 })),
    ).toEqual([{ field: "subletMonths", rule: "must_be_whole_number" }]);
  });

  // The route deliberately does not default this field, so an omitted duration
  // arrives here as undefined. It must be refused rather than assumed annual —
  // assuming it is the bug this slice exists to remove.
  it("refuses a missing duration rather than assuming annual", () => {
    expect(issuesFor(draft({ rentalDuration: undefined as never }))).toEqual([
      { field: "rentalDuration", rule: "invalid_option" },
    ]);
  });

  it("refuses a duration that is not one of the three", () => {
    expect(issuesFor(draft({ rentalDuration: "weekly" as never }))).toEqual([
      { field: "rentalDuration", rule: "invalid_option" },
    ]);
  });

  // A 422, not a 500. The resolver classifies by code, and an uncoded throw
  // from here would resolve to INTERNAL_ERROR and page someone for a typo.
  it("throws a 422 so a mistake is not reported as a server fault", () => {
    try {
      validateDraftListingInput(draft({ rentalDuration: "sublet" }));
      throw new Error("expected a validation error");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("VALIDATION_ERROR");
      expect((error as { httpStatus?: number }).httpStatus).toBe(422);
    }
  });

  /**
   * Every failure at once, not the first one.
   *
   * Throwing early meant a form with three problems reported one, the agent
   * fixed it, submitted, and met the second. Five round trips to fill in a form
   * reads as five separate failures.
   */
  it("reports every problem in one response", () => {
    const issues = issuesFor(
      draft({
        area: "  ",
        priceNaira: 0,
        rentalDuration: "sublet",
        subletMonths: null,
        title: "",
      }),
    );

    expect(issues.map((issue) => issue.field).sort()).toEqual([
      "area",
      "priceNaira",
      "subletMonths",
      "title",
    ]);
  });

  /**
   * A business rule wearing validation's clothes. Nothing is wrong with the
   * number 2; it is wrong only alongside this property type, and the agent has
   * two ways to fix it.
   */
  it("files the self-contain shape against a field, with a relationship rule", () => {
    expect(
      issuesFor(draft({ bathrooms: 2, bedrooms: 2, propertyType: "self_contain" })),
    ).toEqual([{ field: "bedrooms", rule: "self_contain_shape" }]);
  });
});
