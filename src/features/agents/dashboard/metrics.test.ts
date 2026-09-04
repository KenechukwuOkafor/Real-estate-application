/**
 * The dashboard numbers.
 *
 * Every case here is one an agent would act on, and most were chosen because
 * the obvious implementation gets them backwards.
 */
import { describe, expect, it } from "vitest";

import {
  dashboardState,
  deltaPercent,
  formatReplyTime,
  medianReplyMinutes,
  perListingRows,
  type RequestRow,
  requestsInWindow,
  responseRate,
} from "@/features/agents/dashboard/metrics";

const NOW = new Date("2026-09-04T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function request(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    completion_deadline: null,
    expires_at: new Date(NOW.getTime() + 40 * HOUR).toISOString(),
    listing_id: "listing-1",
    requested_at: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    responded_at: null,
    status: "requested",
    ...overrides,
  };
}

const answered = () =>
  request({
    responded_at: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    status: "accepted",
  });

/** Asked three days ago, deadline passed, never answered. */
const ignored = () =>
  request({
    expires_at: new Date(NOW.getTime() - 24 * HOUR).toISOString(),
    requested_at: new Date(NOW.getTime() - 72 * HOUR).toISOString(),
    status: "requested",
  });

describe("responseRate", () => {
  it("scores an agent who ignored everything at 0%, not 100%", () => {
    // The defect this function exists to prevent. An ignored request's stored
    // status says 'requested' forever, so a denominator built from `status`
    // alone drops all three and reports a perfect record.
    const result = responseRate([ignored(), ignored(), ignored()], NOW);

    expect(result.answerable).toBe(3);
    expect(result.answered).toBe(0);
    expect(result.rate).toBe(0);
  });

  it("does not count a request that is still inside its window", () => {
    // Excluded from BOTH halves. Counting it as a miss would make the rate
    // fall every time a new request arrived, which would punish demand.
    const result = responseRate([answered(), request()], NOW);

    expect(result.answerable).toBe(1);
    expect(result.answered).toBe(1);
    expect(result.rate).toBe(1);
  });

  it("gives the raw fraction, because a percentage alone says nothing", () => {
    const result = responseRate([answered(), answered(), ignored()], NOW);

    expect(result.answered).toBe(2);
    expect(result.answerable).toBe(3);
    expect(result.rate).toBeCloseTo(2 / 3);
  });

  it("ignores a request the seeker withdrew before any answer", () => {
    // A seeker changing their mind is not evidence about the agent, either
    // way. Counting it as a miss would let a seeker damage the rate.
    const withdrawn = request({
      expires_at: new Date(NOW.getTime() - 24 * HOUR).toISOString(),
      status: "cancelled",
    });

    const result = responseRate([answered(), withdrawn], NOW);

    expect(result.answerable).toBe(1);
    expect(result.rate).toBe(1);
  });

  it("returns null rather than 0% when there is nothing answerable yet", () => {
    // A brand-new agent has not failed; they have no record. 0% would read as
    // failure and is the number most likely to be acted on wrongly.
    expect(responseRate([request()], NOW).rate).toBeNull();
    expect(responseRate([], NOW).rate).toBeNull();
  });
});

describe("medianReplyMinutes", () => {
  it("takes the middle value, not the average", () => {
    // One very late reply must not move the number an agent recognises.
    const rows = [
      request({ requested_at: iso(-10 * HOUR), responded_at: iso(-9 * HOUR), status: "accepted" }),
      request({ requested_at: iso(-10 * HOUR), responded_at: iso(-8 * HOUR), status: "accepted" }),
      request({ requested_at: iso(-500 * HOUR), responded_at: iso(-1 * HOUR), status: "accepted" }),
    ];

    // Sorted: 60, 120, 29940 minutes. Median 120; a mean would be ~10,040.
    expect(medianReplyMinutes(rows)).toBe(120);
  });

  it("averages the middle pair when the count is even", () => {
    const rows = [
      request({ requested_at: iso(-4 * HOUR), responded_at: iso(-3 * HOUR), status: "accepted" }),
      request({ requested_at: iso(-4 * HOUR), responded_at: iso(-1 * HOUR), status: "accepted" }),
    ];

    expect(medianReplyMinutes(rows)).toBe(120);
  });

  it("ignores requests that were never answered", () => {
    expect(medianReplyMinutes([answered(), ignored()])).toBe(60);
  });

  it("returns null when nothing has been answered", () => {
    expect(medianReplyMinutes([ignored()])).toBeNull();
  });

  function iso(offsetMs: number) {
    return new Date(NOW.getTime() + offsetMs).toISOString();
  }
});

describe("deltaPercent", () => {
  it("reports movement against the previous period", () => {
    expect(deltaPercent(12, 10)).toBe(20);
    expect(deltaPercent(8, 10)).toBe(-20);
  });

  it("returns null when the previous period was empty", () => {
    // Not 0, and not Infinity. There is no rate of change from nothing, and
    // printing one invents a trend from a single data point.
    expect(deltaPercent(3, 0)).toBeNull();
    expect(deltaPercent(0, 0)).toBeNull();
  });
});

describe("requestsInWindow", () => {
  it("buckets by when the request was asked, not when it was answered", () => {
    // Otherwise an agent could raise last month's number by replying late.
    const since = new Date(NOW.getTime() - 24 * HOUR);
    const old = request({
      requested_at: new Date(NOW.getTime() - 72 * HOUR).toISOString(),
      responded_at: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    });

    expect(requestsInWindow([old], since, NOW)).toHaveLength(0);
    expect(requestsInWindow([request()], since, NOW)).toHaveLength(1);
  });
});

describe("perListingRows", () => {
  const listings = [
    { id: "busy", status: "approved", title: "Busy" },
    { id: "watched", status: "approved", title: "Watched, unasked" },
    { id: "unseen", status: "approved", title: "Unseen" },
  ];

  const views = [
    { listing_id: "busy", viewed_on: "2026-09-01", viewers: 40 },
    { listing_id: "busy", viewed_on: "2026-09-02", viewers: 60 },
    { listing_id: "watched", viewed_on: "2026-09-02", viewers: 80 },
  ];

  it("separates a price problem from a visibility problem", () => {
    // The distinction the column exists for. 'watched' has plenty of viewers
    // and no requests — price or photos. 'unseen' has neither — nobody has
    // been shown it. Both would read as 0% if conversion were forced to zero.
    const rows = perListingRows({
      listings,
      requests: [request({ listing_id: "busy" }), request({ listing_id: "busy" })],
      views,
    });

    const byId = Object.fromEntries(rows.map((row) => [row.listingId, row]));

    expect(byId.busy.conversion).toBeCloseTo(2 / 100);
    expect(byId.watched.conversion).toBe(0);
    expect(byId.unseen.conversion).toBeNull();
  });

  it("sums a listing's viewers across days", () => {
    const rows = perListingRows({ listings, requests: [], views });

    expect(rows.find((row) => row.listingId === "busy")?.viewers).toBe(100);
  });

  it("orders by viewers so the most-seen listing is first", () => {
    const rows = perListingRows({ listings, requests: [], views });

    expect(rows.map((row) => row.listingId)).toEqual(["busy", "watched", "unseen"]);
  });
});

describe("dashboardState", () => {
  it("treats an agent with no listings as first run", () => {
    expect(dashboardState([])).toBe("first_run");
  });

  it("treats an agent whose listings are all archived as dormant", () => {
    // A third state. Not new — there is history worth reading — and not
    // active, because nothing can receive a view or a request, so every number
    // going forward is structurally zero.
    expect(dashboardState([{ status: "archived" }, { status: "archived" }])).toBe(
      "dormant",
    );
  });

  it("counts a rejected-only agent as dormant too", () => {
    expect(dashboardState([{ status: "rejected" }])).toBe("dormant");
  });

  it("counts an agent with only a draft as active, not dormant", () => {
    // A draft is work in progress. Telling someone mid-draft that nothing of
    // theirs is live is technically true and useless.
    expect(dashboardState([{ status: "draft" }])).toBe("active");
  });

  it("counts one live listing among archived ones as active", () => {
    expect(
      dashboardState([{ status: "archived" }, { status: "approved" }]),
    ).toBe("active");
  });
});

describe("formatReplyTime", () => {
  it("says so plainly when there is nothing to report", () => {
    expect(formatReplyTime(null)).toBe("No replies yet");
  });

  it("scales the unit to the size", () => {
    expect(formatReplyTime(45)).toBe("45 min");
    expect(formatReplyTime(90)).toBe("2 hr");
    expect(formatReplyTime(60 * 72)).toBe("3 days");
  });
});
