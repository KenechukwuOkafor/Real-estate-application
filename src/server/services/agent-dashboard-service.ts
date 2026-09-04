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

/**
 * Africa/Lagos calendar days, because that is what 0033 buckets by.
 *
 * Computing the window in UTC and passing it to a function that groups in WAT
 * would put the boundary an hour out — an off-by-one that only appears in the
 * hour before midnight and only for the first and last bar of the chart, which
 * is the kind of bug that survives for months.
 */
function lagosDay(offsetDays: number) {
  const at = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  return at.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

function lagosDayStart(day: string) {
  // Africa/Lagos is UTC+1 year round — no DST — so a fixed offset is correct
  // rather than merely convenient.
  return new Date(`${day}T00:00:00+01:00`);
}

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
        freeListingQuota: profile?.free_listing_quota ?? 0,
        hasActiveSubscription: Boolean(activeSubscription),
        verificationStatus: profile?.verification_status ?? "not_submitted",
      }),
    }),
    activity: buildActivity({ listings, requests, revisions }),
    chart: buildChart({ range, requests: current, views }),
    entitlement: {
      activeSubscription,
      freeListingQuota: profile?.free_listing_quota ?? 0,
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
  for (const revision of input.revisions) {
    if (revision.status === "rejected") {
      items.push({
        detail: revision.rejection_reason ?? "A moderator refused this change.",
        href: `/agent/listings/${revision.listing_id}/edit`,
        hrefLabel: "Revise the change",
        kind: "revision",
        minutesLeft: null,
        title: `Your edit to "${revision.listings?.title ?? "a listing"}" was refused`,
      });
    }
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
        href: `/agent/listings/${listing.id}`,
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
    const day = new Date(request.requested_at).toLocaleDateString("en-CA", {
      timeZone: "Africa/Lagos",
    });
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
