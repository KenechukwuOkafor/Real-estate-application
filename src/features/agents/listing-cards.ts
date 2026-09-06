/**
 * A listing as the agent's list needs it: the row, its numbers, and the
 * signals derived from both.
 *
 * Pure and separate from the page for the reason the dashboard metrics are:
 * which inputs produce which verdict is a correctness question, and a signal
 * that is quietly wrong looks exactly like one that is right. An agent drops a
 * price, or deletes a listing, because of what this file decides.
 */

import { groupRank } from "@/features/agents/listing-groups";
import type { ListingRevisionSignal } from "@/features/agents/listing-revisions";

/** The window every number on a card is measured over. See METRIC_WINDOW_DAYS. */
export const METRIC_WINDOW_DAYS = 30;

export type AgentListingCard = {
  approvedAt: string | null;
  area: string;
  city: string;
  id: string;
  imageCount: number;
  priceNaira: number;
  publicUuid: string;
  rejectionReason: string | null;
  rentalDuration: string;
  rentedAt: string | null;
  requests: number;
  /** The proposed change that is still the agent's current word, if any. */
  revision: ListingRevisionSignal | null;
  slug: string;
  status: string;
  subletMonths: number | null;
  /** True when a sublet has been live longer than the term it advertises. */
  subletTermPassed: boolean;
  title: string;
  /**
   * True when the listing went live too recently for its numbers to mean
   * anything. See tooNewToJudge.
   */
  tooNew: boolean;
  viewers: number;
};

/**
 * Has this sublet been live longer than the term it offers?
 *
 * ===========================================================================
 * WHAT THIS MEASURES, WHICH IS NOT WHAT IT SOUNDS LIKE
 * ===========================================================================
 *
 * It measures TIME LIVE against TERM ADVERTISED. It does not know, and cannot
 * know, whether a tenancy started or ended.
 *
 * The only anchor available is `approved_at`. Nothing records when a sublet
 * would actually begin — that is agreed between the parties in chat, which is
 * the same reason inspections carry no scheduled time. So a six-month sublet
 * approved in February is flagged in August because it has been advertising a
 * six-month term for longer than six months, and that is all the claim is.
 *
 * THE COPY MUST NOT IMPLY WE KNOW THE TENANCY ENDED. We do not, and that is
 * precisely why nothing auto-hides on the strength of this: it is a prompt to
 * the agent to check, not a fact about the property. A listing that
 * disappeared from search because a derived number crossed a threshold would
 * be the system inventing an event.
 *
 * Only for `approved` listings. A rented sublet is already off the market and
 * is misleading nobody; a draft was never live.
 */
export function subletTermPassed(
  listing: {
    approved_at: string | null;
    rental_duration: string;
    status: string;
    sublet_months: number | null;
  },
  now: Date,
): boolean {
  if (listing.status !== "approved") return false;
  if (listing.rental_duration !== "sublet") return false;
  if (!listing.approved_at || !listing.sublet_months) return false;

  const approved = new Date(listing.approved_at);

  if (Number.isNaN(approved.getTime())) return false;

  // Calendar months, not 30-day blocks. A "6 months" offer means six calendar
  // months to everyone who reads it, and 180 days drifts by up to three days
  // across a year — enough to flag a listing early, which is the direction
  // that costs the agent's trust in the signal.
  const elapsedEnd = new Date(approved);
  elapsedEnd.setMonth(elapsedEnd.getMonth() + listing.sublet_months);

  return now.getTime() > elapsedEnd.getTime();
}

/**
 * Too new for its numbers to be read.
 *
 * A listing approved four days ago and one live since February are not
 * comparable on "requests in the last 30 days", and the sort that answers
 * "which of my listings is dead" is requests ascending — which would put the
 * four-day-old one at the top and invite the agent to act on it.
 *
 * A zero cannot express "we have not measured this yet". This can.
 *
 * The threshold is the metric window itself rather than an invented number:
 * once a listing has been live for the whole window, its figure covers the
 * same span as everyone else's and is comparable. Before that it does not.
 */
export function tooNewToJudge(
  listing: { approved_at: string | null; status: string },
  now: Date,
  windowDays: number = METRIC_WINDOW_DAYS,
): boolean {
  // Only a listing that can accumulate numbers can be too new to have them.
  // A draft has no figures for a reason that is not its age.
  if (listing.status !== "approved") return false;
  if (!listing.approved_at) return false;

  const approved = new Date(listing.approved_at);

  if (Number.isNaN(approved.getTime())) return false;

  const daysLive = (now.getTime() - approved.getTime()) / 86_400_000;

  return daysLive < windowDays;
}

/**
 * Does this listing want something from the agent today?
 *
 * The four cases, and each is a different kind of stuck:
 *
 *   rejected              a moderator asked for changes and nothing moves
 *                         until the agent resubmits.
 *   refused revision      the listing is LIVE and looks entirely normal, while
 *                         the correction to it was refused. This is the one
 *                         with no other visible symptom, and the reason the
 *                         signal belongs on the listing rather than only in a
 *                         queue somewhere else.
 *   sublet term passed    it is advertising a term that has run out.
 *   seen, not asked       people are finding it and passing. That is a price
 *                         or a photo problem, and it is invisible without the
 *                         two numbers side by side.
 *
 * The last one is deliberately suppressed while `tooNew`. A listing live for
 * three days with views and no requests has not failed at anything yet.
 */
export function needsAttention(card: AgentListingCard): boolean {
  if (card.status === "rejected") return true;
  if (card.revision?.status === "rejected") return true;
  if (card.subletTermPassed) return true;

  return !card.tooNew && card.viewers > 0 && card.requests === 0;
}

export type SortKey = "attention" | "requests_asc" | "viewers_desc" | "newest";

export const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "attention", label: "Needs you first" },
  // The one the slice exists for. Named as a question an agent asks rather
  // than as a column and a direction.
  { key: "requests_asc", label: "Fewest requests" },
  { key: "viewers_desc", label: "Most viewers" },
  { key: "newest", label: "Newest" },
];

/**
 * A total order, always.
 *
 * Every comparator falls through to the default rank and then to the title, so
 * the list never reorders between renders on equal keys. Two listings with
 * zero requests swapping places on refresh reads as data changing when nothing
 * has.
 */
export function sortCards(
  cards: AgentListingCard[],
  key: SortKey,
): AgentListingCard[] {
  const byDefault = (a: AgentListingCard, b: AgentListingCard) =>
    groupRank(a.status) - groupRank(b.status) || a.title.localeCompare(b.title);

  const sorted = [...cards];

  switch (key) {
    case "requests_asc":
      return sorted.sort(
        (a, b) =>
          a.requests - b.requests ||
          // Among listings with equally few requests, the one more people saw
          // is the more interesting failure: it is being found and passed over,
          // rather than not being found.
          b.viewers - a.viewers ||
          byDefault(a, b),
      );

    case "viewers_desc":
      return sorted.sort((a, b) => b.viewers - a.viewers || byDefault(a, b));

    case "newest":
      return sorted.sort(
        (a, b) =>
          new Date(b.approvedAt ?? 0).getTime() -
            new Date(a.approvedAt ?? 0).getTime() || byDefault(a, b),
      );

    default:
      return sorted.sort(byDefault);
  }
}

export type ListingFilterState = {
  attentionOnly: boolean;
  groups: string[];
  showRemoved: boolean;
  sort: SortKey;
};

export const DEFAULT_FILTER_STATE: ListingFilterState = {
  attentionOnly: false,
  groups: [],
  showRemoved: false,
  sort: "attention",
};

/**
 * Filter state out of a query string.
 *
 * PARSED ON THE SERVER and passed down as props, rather than read from
 * `window` inside the client component. Reading it on the client would mean
 * either a setState inside an effect — which renders the unfiltered list first
 * and then replaces it — or a lazy initialiser that cannot see `window` during
 * SSR and therefore hydrates against different markup than it rendered.
 *
 * Doing it here means a shared or refreshed URL paints correctly the first
 * time. Subsequent changes never come back through this: the list updates the
 * URL with history.replaceState precisely so the server is not re-queried for
 * a purely visual change.
 *
 * Every value is validated against what actually exists. An unknown group or
 * sort key in a hand-edited URL is dropped rather than producing an empty list
 * the agent cannot explain.
 */
export function parseListingFilters(
  params: URLSearchParams,
  knownGroups: readonly string[],
): ListingFilterState {
  const groups = (params.get("groups") ?? "")
    .split(",")
    .filter((key) => knownGroups.includes(key));

  const sortParam = params.get("sort");
  const sort = SORT_OPTIONS.some((option) => option.key === sortParam)
    ? (sortParam as SortKey)
    : DEFAULT_FILTER_STATE.sort;

  return {
    attentionOnly: params.get("attention") === "1",
    groups,
    // A URL that filters TO removed listings must also show them, or it
    // resolves to an empty page for a reason nothing on screen explains.
    showRemoved: params.get("removed") === "1" || groups.includes("removed"),
    sort,
  };
}
