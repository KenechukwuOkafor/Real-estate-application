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
    expect(() =>
      validateDraftListingInput(draft({ rentalDuration: "sublet" })),
    ).toThrow(/how many months/i);
  });

  it("refuses a yearly listing that carries a month count", () => {
    expect(() =>
      validateDraftListingInput(draft({ subletMonths: 4 })),
    ).toThrow(/only a sublet/i);
  });

  it("refuses a monthly listing that carries a month count", () => {
    expect(() =>
      validateDraftListingInput(
        draft({ rentalDuration: "monthly", subletMonths: 4 }),
      ),
    ).toThrow(/only a sublet/i);
  });

  it("refuses a sublet of zero months", () => {
    expect(() =>
      validateDraftListingInput(
        draft({ rentalDuration: "sublet", subletMonths: 0 }),
      ),
    ).toThrow(/greater than zero/i);
  });

  it("refuses a fractional sublet length", () => {
    expect(() =>
      validateDraftListingInput(
        draft({ rentalDuration: "sublet", subletMonths: 2.5 }),
      ),
    ).toThrow(/whole number/i);
  });

  // The route deliberately does not default this field, so an omitted duration
  // arrives here as undefined. It must be refused rather than assumed annual —
  // assuming it is the bug this slice exists to remove.
  it("refuses a missing duration rather than assuming annual", () => {
    expect(() =>
      validateDraftListingInput(
        draft({ rentalDuration: undefined as never }),
      ),
    ).toThrow(/how long/i);
  });

  it("refuses a duration that is not one of the three", () => {
    expect(() =>
      validateDraftListingInput(
        draft({ rentalDuration: "weekly" as never }),
      ),
    ).toThrow(/how long/i);
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
});
