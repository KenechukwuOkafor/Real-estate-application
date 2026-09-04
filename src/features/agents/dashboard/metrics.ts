/**
 * The numbers on the agent dashboard, as pure functions.
 *
 * Separate from the page and from the service for the same reason the status
 * band and the revision diff are: which inputs produce which number is a
 * correctness question, and a metric that is quietly wrong looks exactly like
 * a metric that is right. An agent drops a price because of this table.
 */
import {
  type DeadlineBearing,
  effectiveInspectionStatus,
  isAwaitingResponse,
} from "@/features/inspections/expiry";

export type RangeDays = 7 | 30 | 90;

/**
 * 30, not 90.
 *
 * 0033 measured the view aggregate: it is linear in rows, and one agent's
 * 90-day window runs about 440ms at 100k rows against roughly 140ms for 30
 * days. The default is the one people pay for on every page load.
 */
export const DEFAULT_RANGE: RangeDays = 30;

export const RANGE_OPTIONS: readonly RangeDays[] = [7, 30, 90];

export type RequestRow = DeadlineBearing & {
  listing_id: string;
  requested_at: string;
  responded_at: string | null;
};

export type ViewCountRow = {
  listing_id: string;
  viewed_on: string;
  viewers: number;
};

/** A metric and how it moved against the period immediately before it. */
export type Metric = {
  /** Null when the previous period had nothing to compare against. */
  deltaPercent: number | null;
  label: string;
  /** The fraction behind a percentage, e.g. "12 of 14". Null for plain counts. */
  detail: string | null;
  value: number | null;
  format: "count" | "percent" | "duration";
};

function withinRange(iso: string, since: Date, until: Date) {
  const at = new Date(iso).getTime();
  return at >= since.getTime() && at < until.getTime();
}

/**
 * Requests that fall in a window, by when they were ASKED.
 *
 * By requested_at rather than responded_at, deliberately: "new requests this
 * month" is a question about demand arriving, not about when the agent got
 * round to it. Bucketing by the answer would let an agent raise last month's
 * number by replying late.
 */
export function requestsInWindow(
  requests: RequestRow[],
  since: Date,
  until: Date,
) {
  return requests.filter((request) => withinRange(request.requested_at, since, until));
}

/**
 * Answered over answerable.
 *
 * THE DENOMINATOR IS THE WHOLE POINT, and getting it from `status` alone is
 * the failure this function exists to prevent. The stored status of an ignored
 * request says 'requested' forever — nothing rewrites it, because expiry is
 * evaluated on read (see expiry.ts). So counting `status <> 'requested'` as
 * the denominator drops every ignored request out of the calculation and
 * scores an agent who has answered nothing at 100%. That is the exact inverse
 * of what the number is for.
 *
 * Answerable therefore means: answered, or out of time. A request still inside
 * its 48 hours is excluded from both halves — the agent has not failed to
 * answer it, they have not answered it YET, and counting it as a miss would
 * make the rate drop every time a new request arrived.
 *
 * WITHDRAWN REQUESTS ARE EXCLUDED ENTIRELY. A seeker who cancels before the
 * agent replies has removed the thing there was to answer. Counting it as a
 * miss would let a seeker damage an agent's rate by changing their mind, and
 * counting it as answered would inflate it. It is not evidence either way.
 */
export function responseRate(requests: RequestRow[], now: Date = new Date()) {
  const answerable = requests.filter((request) => {
    if (request.responded_at !== null) {
      return true;
    }

    if (effectiveInspectionStatus(request, now) === "cancelled") {
      return false;
    }

    return !isAwaitingResponse(request, now);
  });

  const answered = answerable.filter((request) => request.responded_at !== null);

  return {
    answered: answered.length,
    answerable: answerable.length,
    rate: answerable.length === 0 ? null : answered.length / answerable.length,
  };
}

/**
 * The middle reply time, in minutes.
 *
 * MEDIAN RATHER THAN MEAN, because one request answered three weeks late drags
 * a mean past every number an agent recognises, and the question being asked
 * is "how long does a seeker usually wait".
 *
 * COMPUTED HERE RATHER THAN IN SQL. percentile_cont would need its own
 * SECURITY DEFINER function, because PostgREST cannot express it — and the
 * rows are already in hand for responseRate above, which MUST be computed here
 * since it depends on the read-time expiry rule. Putting the median in SQL
 * would mean two round trips and, worse, a second definition of "expired"
 * living in SQL beside the one in expiry.ts. That module's own header records
 * two live defects caused by exactly that duplication.
 *
 * The volume makes it easy: an agent's answered requests in ninety days are
 * tens, and a sort stays trivial into the hundreds of thousands.
 */
export function medianReplyMinutes(requests: RequestRow[]) {
  const durations = requests
    .filter((request) => request.responded_at !== null)
    .map(
      (request) =>
        (new Date(request.responded_at as string).getTime() -
          new Date(request.requested_at).getTime()) /
        60_000,
    )
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    .sort((a, b) => a - b);

  if (durations.length === 0) {
    return null;
  }

  const middle = Math.floor(durations.length / 2);

  return durations.length % 2 === 0
    ? Math.round((durations[middle - 1] + durations[middle]) / 2)
    : Math.round(durations[middle]);
}

/**
 * Movement against the period immediately before.
 *
 * Null rather than 0 or Infinity when the previous period was empty. An agent
 * going from no requests to three has not improved by 300% or by 0% — there is
 * no rate of change from nothing, and printing one invents a trend from a
 * single data point.
 */
export function deltaPercent(current: number, previous: number) {
  if (previous === 0) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 100);
}

export function sumViewers(rows: ViewCountRow[]) {
  return rows.reduce((total, row) => total + Number(row.viewers), 0);
}

export type PerListingRow = {
  conversion: number | null;
  listingId: string;
  requests: number;
  status: string;
  title: string;
  viewers: number;
};

/**
 * The per-listing table: the most actionable thing on the page.
 *
 * Conversion is requests over VIEWERS, which is only meaningful because 0033
 * counts people rather than page loads — dividing by page loads would make a
 * listing look worse the more often its interested visitors came back.
 *
 * Null conversion when nobody has looked, rather than zero. No views and no
 * requests is a listing nobody has seen, which is a visibility problem; views
 * and no requests is a price or photo problem. Collapsing both to 0% would
 * merge the two conclusions this column exists to separate.
 */
export function perListingRows(input: {
  listings: Array<{ id: string; status: string; title: string }>;
  requests: RequestRow[];
  views: ViewCountRow[];
}): PerListingRow[] {
  const viewersByListing = new Map<string, number>();
  for (const row of input.views) {
    viewersByListing.set(
      row.listing_id,
      (viewersByListing.get(row.listing_id) ?? 0) + Number(row.viewers),
    );
  }

  const requestsByListing = new Map<string, number>();
  for (const request of input.requests) {
    requestsByListing.set(
      request.listing_id,
      (requestsByListing.get(request.listing_id) ?? 0) + 1,
    );
  }

  return input.listings
    .map((listing) => {
      const viewers = viewersByListing.get(listing.id) ?? 0;
      const requests = requestsByListing.get(listing.id) ?? 0;

      return {
        conversion: viewers === 0 ? null : requests / viewers,
        listingId: listing.id,
        requests,
        status: listing.status,
        title: listing.title,
        viewers,
      };
    })
    .sort((a, b) => b.viewers - a.viewers);
}

/**
 * Which of three dashboards an agent should see.
 *
 * `first_run` — no listings at all. Zeros everywhere teach nothing and read as
 * failure, so the numbers are replaced by a checklist.
 *
 * `dormant` — has listings, and not one of them can receive a view or a
 * request. Distinct from first_run because there IS history worth reading, and
 * distinct from active because the numbers going forward are structurally zero:
 * showing "0 views, down 100%" invites the agent to fix a listing problem when
 * the truth is that nothing of theirs is live. Archiving is terminal (0022,
 * "relisting means creating a new listing"), so the only way out is a new
 * listing — which is what this state says.
 *
 * `active` — anything else, including an agent whose only listing is a draft.
 * A draft is work in progress, not dormancy.
 */
export type DashboardState = "first_run" | "dormant" | "active";

const LIVE_OR_BECOMING_LIVE = new Set([
  "draft",
  "pending_review",
  "approved",
  "flagged",
  "under_dispute",
]);

export function dashboardState(
  listings: Array<{ status: string }>,
): DashboardState {
  if (listings.length === 0) {
    return "first_run";
  }

  const anyLive = listings.some((listing) =>
    LIVE_OR_BECOMING_LIVE.has(listing.status),
  );

  return anyLive ? "active" : "dormant";
}

/** Whole minutes as something an agent reads without converting. */
export function formatReplyTime(minutes: number | null) {
  if (minutes === null) {
    return "No replies yet";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `${hours} hr`;
  }

  return `${Math.round(hours / 24)} days`;
}

/**
 * Whether the agent has run out of submission slots.
 *
 * EXTRACTED BECAUSE THE FIRST VERSION WAS DEAD CODE. The dashboard derived
 * this by scanning agentStatusBand().attention for an item whose title
 * mentioned slots — and that list only ever contains rejected listings. The
 * branch could not fire, so the slots warning never rendered for anybody, and
 * nothing failed: the seeded verified agent has three slots, so no test and no
 * review was ever looking at the state where it should appear.
 *
 * A pure function with its own tests cannot be dead in the same way.
 *
 * VERIFICATION IS CHECKED FIRST, and it is not a technicality. Quota is
 * granted when verification is approved (ADR-034), so an unverified agent
 * always has zero. Telling them they are out of submission slots would name
 * the wrong blocker — they cannot submit because they are not verified, and
 * buying slots would not change that. Their warning is the verification one.
 */
export function hasExhaustedSlots(input: {
  freeListingQuota: number;
  hasActiveSubscription: boolean;
  verificationStatus: string;
}) {
  if (input.hasActiveSubscription) {
    return false;
  }

  if (input.verificationStatus !== "verified") {
    return false;
  }

  return input.freeListingQuota <= 0;
}
