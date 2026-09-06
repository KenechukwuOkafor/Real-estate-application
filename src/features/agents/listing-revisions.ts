/**
 * Which proposed change to a listing is still the agent's current word.
 *
 * ===========================================================================
 * THE DEFECT THIS EXISTS TO FIX
 * ===========================================================================
 *
 * The dashboard's action queue did this:
 *
 *   for (const revision of revisions)
 *     if (revision.status === "rejected") items.push(...)
 *
 * over `listAgentListingRevisions`, which fetches EVERY revision the agent has
 * ever submitted, unbounded and unfiltered. So a refusal from March stayed in
 * the action queue in September. If the agent then proposed a better change and
 * a moderator approved it, the March refusal was still there — an action item
 * for something already resolved, which the agent cannot dismiss and which
 * accumulates one more row for every rejection they ever receive.
 *
 * An action queue that cannot be emptied stops being read. That is the whole
 * cost: not a wrong pixel, but the queue quietly becoming decoration, taking
 * the inspection deadlines beside it down with it.
 *
 * ===========================================================================
 * THE RULE
 * ===========================================================================
 *
 * Only the LATEST revision per listing can be a signal, because only the latest
 * one describes what the agent currently wants. Everything before it has been
 * superseded by the agent's own subsequent action.
 *
 * - `rejected` and latest    → actionable. The agent asked, was refused, and
 *                              has not asked again.
 * - `rejected` and older     → silent. They asked again; that later attempt is
 *                              the state of play.
 * - `pending_review`         → informational. Nothing for them to do but wait,
 *                              and the database permits only one pending per
 *                              listing (0023), so this is always the latest.
 * - `approved`               → silent. It was applied; the listing already
 *                              shows it.
 *
 * Shared by the dashboard action queue and the listings page card SO THAT THEY
 * CANNOT DRIFT. Two surfaces answering "do I have a refused edit" differently
 * is worse than either answer alone, because the agent has no way to tell which
 * one is lying.
 */

export type RevisionRow = {
  listing_id: string;
  listings?: { title?: string } | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  status: string;
  submitted_at: string;
};

export type ListingRevisionSignal = {
  listingId: string;
  listingTitle: string | null;
  /** Only ever the moderator's sentence, and only on a refusal. */
  reason: string | null;
  reviewedAt: string | null;
  status: "rejected" | "pending_review";
  submittedAt: string;
};

/**
 * The newest revision per listing, whatever its status.
 *
 * Does NOT assume the input is sorted. `listAgentListingRevisions` orders by
 * submitted_at descending today, and relying on that would make this function
 * silently wrong the day somebody adds a second caller with a different order —
 * a failure that produces a stale action item rather than an error.
 */
export function latestRevisionPerListing<T extends RevisionRow>(
  revisions: T[],
): Map<string, T> {
  const latest = new Map<string, T>();

  for (const revision of revisions) {
    const held = latest.get(revision.listing_id);

    if (
      !held ||
      new Date(revision.submitted_at).getTime() >
        new Date(held.submitted_at).getTime()
    ) {
      latest.set(revision.listing_id, revision);
    }
  }

  return latest;
}

/**
 * The revisions worth saying something about, one per listing at most.
 *
 * Keyed by listing id so a card can ask about itself in constant time, which is
 * what the listings page needs — it renders every listing and would otherwise
 * scan the whole revision list once per card.
 */
export function revisionSignals(
  revisions: RevisionRow[],
): Map<string, ListingRevisionSignal> {
  const signals = new Map<string, ListingRevisionSignal>();

  for (const [listingId, revision] of latestRevisionPerListing(revisions)) {
    if (revision.status !== "rejected" && revision.status !== "pending_review") {
      continue;
    }

    signals.set(listingId, {
      listingId,
      listingTitle: revision.listings?.title ?? null,
      // Only carried for a refusal. A pending revision has no reason yet, and
      // a stale `rejection_reason` on a row that has been re-reviewed would
      // read as the current verdict.
      reason: revision.status === "rejected" ? revision.rejection_reason : null,
      reviewedAt: revision.reviewed_at,
      status: revision.status,
      submittedAt: revision.submitted_at,
    });
  }

  return signals;
}
