import { describe, expect, it } from "vitest";

import {
  agentStatusBand,
  type StatusBandInput,
} from "@/features/agents/status-band";

function input(overrides: Partial<StatusBandInput> = {}): StatusBandInput {
  return {
    activeSubscriptionPlan: null,
    freeListingQuota: 0,
    incomingRequests: 0,
    listings: [],
    verificationStatus: "not_submitted",
    ...overrides,
  };
}

function fact(band: ReturnType<typeof agentStatusBand>, label: string) {
  return band.facts.find((item) => item.label === label)!;
}

describe("agentStatusBand", () => {
  it("always reports the same three facts, in the same order", () => {
    // The order is the claim: these decide what an agent can do today, so they
    // are not sorted by whichever happens to be interesting.
    expect(agentStatusBand(input()).facts.map((item) => item.label)).toEqual([
      "Verification",
      "Submission slots",
      "Inspection requests",
    ]);
  });

  describe("verification", () => {
    it.each([
      ["verified", "Verified", "good"],
      ["pending_review", "Being checked", "neutral"],
      ["rejected", "Not accepted", "blocked"],
      ["suspended", "Suspended", "blocked"],
      ["not_submitted", "Not started", "attention"],
    ])("reports %s as %s", (status, value, tone) => {
      const result = fact(agentStatusBand(input({ verificationStatus: status })), "Verification");

      expect(result.value).toBe(value);
      expect(result.tone).toBe(tone);
    });

    it("does not let a rejection read as merely unfinished", () => {
      // These are one boolean to the entitlement check and three quite
      // different situations to a person. Collapsing them is what made the old
      // copy say the same unhelpful thing to all three.
      const rejected = fact(agentStatusBand(input({ verificationStatus: "rejected" })), "Verification");
      const notStarted = fact(agentStatusBand(input({ verificationStatus: "not_submitted" })), "Verification");

      expect(rejected.value).not.toBe(notStarted.value);
      expect(rejected.tone).not.toBe(notStarted.tone);
      expect(rejected.detail).toMatch(/again/i);
    });

    it("offers no action on a suspended account", () => {
      // There is nothing an agent can do here, and a "fix this" link would
      // send them to a page that cannot help.
      expect(
        fact(agentStatusBand(input({ verificationStatus: "suspended" })), "Verification").href,
      ).toBeUndefined();
    });

    it("treats an unrecognised status as not started rather than crashing", () => {
      expect(
        fact(agentStatusBand(input({ verificationStatus: "something_new" })), "Verification").value,
      ).toBe("Not started");
    });
  });

  describe("submission slots", () => {
    it("reports a subscription as unlimited", () => {
      const result = fact(
        agentStatusBand(input({ activeSubscriptionPlan: "pro", freeListingQuota: 0 })),
        "Submission slots",
      );

      expect(result.value).toBe("Unlimited");
      expect(result.tone).toBe("good");
    });

    it("lets a subscription outrank a spent quota", () => {
      // A subscriber with zero free slots is not out of slots. Reading the
      // quota first would have told them they were.
      expect(
        fact(
          agentStatusBand(input({ activeSubscriptionPlan: "basic", freeListingQuota: 0 })),
          "Submission slots",
        ).value,
      ).toBe("Unlimited");
    });

    it("counts remaining free slots", () => {
      expect(
        fact(agentStatusBand(input({ freeListingQuota: 2 })), "Submission slots").value,
      ).toBe("2 left");
    });

    it("does not treat running out as a blockage", () => {
      // Nothing an agent already has is affected. A red panel here would be
      // alarming out of proportion to what actually happened.
      const result = fact(agentStatusBand(input()), "Submission slots");

      expect(result.value).toBe("None left");
      expect(result.tone).toBe("attention");
      expect(result.detail).toMatch(/not affected/i);
    });
  });

  describe("inspection requests", () => {
    it("says plainly when nothing is waiting", () => {
      const result = fact(agentStatusBand(input()), "Inspection requests");

      expect(result.value).toBe("None waiting");
      expect(result.tone).toBe("neutral");
      expect(result.href).toBeUndefined();
    });

    it("links straight to the queue when something is", () => {
      const result = fact(
        agentStatusBand(input({ incomingRequests: 3 })),
        "Inspection requests",
      );

      expect(result.value).toBe("3 waiting");
      expect(result.href).toBe("/agent/inspections");
    });
  });

  describe("attention items", () => {
    it("carries the moderator's actual reason, not a summary of it", () => {
      // The sentence that says what to change is the entire value of a
      // rejection. Replacing it with "needs changes" and a link is how a
      // listing gets resubmitted unchanged.
      const band = agentStatusBand(
        input({
          listings: [
            {
              id: "abc",
              rejection_reason: "The third photo shows a different property.",
              status: "rejected",
              title: "Lodge room",
            },
          ],
        }),
      );

      expect(band.attention).toHaveLength(1);
      expect(band.attention[0].detail).toBe(
        "The third photo shows a different property.",
      );
      expect(band.attention[0].href).toBe("/agent/listings/abc/edit");
    });

    it("still says something useful when no reason was recorded", () => {
      const band = agentStatusBand(
        input({
          listings: [
            { id: "abc", rejection_reason: "   ", status: "rejected", title: "Lodge" },
          ],
        }),
      );

      expect(band.attention[0].detail).toMatch(/asked for changes/i);
    });

    it("raises nothing for listings that are not stuck", () => {
      const band = agentStatusBand(
        input({
          listings: [
            { id: "a", rejection_reason: null, status: "approved", title: "A" },
            { id: "b", rejection_reason: null, status: "draft", title: "B" },
            { id: "c", rejection_reason: null, status: "pending_review", title: "C" },
            { id: "d", rejection_reason: null, status: "archived", title: "D" },
          ],
        }),
      );

      expect(band.attention).toEqual([]);
    });
  });
});
