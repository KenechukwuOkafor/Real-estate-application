import { describe, expect, it } from "vitest";

import {
  listingRevisionDiff,
  type RevisionComparable,
} from "@/features/admin/listing-revision-diff";
import { formatRentalDuration } from "@/features/listings/rental-duration";

function listing(overrides: Partial<RevisionComparable> = {}): RevisionComparable {
  return {
    amenities: ["water", "prepaid_meter"],
    description: "A tidy flat.",
    priceNaira: 250000,
    rentalDuration: "yearly",
    subletMonths: null,
    title: "A Flat",
    ...overrides,
  };
}

describe("listingRevisionDiff", () => {
  it("shows nothing when nothing changed", () => {
    expect(listingRevisionDiff(listing(), listing())).toEqual([]);
  });

  it("shows only what changed", () => {
    const changes = listingRevisionDiff(
      listing(),
      listing({ priceNaira: 300000 }),
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].label).toBe("Price");
  });

  it("shows the old value beside the new one", () => {
    const [change] = listingRevisionDiff(listing(), listing({ priceNaira: 300000 }));

    expect(change.before).toContain("250,000");
    expect(change.after).toContain("300,000");
  });

  /**
   * The pairing established in 0019 reads as one change, not two. Separate rows
   * for "yearly became sublet" and "null became 6" present a pair as a
   * coincidence.
   */
  it("treats a duration and its month count as one change", () => {
    const changes = listingRevisionDiff(
      listing(),
      listing({ rentalDuration: "sublet", subletMonths: 6 }),
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].label).toBe("Duration");
    // Compared against the formatter rather than a literal. Pinning the words
    // here would make improving them a test failure, and would put a hardcoded
    // duration string back into the codebase — which a guard test catches, and
    // did.
    expect(changes[0].before).toBe(formatRentalDuration("yearly", null));
    expect(changes[0].after).toBe(formatRentalDuration("sublet", 6));
  });

  it("notices a month count changing on a sublet that stays a sublet", () => {
    const current = listing({ rentalDuration: "sublet", subletMonths: 6 });
    const proposed = listing({ rentalDuration: "sublet", subletMonths: 3 });

    expect(listingRevisionDiff(current, proposed)).toHaveLength(1);
  });

  it("reports several changes together", () => {
    const changes = listingRevisionDiff(
      listing(),
      listing({ description: "Rewritten.", priceNaira: 300000, title: "New Title" }),
    );

    expect(changes.map((change) => change.label)).toEqual([
      "Title",
      "Description",
      "Price",
    ]);
  });

  it("renders an emptied amenity list readably rather than as blank", () => {
    const [change] = listingRevisionDiff(listing(), listing({ amenities: [] }));

    expect(change.label).toBe("Amenities");
    expect(change.after).toBe("none");
  });

  /**
   * The diff is the whole review. A field that changes without appearing here
   * is a change that ships unreviewed, so every editable field must be covered.
   */
  it("covers every field a revision may carry", () => {
    const changes = listingRevisionDiff(
      listing(),
      listing({
        amenities: ["water"],
        description: "Rewritten.",
        priceNaira: 999,
        rentalDuration: "monthly",
        title: "New Title",
      }),
    );

    expect(changes.map((change) => change.label).sort()).toEqual([
      "Amenities",
      "Description",
      "Duration",
      "Price",
      "Title",
    ]);
  });
});
