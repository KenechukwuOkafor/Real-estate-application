/**
 * Statuses, gathered into the five things an agent actually distinguishes.
 *
 * This module used to slice the listings page into sections, and the page's
 * whole organising principle was status. That could not survive the question
 * the page now has to answer — "which of my listings is dead" — because
 * answering it means sorting every listing by requests ascending, and a sort
 * that only reorders within sections does not sort.
 *
 * So the sections became FILTER CHIPS over one flat list, and what is left here
 * is the mapping and the order. The order is unchanged and still the substance:
 * by urgency rather than lifecycle, rejected first because it is the only state
 * where a listing is stopped and only the agent can unstick it.
 *
 * `groupRank` is that same order as a number, which is what the default sort on
 * the page uses. The page therefore opens looking as it always did, and sorting
 * is something the agent chooses rather than something done to them.
 *
 * Pure, so the ordering and the completeness rule can be tested without
 * rendering. A status that no group claims is how a listing goes missing from
 * the only screen that lists it — see the ALL_STATUSES guard in the test.
 */

export type GroupKey =
  | "rejected"
  | "in_review"
  | "live"
  | "taken"
  | "draft"
  | "removed";

export type ListingGroup = {
  key: GroupKey;
  /** The chip's label. */
  title: string;
  /** One line explaining what this state means, shown when the chip is on. */
  subtitle: string;
  statuses: string[];
};

/**
 * Order matters and is by urgency, not lifecycle.
 *
 * `removed` is last and is the only group hidden by default on the page: an
 * archived listing is over, nothing can be done about it, and it is kept
 * reachable rather than shown.
 */
export const LISTING_GROUPS: readonly ListingGroup[] = [
  {
    key: "rejected",
    statuses: ["rejected"],
    subtitle: "A moderator asked for changes. Nothing happens until you resubmit.",
    title: "Needs you",
  },
  {
    // flagged and under_dispute sit here rather than under "live" because in
    // both the agent is waiting on us, which is the same experience as a first
    // review even though the cause is different.
    key: "in_review",
    statuses: ["pending_review", "flagged", "under_dispute"],
    subtitle: "With a moderator. You do not need to do anything.",
    title: "In review",
  },
  {
    key: "live",
    statuses: ["approved"],
    subtitle: "Visible to seekers and accepting inspection requests.",
    title: "Live",
  },
  {
    key: "taken",
    statuses: ["rented"],
    subtitle:
      "Off the market and costing you nothing. Mark one available when it frees up.",
    title: "Taken",
  },
  {
    key: "draft",
    statuses: ["draft"],
    subtitle: "Free and unlimited. Not visible to anyone until you submit.",
    title: "Drafts",
  },
  {
    key: "removed",
    statuses: ["archived"],
    subtitle:
      "Permanently removed. Listing one of these again means a new listing, and a submission slot.",
    title: "Removed",
  },
];

/**
 * Every status this file knows how to place.
 *
 * Exported so a test can compare it against the database enum. A status added
 * to the schema and not added here would vanish from this page — present in the
 * data, absent from the only screen that shows it, and not an error anywhere.
 * This is what caught `rented`.
 */
export const GROUPED_STATUSES = LISTING_GROUPS.flatMap((group) => group.statuses);

/** Hidden until asked for. See LISTING_GROUPS. */
export const DEFAULT_HIDDEN_GROUPS: readonly GroupKey[] = ["removed"];

export function groupKeyForStatus(status: string): GroupKey | null {
  return (
    LISTING_GROUPS.find((group) => group.statuses.includes(status))?.key ?? null
  );
}

/**
 * The default sort order, as a number.
 *
 * An unknown status sorts LAST rather than first. A status nobody has grouped
 * is a bug, and the page should not respond to a bug by promoting the affected
 * listing to the top of the agent's attention.
 */
export function groupRank(status: string): number {
  const index = LISTING_GROUPS.findIndex((group) =>
    group.statuses.includes(status),
  );

  return index === -1 ? LISTING_GROUPS.length : index;
}
