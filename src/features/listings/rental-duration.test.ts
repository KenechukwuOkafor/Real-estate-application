/**
 * Replaces rent-period.test.ts, which asserted `RENT_PERIOD_LABEL === "per
 * year"` — a test that pinned the bug in place. It would have failed the moment
 * anyone made the label correct, which is the opposite of what a test should do.
 */
import { describe, expect, it } from "vitest";

import {
  formatListingTypeLine,
  formatRentalDuration,
  formatRentalPriceHeading,
} from "@/features/listings/rental-duration";

describe("formatRentalDuration", () => {
  it("reads a yearly listing as a rate", () => {
    expect(formatRentalDuration("yearly", null)).toBe("per year");
  });

  it("reads a monthly listing as a rate", () => {
    expect(formatRentalDuration("monthly", null)).toBe("per month");
  });

  it("reads a sublet as its length", () => {
    expect(formatRentalDuration("sublet", 4)).toBe("4 months");
  });

  it("says month, singular, for a one month sublet", () => {
    expect(formatRentalDuration("sublet", 1)).toBe("1 month");
  });

  it("is lower case so it reads as a suffix beside a price", () => {
    for (const label of [
      formatRentalDuration("yearly", null),
      formatRentalDuration("monthly", null),
    ]) {
      expect(label).toBe(label.toLowerCase());
    }
  });

  // Unreachable through the database, which refuses a sublet with no count.
  // Asserted so a component rendering unvalidated data degrades to something
  // true rather than to "null months".
  it("degrades to 'sublet' when a month count is somehow missing", () => {
    expect(formatRentalDuration("sublet", null)).toBe("sublet");
  });
});

describe("formatRentalPriceHeading", () => {
  it.each([
    ["yearly", "Annual price"],
    ["monthly", "Monthly price"],
    ["sublet", "Sublet price"],
  ] as const)("heads a %s listing as %s", (duration, expected) => {
    expect(formatRentalPriceHeading(duration)).toBe(expected);
  });
});

describe("formatListingTypeLine", () => {
  it("marks a sublet, because it is a different kind of offer", () => {
    expect(formatListingTypeLine("Self Contain", "sublet")).toBe(
      "Self Contain · Sublet",
    );
  });

  it.each(["yearly", "monthly"] as const)(
    "adds nothing to an ordinary %s tenancy",
    (duration) => {
      expect(formatListingTypeLine("Self Contain", duration)).toBe("Self Contain");
    },
  );
});
