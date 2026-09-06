import { describe, expect, it } from "vitest";

import {
  DEFAULT_HIDDEN_GROUPS,
  GROUPED_STATUSES,
  groupKeyForStatus,
  groupRank,
  LISTING_GROUPS,
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
 *
 * This is the guard that caught `rented`, and it is the reason this file
 * survived the page going from sections to filter chips unchanged in substance.
 */
const ALL_STATUSES: Record<ListingStatus, true> = {
  approved: true,
  archived: true,
  draft: true,
  flagged: true,
  pending_review: true,
  rejected: true,
  rented: true,
  under_dispute: true,
};

describe("listing groups", () => {
  it("places every status the schema defines", () => {
    // The failure this prevents is not a crash. A status nobody grouped simply
    // does not render — the listing exists, the agent's list does not show it,
    // and nothing errors. This is the only place that would notice.
    const ungrouped = Object.keys(ALL_STATUSES).filter(
      (status) => !GROUPED_STATUSES.includes(status),
    );

    expect(ungrouped).toEqual([]);
  });

  it("claims no status twice", () => {
    // Two groups claiming one status would put the same listing behind two
    // chips and give it two different ranks in the default sort.
    const seen = new Set<string>();
    const duplicated = GROUPED_STATUSES.filter((status) => {
      if (seen.has(status)) return true;
      seen.add(status);
      return false;
    });

    expect(duplicated).toEqual([]);
  });

  it("puts rejected listings first, above everything else", () => {
    // The ordering is the feature. A rejected listing is the only kind that is
    // stopped and that only the agent can unstick.
    expect(LISTING_GROUPS[0].key).toBe("rejected");
    expect(groupRank("rejected")).toBe(0);
  });

  it("ranks work to do above listings that need nothing", () => {
    expect(groupRank("rejected")).toBeLessThan(groupRank("approved"));
    expect(groupRank("pending_review")).toBeLessThan(groupRank("approved"));
  });

  it("keeps live and taken adjacent, above drafts", () => {
    // The two states of real inventory. An agent holds them in mind together:
    // what is earning, and what is between tenants. A draft is work in
    // progress, not property on the books.
    expect(groupRank("rented")).toBe(groupRank("approved") + 1);
    expect(groupRank("rented")).toBeLessThan(groupRank("draft"));
  });

  it("groups flagged and disputed listings as waiting on us", () => {
    // Different cause, same experience: the agent is waiting on a moderator and
    // there is nothing for them to do.
    expect(groupKeyForStatus("flagged")).toBe("in_review");
    expect(groupKeyForStatus("under_dispute")).toBe("in_review");
    expect(groupKeyForStatus("pending_review")).toBe("in_review");
  });

  it("separates taken from removed", () => {
    // The distinction this whole slice exists for. One is turnover and free;
    // the other is permanent and costs a slot. Sharing a chip would undo it.
    expect(groupKeyForStatus("rented")).toBe("taken");
    expect(groupKeyForStatus("archived")).toBe("removed");
  });

  it("hides only removed listings by default", () => {
    expect([...DEFAULT_HIDDEN_GROUPS]).toEqual(["removed"]);
  });

  /**
   * An unknown status must not be promoted to the top of the agent's
   * attention. It is a bug, and the response to a bug is not to make it the
   * first thing they see and act on.
   */
  it("sorts a status it has never heard of last", () => {
    expect(groupKeyForStatus("something_new")).toBeNull();
    expect(groupRank("something_new")).toBeGreaterThan(groupRank("archived"));
  });
});
