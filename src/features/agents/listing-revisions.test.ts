import { describe, expect, it } from "vitest";

import {
  latestRevisionPerListing,
  type RevisionRow,
  revisionSignals,
} from "@/features/agents/listing-revisions";

function revision(overrides: Partial<RevisionRow> & { submitted_at: string }): RevisionRow {
  return {
    listing_id: "listing-1",
    listings: { title: "A listing" },
    rejection_reason: null,
    reviewed_at: null,
    status: "rejected",
    ...overrides,
  };
}

describe("latestRevisionPerListing", () => {
  it("keeps the newest per listing", () => {
    const latest = latestRevisionPerListing([
      revision({ submitted_at: "2026-03-01T00:00:00Z" }),
      revision({ submitted_at: "2026-08-01T00:00:00Z" }),
      revision({ listing_id: "listing-2", submitted_at: "2026-01-01T00:00:00Z" }),
    ]);

    expect(latest.get("listing-1")?.submitted_at).toBe("2026-08-01T00:00:00Z");
    expect(latest.get("listing-2")?.submitted_at).toBe("2026-01-01T00:00:00Z");
  });

  /**
   * The repository orders descending TODAY. Depending on that would make this
   * silently wrong the day a second caller arrives with a different order, and
   * the symptom would be a stale action item rather than an error — which is
   * the kind of bug that survives for months.
   */
  it("does not depend on the input being sorted", () => {
    const ascending = latestRevisionPerListing([
      revision({ submitted_at: "2026-03-01T00:00:00Z" }),
      revision({ submitted_at: "2026-08-01T00:00:00Z" }),
    ]);
    const descending = latestRevisionPerListing([
      revision({ submitted_at: "2026-08-01T00:00:00Z" }),
      revision({ submitted_at: "2026-03-01T00:00:00Z" }),
    ]);

    expect(ascending.get("listing-1")?.submitted_at).toBe("2026-08-01T00:00:00Z");
    expect(descending.get("listing-1")?.submitted_at).toBe("2026-08-01T00:00:00Z");
  });
});

describe("revisionSignals", () => {
  /**
   * THE DEFECT THIS MODULE EXISTS FOR.
   *
   * The dashboard pushed an action item for every rejected revision ever
   * submitted. An agent refused in March, who then proposed a better change
   * that was approved in April, still saw the March refusal in September — an
   * action item for something already resolved, undismissable, one more row per
   * rejection forever.
   */
  it("goes quiet once the agent has proposed something newer", () => {
    const signals = revisionSignals([
      revision({
        rejection_reason: "The price does not include the agency fee.",
        reviewed_at: "2026-03-02T00:00:00Z",
        status: "rejected",
        submitted_at: "2026-03-01T00:00:00Z",
      }),
      revision({
        reviewed_at: "2026-04-02T00:00:00Z",
        status: "approved",
        submitted_at: "2026-04-01T00:00:00Z",
      }),
    ]);

    expect(signals.has("listing-1")).toBe(false);
  });

  it("still speaks when the refusal is the agent's most recent word", () => {
    const signals = revisionSignals([
      revision({
        reviewed_at: "2026-02-02T00:00:00Z",
        status: "approved",
        submitted_at: "2026-02-01T00:00:00Z",
      }),
      revision({
        rejection_reason: "The photos do not show the room.",
        reviewed_at: "2026-08-02T00:00:00Z",
        status: "rejected",
        submitted_at: "2026-08-01T00:00:00Z",
      }),
    ]);

    expect(signals.get("listing-1")).toMatchObject({
      reason: "The photos do not show the room.",
      status: "rejected",
    });
  });

  it("reports a pending revision as waiting rather than as work", () => {
    const signals = revisionSignals([
      revision({ status: "pending_review", submitted_at: "2026-08-01T00:00:00Z" }),
    ]);

    expect(signals.get("listing-1")?.status).toBe("pending_review");
    expect(signals.get("listing-1")?.reason).toBeNull();
  });

  /**
   * A rejection_reason left on a row is the PREVIOUS verdict. Carrying it onto
   * a pending revision would show the agent a refusal for a change that is
   * currently in front of a moderator and may well be approved.
   */
  it("never carries a stale reason onto a pending revision", () => {
    const signals = revisionSignals([
      revision({
        rejection_reason: "An old refusal.",
        status: "pending_review",
        submitted_at: "2026-08-01T00:00:00Z",
      }),
    ]);

    expect(signals.get("listing-1")?.reason).toBeNull();
  });

  it("says nothing about a listing whose latest change was applied", () => {
    const signals = revisionSignals([
      revision({ status: "approved", submitted_at: "2026-08-01T00:00:00Z" }),
    ]);

    expect(signals.size).toBe(0);
  });

  it("reports at most one signal per listing", () => {
    const signals = revisionSignals([
      revision({ status: "rejected", submitted_at: "2026-01-01T00:00:00Z" }),
      revision({ status: "rejected", submitted_at: "2026-02-01T00:00:00Z" }),
      revision({ status: "rejected", submitted_at: "2026-03-01T00:00:00Z" }),
    ]);

    expect(signals.size).toBe(1);
    expect(signals.get("listing-1")?.submittedAt).toBe("2026-03-01T00:00:00Z");
  });
});
