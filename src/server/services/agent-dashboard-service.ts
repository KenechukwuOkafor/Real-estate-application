import "server-only";

import {
  DEFAULT_RANGE,
  dashboardState,
  hasExhaustedSlots,
  deltaPercent,
  medianReplyMinutes,
  perListingRows,
  type RangeDays,
  type RequestRow,
  requestsInWindow,
  responseRate,
  sumViewers,
  type ViewCountRow,
} from "@/features/agents/dashboard/metrics";
import { lagosDay, lagosDayOf, lagosDayStart } from "@/features/agents/lagos-day";
import { revisionSignals } from "@/features/agents/listing-revisions";
import {
  isAwaitingCompletion,
  isAwaitingResponse,
  minutesRemaining,
} from "@/features/inspections/expiry";
import { createSupabaseAuthenticatedClient } from "@/lib/db/supabase/authenticated";
import {
  getAgentListingViewCounts,
  getAgentProfileWithSubscriptionsByUserId,
  listAgentListingRevisions,
  listAgentListings,
} from "@/server/repositories/agents-repository";
import { listAgentInspectionRequests } from "@/server/repositories/inspection-repository";
import { getCurrentAgentContext } from "@/server/services/agent-service";

export type ActionItem = {
  detail: string;
  /**
   * Optional, because one action currently has no destination.
   *
   * An agent out of submission slots has nowhere to go: there is no billing
   * surface and no way to buy more. Linking them somewhere unhelpful to
   * satisfy a type would be worse than saying so — the queue should be honest
   * that this is a wall rather than sending them at one. It becomes a link
   * the moment plans exist.
   */
  href?: string;
  hrefLabel?: string;
  kind: "request" | "completion" | "rejection" | "revision" | "slots";
  minutesLeft: number | null;
  title: string;
};

export type ActivityItem = {
  at: string;
  kind: "approved" | "rejected" | "request" | "message" | "revision_rejected";
  title: string;
  detail: string;
  href: string;
};

export async function getAgentDashboard(range: RangeDays = DEFAULT_RANGE) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    return null;
  }

  const client = await createSupabaseAuthenticatedClient();
  const agentProfileId = context.agentProfile.id;

  const untilDay = lagosDay(0);
  const sinceDay = lagosDay(range - 1);
  // The comparison window is the equal-length stretch immediately before, so
  // "up 12%" means against the same number of days rather than against
  // whatever happened to be there.
  const previousSinceDay = lagosDay(range * 2 - 1);
  const previousUntilDay = lagosDay(range);

  const [profile, listings, requests, revisions, views, previousViews] =
    await Promise.all([
      getAgentProfileWithSubscriptionsByUserId(client, context.user.id),
      listAgentListings(client, agentProfileId),
      listAgentInspectionRequests(client, agentProfileId),
      listAgentListingRevisions(client, agentProfileId),
      getAgentListingViewCounts(client, sinceDay, untilDay),
      getAgentListingViewCounts(client, previousSinceDay, previousUntilDay),
    ]);

  const now = new Date();
  const windowStart = lagosDayStart(sinceDay);
  const previousStart = lagosDayStart(previousSinceDay);
  const previousEnd = lagosDayStart(previousUntilDay);

  const requestRows: RequestRow[] = requests.map((request) => ({
    completion_deadline: request.completion_deadline,
    expires_at: request.expires_at,
    listing_id: request.listing_id,
    requested_at: request.requested_at,
    responded_at: request.responded_at,
    status: request.status,
  }));

  const current = requestsInWindow(requestRows, windowStart, now);
  const previous = requestsInWindow(requestRows, previousStart, previousEnd);

  const currentRate = responseRate(current, now);
  const previousRate = responseRate(previous, now);
  const currentMedian = medianReplyMinutes(current);
  const previousMedian = medianReplyMinutes(previous);

  const activeSubscription =
    profile?.subscriptions?.find((subscription) => {
      const at = now.getTime();
      return (
        (subscription.status === "active" ||
          subscription.status === "grace_period") &&
        new Date(subscription.starts_at).getTime() <= at &&
        new Date(subscription.expires_at).getTime() > at
      );
    }) ?? null;

  return {
    actions: buildActions({
      listings,
      now,
      requests,
      revisions,
      slotsExhausted: hasExhaustedSlots({
        // Through own_agent_free_listing_quota(), carried on the context.
        // Not a column on the profile row since 0037.
        freeListingQuota: context.freeListingQuota,
        hasActiveSubscription: Boolean(activeSubscription),
        verificationStatus: profile?.verification_status ?? "not_submitted",
      }),
    }),
    activity: buildActivity({ listings, requests, revisions }),
    chart: buildChart({ range, requests: current, views }),
    // Only consulted in the dormant state, where it decides between two ways
    // out that are not interchangeable: a let property comes back for free,
    // a removed one costs a submission slot. See Dormant in app/agent/page.
    hasRentedListings: listings.some((listing) => listing.status === "rented"),
    entitlement: {
      activeSubscription,
      freeListingQuota: context.freeListingQuota,
      verificationStatus: profile?.verification_status ?? "not_submitted",
    },
    kpis: {
      medianReply: {
        deltaPercent:
          currentMedian !== null && previousMedian !== null
            ? deltaPercent(currentMedian, previousMedian)
            : null,
        value: currentMedian,
      },
      newRequests: {
        deltaPercent: deltaPercent(current.length, previous.length),
        value: current.length,
      },
      responseRate: {
        answerable: currentRate.answerable,
        answered: currentRate.answered,
        deltaPercent:
          currentRate.rate !== null && previousRate.rate !== null
            ? deltaPercent(
                Math.round(currentRate.rate * 100),
                Math.round(previousRate.rate * 100),
              )
            : null,
        value: currentRate.rate,
      },
      views: {
        deltaPercent: deltaPercent(sumViewers(views), sumViewers(previousViews)),
        value: sumViewers(views),
      },
    },
    perListing: perListingRows({
      listings: listings.map((listing) => ({
        id: listing.id,
        status: listing.status,
        title: listing.title,
      })),
      requests: current,
      views,
    }),
    range,
    state: dashboardState(listings),
  };
}

/**
 * The action queue. Ordered by what stops soonest, not by category.
 *
 * An agent scanning this needs "what runs out first", and grouping by type
 * would put a four-day completion clock above a request with two hours left
 * because inspections sort before listings alphabetically.
 */
function buildActions(input: {
  listings: Array<{ id: string; rejection_reason: string | null; status: string; title: string }>;
  now: Date;
  slotsExhausted: boolean;
  requests: Awaited<ReturnType<typeof listAgentInspectionRequests>>;
  revisions: Awaited<ReturnType<typeof listAgentListingRevisions>>;
}): ActionItem[] {
  const items: ActionItem[] = [];

  for (const request of input.requests) {
    const bearing = {
      completion_deadline: request.completion_deadline,
      expires_at: request.expires_at,
      status: request.status,
    };

    if (isAwaitingResponse(bearing, input.now)) {
      items.push({
        detail: `${request.listings?.title ?? "A listing"} — answer before the window closes.`,
        href: "/agent/inspections",
        hrefLabel: "Open the inbox",
        kind: "request",
        minutesLeft: minutesRemaining(bearing, input.now),
        title: "Someone asked to inspect",
      });
      continue;
    }

    if (isAwaitingCompletion(bearing, input.now)) {
      items.push({
        detail: `${request.listings?.title ?? "A listing"} — mark it complete once the visit has happened.`,
        href: "/agent/inspections",
        hrefLabel: "Open the inbox",
        kind: "completion",
        minutesLeft: minutesRemaining(bearing, input.now),
        title: "An inspection you accepted",
      });
    }
  }

  for (const listing of input.listings) {
    if (listing.status === "rejected") {
      items.push({
        // The moderator's sentence inline. Making an agent navigate to find it
        // is how a rejection becomes a resubmission of the same listing.
        detail: listing.rejection_reason ?? "A moderator asked for changes.",
        href: `/agent/listings/${listing.id}/edit`,
        hrefLabel: "Edit and resubmit",
        kind: "rejection",
        minutesLeft: null,
        title: `"${listing.title}" was rejected`,
      });
    }
  }

  // The channel the status band cannot see: the listing stays approved and
  // live while the correction to it was refused.
  //
  // Through revisionSignals rather than over the raw list, and that is a fix
  // rather than a tidy-up. This loop used to run over EVERY revision the agent
  // had ever submitted — listAgentListingRevisions is unbounded and unfiltered
  // — and push an action item for each rejected one. A refusal from March was
  // still in the queue in September, even after the agent proposed a better
  // change and a moderator approved it. Undismissable, and one more row for
  // every rejection they ever received.
  //
  // An action queue that cannot be emptied stops being read, and it takes the
  // inspection deadlines beside it down with it.
  for (const signal of revisionSignals(input.revisions).values()) {
    if (signal.status !== "rejected") continue;

    items.push({
      detail: signal.reason ?? "A moderator refused this change.",
      href: `/agent/listings/${signal.listingId}/edit`,
      hrefLabel: "Revise the change",
      kind: "revision",
      minutesLeft: null,
      title: `Your edit to "${signal.listingTitle ?? "a listing"}" was refused`,
    });
  }

  // Derived from the entitlement, not scavenged out of the status band. The
  // previous version scanned band.attention for a slots item and that list
  // only ever holds rejected listings, so this never fired for anyone.
  if (input.slotsExhausted) {
    items.push({
      detail:
        "Drafts are still free and unlimited, and your live listings are not affected. Paid plans are not available yet.",
      kind: "slots",
      minutesLeft: null,
      title: "You have used all your submission slots",
    });
  }

  return items.sort((a, b) => {
    if (a.minutesLeft === null && b.minutesLeft === null) return 0;
    if (a.minutesLeft === null) return 1;
    if (b.minutesLeft === null) return -1;
    return a.minutesLeft - b.minutesLeft;
  });
}

function buildActivity(input: {
  listings: Array<{
    approved_at: string | null;
    id: string;
    rejected_at: string | null;
    status: string;
    title: string;
  }>;
  requests: Awaited<ReturnType<typeof listAgentInspectionRequests>>;
  revisions: Awaited<ReturnType<typeof listAgentListingRevisions>>;
}): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const listing of input.listings) {
    if (listing.approved_at) {
      // Approvals were surfaced nowhere at all before this. An agent learned
      // their listing was live by going to look.
      items.push({
        at: listing.approved_at,
        detail: "It is live and can be found by seekers.",
        // Same correction as dashboard-listings-table: the per-listing route
        // has never existed, so this row was a 404 for its whole life.
        href: `/agent/listings?focus=${listing.id}`,
        kind: "approved",
        title: `"${listing.title}" was approved`,
      });
    }

    // rejected_at, not updated_at — 0034. updated_at moves on every edit, so
    // ordering by it would claim a June rejection happened yesterday.
    if (listing.rejected_at) {
      items.push({
        at: listing.rejected_at,
        detail: "A moderator asked for changes.",
        href: `/agent/listings/${listing.id}/edit`,
        kind: "rejected",
        title: `"${listing.title}" was rejected`,
      });
    }
  }

  for (const request of input.requests) {
    items.push({
      at: request.requested_at,
      detail: request.listings?.title ?? "One of your listings",
      href: "/agent/inspections",
      kind: "request",
      title: "Someone asked to inspect",
    });

    if (request.chats?.last_message_at) {
      items.push({
        at: request.chats.last_message_at,
        detail: request.listings?.title ?? "One of your listings",
        href: `/chats/${request.chats.id}`,
        kind: "message",
        title: "New message",
      });
    }
  }

  // Unfiltered here, deliberately, and this is the one place the raw list is
  // right. The activity feed is a HISTORY — a refusal that happened did happen,
  // and a superseded one is still a thing that occurred on a date. It is capped
  // at twelve items and ordered by time, so an old refusal falls off naturally
  // rather than sitting at the top as work. That is the difference between this
  // and the action queue above: one records, the other asks.
  for (const revision of input.revisions) {
    if (revision.status === "rejected" && revision.reviewed_at) {
      items.push({
        at: revision.reviewed_at,
        detail: revision.rejection_reason ?? "A moderator refused this change.",
        href: `/agent/listings/${revision.listing_id}/edit`,
        kind: "revision_rejected",
        title: `Your edit to "${revision.listings?.title ?? "a listing"}" was refused`,
      });
    }
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
}

/**
 * One row per day in the window, including days with nothing.
 *
 * A chart that omits empty days draws a line between the two days that had
 * traffic and implies a trend across the gap. Zeroes are data.
 */
function buildChart(input: {
  range: RangeDays;
  requests: RequestRow[];
  views: ViewCountRow[];
}) {
  const viewersByDay = new Map<string, number>();
  for (const row of input.views) {
    viewersByDay.set(
      row.viewed_on,
      (viewersByDay.get(row.viewed_on) ?? 0) + Number(row.viewers),
    );
  }

  const requestsByDay = new Map<string, number>();
  for (const request of input.requests) {
    const day = lagosDayOf(request.requested_at);
    requestsByDay.set(day, (requestsByDay.get(day) ?? 0) + 1);
  }

  const days: Array<{ day: string; requests: number; viewers: number }> = [];
  for (let offset = input.range - 1; offset >= 0; offset -= 1) {
    const day = lagosDay(offset);
    days.push({
      day,
      requests: requestsByDay.get(day) ?? 0,
      viewers: viewersByDay.get(day) ?? 0,
    });
  }

  return days;
}
