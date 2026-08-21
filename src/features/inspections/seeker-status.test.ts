import { describe, expect, it } from "vitest";

import type { InspectionStatus } from "@/features/inspections/expiry";
import {
  SEEKER_STATUS_CLASSES,
  SEEKER_STATUS_LABEL,
  seekerStatusDetail,
} from "@/features/inspections/seeker-status";

const ALL_STATUSES: InspectionStatus[] = [
  "requested",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "completed",
];

describe("seeker status copy", () => {
  it("covers every status, so no state renders a raw enum", () => {
    for (const status of ALL_STATUSES) {
      expect(SEEKER_STATUS_LABEL[status]).toBeTruthy();
      expect(SEEKER_STATUS_CLASSES[status]).toBeTruthy();
    }
  });

  describe("expiry, which is where the two sides diverge most", () => {
    it("does not blame the clock for a person's silence", () => {
      const label = SEEKER_STATUS_LABEL.expired.toLowerCase();

      // "Expired" is the agent's word for it, and it is accurate for them:
      // they let the window pass. To the seeker it describes a deadline where
      // what happened was a person not answering.
      expect(label).not.toContain("expired");
      expect(label).not.toContain("your request");
    });

    it("names who did not reply", () => {
      expect(seekerStatusDetail("expired", "Prime Homes Nsukka")).toBe(
        "Prime Homes Nsukka did not reply within 48 hours.",
      );
    });

    it("does not dress an agent's silence as the seeker's error", () => {
      // No alarm colour: the seeker did nothing wrong in this row.
      expect(SEEKER_STATUS_CLASSES.expired).not.toContain("red");
      expect(SEEKER_STATUS_CLASSES.expired).not.toContain("amber");
    });
  });

  it("says a decision was made, and by whom, when one was", () => {
    expect(seekerStatusDetail("declined", "Campus Keys")).toBe(
      "Campus Keys declined this request.",
    );
  });

  it("adds no sentence where the label already says it", () => {
    expect(seekerStatusDetail("accepted", "Campus Keys")).toBeNull();
    expect(seekerStatusDetail("requested", "Campus Keys")).toBeNull();
    expect(seekerStatusDetail("cancelled", "Campus Keys")).toBeNull();
    expect(seekerStatusDetail("completed", "Campus Keys")).toBeNull();
  });

  it("attributes the seeker's own action to them, not to the agent", () => {
    expect(SEEKER_STATUS_LABEL.cancelled.toLowerCase()).toContain("you");
  });
});
