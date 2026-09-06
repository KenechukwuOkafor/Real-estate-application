import { describe, expect, it } from "vitest";

import {
  type AgentListingCard,
  needsAttention,
  parseListingFilters,
  sortCards,
  subletTermPassed,
  tooNewToJudge,
} from "@/features/agents/listing-cards";

const NOW = new Date("2026-09-06T12:00:00Z");

function card(overrides: Partial<AgentListingCard> = {}): AgentListingCard {
  return {
    approvedAt: "2026-01-01T00:00:00Z",
    area: "Odenigbo",
    city: "Nsukka",
    id: "listing-1",
    imageCount: 3,
    priceNaira: 250000,
    publicUuid: "00000000-0000-4000-8000-000000000001",
    rejectionReason: null,
    rentalDuration: "yearly",
    rentedAt: null,
    requests: 0,
    revision: null,
    slug: "a-listing",
    status: "approved",
    subletMonths: null,
    subletTermPassed: false,
    title: "A listing",
    tooNew: false,
    viewers: 0,
    ...overrides,
  };
}

describe("subletTermPassed", () => {
  const sublet = {
    rental_duration: "sublet",
    status: "approved",
    sublet_months: 6,
  };

  it("flags a six-month sublet still live after seven months", () => {
    expect(
      subletTermPassed({ ...sublet, approved_at: "2026-02-01T00:00:00Z" }, NOW),
    ).toBe(true);
  });

  it("says nothing while the term is still running", () => {
    expect(
      subletTermPassed({ ...sublet, approved_at: "2026-06-01T00:00:00Z" }, NOW),
    ).toBe(false);
  });

  /**
   * Calendar months, not 30-day blocks. 180 days drifts several days short of
   * six calendar months, which would flag a listing EARLY — the direction that
   * costs the agent's trust in the signal, since they can see the term has not
   * run out yet.
   */
  it("counts calendar months rather than 30-day blocks", () => {
    // Six calendar months from 1 March is 1 September. 180 days is 28 August.
    // On 31 August the term has not passed.
    expect(
      subletTermPassed(
        { ...sublet, approved_at: "2026-03-01T00:00:00Z" },
        new Date("2026-08-31T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("ignores yearly and monthly listings entirely", () => {
    expect(
      subletTermPassed(
        {
          approved_at: "2020-01-01T00:00:00Z",
          rental_duration: "yearly",
          status: "approved",
          sublet_months: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  /**
   * A rented sublet is off the market and misleading nobody, so flagging it
   * would be noise on a listing the agent has already dealt with.
   */
  it("ignores a sublet that is already off the market", () => {
    expect(
      subletTermPassed(
        { ...sublet, approved_at: "2026-01-01T00:00:00Z", status: "rented" },
        NOW,
      ),
    ).toBe(false);
  });

  it("says nothing about a listing that was never approved", () => {
    expect(
      subletTermPassed({ ...sublet, approved_at: null, status: "draft" }, NOW),
    ).toBe(false);
  });
});

describe("tooNewToJudge", () => {
  /**
   * The sort that answers "which of my listings is dead" is requests
   * ascending, which puts a four-day-old listing at the very top with zero
   * requests. A zero cannot say "not measured yet"; this can.
   */
  it("protects a listing live for less than the window", () => {
    expect(
      tooNewToJudge(
        { approved_at: "2026-09-02T00:00:00Z", status: "approved" },
        NOW,
      ),
    ).toBe(true);
  });

  it("stops protecting it once its numbers cover the same span as everyone's", () => {
    expect(
      tooNewToJudge(
        { approved_at: "2026-07-01T00:00:00Z", status: "approved" },
        NOW,
      ),
    ).toBe(false);
  });

  it("does not apply to a draft, whose zero is not about age", () => {
    expect(
      tooNewToJudge({ approved_at: null, status: "draft" }, NOW),
    ).toBe(false);
  });
});

describe("needsAttention", () => {
  it("flags a rejected listing", () => {
    expect(needsAttention(card({ status: "rejected" }))).toBe(true);
  });

  /**
   * The case with no other visible symptom, and the reason this signal belongs
   * on the listing rather than only in a queue elsewhere: the listing is live
   * and looks entirely normal while the correction to it was refused.
   */
  it("flags a live listing whose edit was refused", () => {
    expect(
      needsAttention(
        card({
          revision: {
            listingId: "listing-1",
            listingTitle: "A listing",
            reason: "The price does not include the agency fee.",
            reviewedAt: "2026-09-01T00:00:00Z",
            status: "rejected",
            submittedAt: "2026-08-30T00:00:00Z",
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not flag a listing merely waiting on a moderator", () => {
    expect(
      needsAttention(
        card({
          revision: {
            listingId: "listing-1",
            listingTitle: "A listing",
            reason: null,
            reviewedAt: null,
            status: "pending_review",
            submittedAt: "2026-09-01T00:00:00Z",
          },
        }),
      ),
    ).toBe(false);
  });

  it("flags a sublet whose advertised term has run out", () => {
    expect(needsAttention(card({ subletTermPassed: true }))).toBe(true);
  });

  it("flags a listing people see and pass over", () => {
    expect(needsAttention(card({ requests: 0, viewers: 40 }))).toBe(true);
  });

  it("does not flag one that is converting", () => {
    expect(needsAttention(card({ requests: 3, viewers: 40 }))).toBe(false);
  });

  /**
   * A listing live for three days with views and no requests has not failed at
   * anything yet, and telling the agent it needs attention would be telling
   * them to fix something that is working.
   */
  it("holds off on a listing too new to judge", () => {
    expect(
      needsAttention(card({ requests: 0, tooNew: true, viewers: 40 })),
    ).toBe(false);
  });

  it("does not flag a listing nobody has seen", () => {
    // Real, but a different problem, and not one the agent can fix by editing
    // this listing. It reads as "Not being seen" rather than as work.
    expect(needsAttention(card({ requests: 0, viewers: 0 }))).toBe(false);
  });
});

describe("sortCards", () => {
  it("opens in the order the page has always used", () => {
    const sorted = sortCards(
      [
        card({ id: "live", status: "approved", title: "Live" }),
        card({ id: "draft", status: "draft", title: "Draft" }),
        card({ id: "rejected", status: "rejected", title: "Rejected" }),
      ],
      "attention",
    );

    expect(sorted.map((item) => item.id)).toEqual(["rejected", "live", "draft"]);
  });

  it("answers which listing is dead", () => {
    const sorted = sortCards(
      [
        card({ id: "busy", requests: 9, viewers: 100 }),
        card({ id: "dead", requests: 0, viewers: 80 }),
        card({ id: "quiet", requests: 2, viewers: 30 }),
      ],
      "requests_asc",
    );

    expect(sorted[0].id).toBe("dead");
  });

  /**
   * Among listings with equally few requests, the one more people saw is the
   * more interesting failure: it is being found and passed over, rather than
   * not being found at all. Those are different problems with different fixes.
   */
  it("puts the more-seen failure above the unseen one", () => {
    const sorted = sortCards(
      [
        card({ id: "unseen", requests: 0, viewers: 2 }),
        card({ id: "passed-over", requests: 0, viewers: 90 }),
      ],
      "requests_asc",
    );

    expect(sorted.map((item) => item.id)).toEqual(["passed-over", "unseen"]);
  });

  /**
   * Two listings with equal keys swapping places between renders reads as data
   * changing when nothing has. Every comparator falls through to a stable tail.
   */
  it("is a total order, so equal keys do not shuffle", () => {
    const equal = [
      card({ id: "b", title: "Beta" }),
      card({ id: "a", title: "Alpha" }),
      card({ id: "c", title: "Gamma" }),
    ];

    for (const key of ["attention", "requests_asc", "viewers_desc", "newest"] as const) {
      const first = sortCards(equal, key).map((item) => item.id);
      const again = sortCards([...equal].reverse(), key).map((item) => item.id);

      expect(again).toEqual(first);
    }
  });

  it("does not mutate its input", () => {
    const cards = [card({ id: "a", requests: 5 }), card({ id: "b", requests: 1 })];
    sortCards(cards, "requests_asc");

    expect(cards.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("parseListingFilters", () => {
  const KNOWN = ["rejected", "in_review", "live", "taken", "draft", "removed"];

  function parse(query: string) {
    return parseListingFilters(new URLSearchParams(query), KNOWN);
  }

  it("defaults to everything visible except removed, in the usual order", () => {
    expect(parse("")).toEqual({
      attentionOnly: false,
      groups: [],
      showRemoved: false,
      sort: "attention",
    });
  });

  it("reads groups, the attention filter and the sort", () => {
    expect(parse("groups=live,taken&attention=1&sort=requests_asc")).toEqual({
      attentionOnly: true,
      groups: ["live", "taken"],
      showRemoved: false,
      sort: "requests_asc",
    });
  });

  /**
   * A URL that filters TO removed listings while the removed toggle stays off
   * resolves to an empty page for a reason nothing on screen explains. The two
   * controls are separate, so this is the one place they have to agree.
   */
  it("turns on the removed toggle when the filter asks for removed listings", () => {
    expect(parse("groups=removed").showRemoved).toBe(true);
  });

  /**
   * A hand-edited or stale URL must degrade to a usable page. Passing an
   * unknown group through would filter every listing out, and the agent would
   * be looking at an empty list of inventory they know they have.
   */
  it("drops group keys it does not recognise", () => {
    expect(parse("groups=live,banana,removed").groups).toEqual(["live", "removed"]);
    expect(parse("groups=banana").groups).toEqual([]);
  });

  it("falls back to the default sort rather than an unknown one", () => {
    expect(parse("sort=price_descending").sort).toBe("attention");
  });

  it("ignores the focus parameter, which is not a filter", () => {
    // focus is honoured by the list itself, which shows that listing whatever
    // the filters say. Treating it as a filter would do the opposite.
    expect(parse("focus=abc")).toEqual({
      attentionOnly: false,
      groups: [],
      showRemoved: false,
      sort: "attention",
    });
  });
});
