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
  SUBLET_MONTHS_PLAUSIBLE_MAX,
  subletLengthWarning,
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

describe("subletLengthWarning", () => {
  it("says nothing about an ordinary sublet", () => {
    for (const months of [1, 3, 6, 12]) {
      expect(subletLengthWarning(months)).toBeNull();
    }
  });

  // A sublet longer than a year is unusual but real — an academic year plus a
  // summer, a posting that runs long. Warning on those would train agents to
  // dismiss the warning, which is how a warning stops working.
  it("says nothing at the plausible maximum", () => {
    expect(subletLengthWarning(SUBLET_MONTHS_PLAUSIBLE_MAX)).toBeNull();
  });

  it("warns once past it", () => {
    expect(subletLengthWarning(SUBLET_MONTHS_PLAUSIBLE_MAX + 1)).toContain("check this");
  });

  it("puts an absurd value in years, where the mistake is obvious", () => {
    expect(subletLengthWarning(500)).toContain("41 years");
  });

  // A warning, never a block. The wording has to say so, because an agent who
  // reads it as a rejection will change a correct value to get past it.
  it("says the listing can still be published", () => {
    expect(subletLengthWarning(500)).toContain("still publish");
  });

  it("says nothing when there is no month count", () => {
    expect(subletLengthWarning(null)).toBeNull();
  });
});
