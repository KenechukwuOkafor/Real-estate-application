import { describe, expect, it } from "vitest";

import {
  isReadyToSubmit,
  MINIMUM_LISTING_IMAGES,
  submitReadiness,
  type SubmitReadinessInput,
} from "@/features/agents/submit-readiness";

function input(overrides: Partial<SubmitReadinessInput> = {}): SubmitReadinessInput {
  return {
    activeImageCount: 3,
    area: "Odenigbo",
    freeListingQuota: 2,
    hasActiveSubscription: false,
    priceNaira: 250000,
    verificationStatus: "verified",
    ...overrides,
  };
}

const labels = (i: SubmitReadinessInput) => submitReadiness(i).map((x) => x.label);
const unmet = (i: SubmitReadinessInput) => submitReadiness(i).filter((x) => !x.met);

describe("submitReadiness", () => {
  it("reports nothing outstanding when every gate passes", () => {
    expect(isReadyToSubmit(submitReadiness(input()))).toBe(true);
    expect(unmet(input())).toEqual([]);
  });

  /**
   * The reason this exists. Five gates could each refuse a submission and the
   * agent saw one red box, so they could not tell which had fired. Each gate
   * must be separately visible.
   */
  it("names each gate separately when several are outstanding", () => {
    const items = unmet(
      input({
        activeImageCount: 0,
        freeListingQuota: 0,
        verificationStatus: "not_submitted",
      }),
    );

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.label)).toEqual([
      `${MINIMUM_LISTING_IMAGES} photos added`,
      "Identity verified",
      "Submission slot available",
    ]);
  });

  describe("photos", () => {
    it("counts progress rather than only refusing", () => {
      const [photos] = unmet(input({ activeImageCount: 2 }));

      expect(photos.hint).toContain("2 added so far");
      expect(photos.hint).toContain("1 more");
    });

    it("says why three, not just that three are needed", () => {
      const [photos] = unmet(input({ activeImageCount: 0 }));

      expect(photos.hint?.toLowerCase()).toContain("more enquiries");
    });

    it("is met at exactly the minimum", () => {
      expect(unmet(input({ activeImageCount: MINIMUM_LISTING_IMAGES }))).toEqual([]);
    });
  });

  describe("verification", () => {
    /**
     * The sharpest copy case in the slice. A pending review is not a failure by
     * the agent — they are waiting on us — and the copy must not read as an
     * instruction to them.
     */
    it("tells an agent under review that nothing is required of them", () => {
      const [item] = unmet(input({ verificationStatus: "pending_review" }));

      expect(item.label).toContain("in review");
      expect(item.hint?.toLowerCase()).toContain("nothing for you to do");
    });

    it("distinguishes never-started from in-review from rejected", () => {
      const hints = (["not_submitted", "pending_review", "rejected"] as const).map(
        (status) => unmet(input({ verificationStatus: status }))[0]?.hint,
      );

      // Three different states must not produce one indistinguishable sentence.
      expect(new Set(hints).size).toBe(3);
    });

    it("treats a suspended account as ours to resolve, not theirs", () => {
      const [item] = unmet(input({ verificationStatus: "suspended" }));

      expect(item.hint?.toLowerCase()).toContain("contact us");
    });
  });

  describe("entitlement", () => {
    it("passes on quota alone", () => {
      expect(unmet(input({ freeListingQuota: 1 }))).toEqual([]);
    });

    it("passes on a subscription with no quota at all", () => {
      expect(
        unmet(input({ freeListingQuota: 0, hasActiveSubscription: true })),
      ).toEqual([]);
    });

    it("says so differently when a subscription is what covers it", () => {
      expect(labels(input({ hasActiveSubscription: true }))).toContain(
        "Covered by your subscription",
      );
    });

    it("is outstanding with neither", () => {
      const [item] = unmet(input({ freeListingQuota: 0 }));

      expect(item.label).toBe("Submission slot available");
    });
  });

  describe("details", () => {
    it("is outstanding when the area is blank", () => {
      expect(unmet(input({ area: "   " }))[0]?.label).toBe("Price and area set");
    });

    it("is outstanding when the price is zero", () => {
      expect(unmet(input({ priceNaira: 0 }))[0]?.label).toBe("Price and area set");
    });
  });

  /**
   * Rule two, asserted across every hint this function can produce: the copy
   * never tells an agent they did something wrong.
   */
  it("never blames the agent, in any state", () => {
    const states: Partial<SubmitReadinessInput>[] = [
      { activeImageCount: 0 },
      { activeImageCount: 1 },
      { area: "" },
      { priceNaira: 0 },
      { freeListingQuota: 0 },
      { verificationStatus: "not_submitted" },
      { verificationStatus: "pending_review" },
      { verificationStatus: "rejected" },
      { verificationStatus: "suspended" },
    ];

    for (const state of states) {
      for (const item of submitReadiness(input(state))) {
        const text = `${item.label} ${item.hint ?? ""}`.toLowerCase();

        expect(text).not.toMatch(/\b(invalid|failed|failure|error|you must|denied)\b/);
        expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
      }
    }
  });
});
