/**
 * Listings grouped by what the agent has to do about them.
 *
 * A flat list sorted by date answers "what did I do recently". The question an
 * agent actually arrives with is "where is my listing stuck and what do I do
 * about it", and status is what answers that — so status is what the page is
 * organised by.
 *
 * The ORDER is the substance here, and it is by urgency rather than by
 * lifecycle: rejected first because it is the only group where a listing is
 * stopped and only the agent can unstick it. Live listings come after the ones
 * that need work, because a live listing needs nothing.
 *
 * Pure, so the ordering and the empty-group rule can be tested without
 * rendering. A group that silently swallows a status is how a listing goes
 * missing from the only screen that lists it — see `assertEveryStatusGrouped`.
 */

export type GroupKey =
  | "rejected"
  | "in_review"
  | "live"
  | "draft"
  | "closed";

export type ListingGroup<T> = {
  /** Said when the group is empty, or null to hide the group entirely. */
  emptyDetail: string | null;
  key: GroupKey;
  listings: T[];
  /** One line under the heading explaining what this state means. */
  subtitle: string;
  title: string;
};

const GROUP_ORDER: Array<{
  emptyDetail: string | null;
  key: GroupKey;
  statuses: string[];
  subtitle: string;
  title: string;
}> = [
  {
    emptyDetail: null,
    key: "rejected",
    statuses: ["rejected"],
    subtitle: "A moderator asked for changes. Nothing happens until you resubmit.",
    title: "Needs your attention",
  },
  {
    emptyDetail: null,
    key: "in_review",
    // flagged and under_dispute are grouped here rather than under "live"
    // because in both the agent is waiting on us, which is the same experience
    // as a first review even though the cause is different.
    statuses: ["pending_review", "flagged", "under_dispute"],
    subtitle: "With a moderator. You do not need to do anything.",
    title: "Waiting on us",
  },
  {
    emptyDetail: "Nothing is live yet.",
    key: "live",
    statuses: ["approved"],
    subtitle: "Visible to seekers and accepting inspection requests.",
    title: "Live",
  },
  {
    emptyDetail: "No drafts.",
    key: "draft",
    statuses: ["draft"],
    subtitle: "Free and unlimited. Not visible to anyone until you submit.",
    title: "Drafts",
  },
  {
    emptyDetail: null,
    key: "closed",
    statuses: ["archived"],
    subtitle: "Taken down and not restorable. List the property again to bring it back.",
    title: "Taken down",
  },
];

/**
 * Every status this file knows how to place.
 *
 * Exported so a test can compare it against the database enum. A status added
 * to the schema and not added here would vanish from this page — present in the
 * data, absent from the only screen that shows it, and not an error anywhere.
 */
export const GROUPED_STATUSES = GROUP_ORDER.flatMap((group) => group.statuses);

export function groupAgentListings<T extends { status: string }>(
  listings: T[],
): Array<ListingGroup<T>> {
  return GROUP_ORDER.map((group) => ({
    emptyDetail: group.emptyDetail,
    key: group.key,
    listings: listings.filter((listing) => group.statuses.includes(listing.status)),
    subtitle: group.subtitle,
    title: group.title,
  })).filter(
    // An empty group is dropped unless it has something to say. "Needs your
    // attention (0)" is a heading that exists only to reassure, and it pushes
    // the groups that do have work in them further down the phone screen.
    (group) => group.listings.length > 0 || group.emptyDetail !== null,
  );
}
