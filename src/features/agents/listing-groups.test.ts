import { describe, expect, it } from "vitest";

import {
  GROUPED_STATUSES,
  groupAgentListings,
} from "@/features/agents/listing-groups";
import type { Database } from "@/types/database";

type ListingStatus = Database["public"]["Enums"]["listing_status"];

/**
 * Every status the schema defines, forced to stay complete by the type.
 *
 * A Record keyed on the enum rather than an array: TypeScript refuses a missing
 * key, so adding a status to the database and regenerating the types breaks the
 * build here until somebody decides where it belongs. An array would have
 * silently stayed short.
 */
const ALL_STATUSES: Record<ListingStatus, true> = {
  approved: true,
  archived: true,
  draft: true,
  flagged: true,
  pending_review: true,
  rejected: true,
  under_dispute: true,
};

function listing(status: string, id = status) {
  return { id, status };
}

describe("groupAgentListings", () => {
  it("places every status the schema defines", () => {
    // The failure this prevents is not a crash. A status nobody grouped simply
    // does not render — the listing exists, the agent's list does not show it,
    // and nothing errors. This is the only place that would notice.
    const ungrouped = Object.keys(ALL_STATUSES).filter(
      (status) => !GROUPED_STATUSES.includes(status),
    );

    expect(ungrouped).toEqual([]);
  });

  it("puts rejected listings first, above everything else", () => {
    // The ordering is the feature. A rejected listing is the only kind that is
    // stopped and that only the agent can unstick.
    const groups = groupAgentListings([
      listing("approved"),
      listing("draft"),
      listing("rejected"),
    ]);

    expect(groups[0].key).toBe("rejected");
    expect(groups[0].listings.map((item) => item.id)).toEqual(["rejected"]);
  });

  it("ranks work to do above listings that need nothing", () => {
    const keys = groupAgentListings([
      listing("approved"),
      listing("rejected"),
      listing("pending_review"),
    ]).map((group) => group.key);

    expect(keys.indexOf("rejected")).toBeLessThan(keys.indexOf("live"));
    expect(keys.indexOf("in_review")).toBeLessThan(keys.indexOf("live"));
  });

  it("hides an empty attention group rather than reassuring about it", () => {
    // "Needs your attention: 0" is a heading that exists only to say nothing,
    // and on a phone it pushes the real groups below the fold.
    const keys = groupAgentListings([listing("draft")]).map((group) => group.key);

    expect(keys).not.toContain("rejected");
    expect(keys).not.toContain("closed");
  });

  it("keeps an empty group that has something worth saying", () => {
    const groups = groupAgentListings([listing("draft")]);
    const live = groups.find((group) => group.key === "live");

    expect(live?.listings).toEqual([]);
    expect(live?.emptyDetail).toBe("Nothing is live yet.");
  });

  it("groups flagged and disputed listings as waiting on us", () => {
    // Different cause, same experience: the agent is waiting on a moderator and
    // there is nothing for them to do.
    const groups = groupAgentListings([
      listing("flagged"),
      listing("under_dispute"),
      listing("pending_review"),
    ]);

    expect(groups.find((group) => group.key === "in_review")?.listings).toHaveLength(3);
  });

  it("loses no listing and duplicates none", () => {
    const listings = Object.keys(ALL_STATUSES).map((status) => listing(status));
    const grouped = groupAgentListings(listings).flatMap((group) => group.listings);

    expect(grouped.map((item) => item.id).sort()).toEqual(
      listings.map((item) => item.id).sort(),
    );
  });
});
