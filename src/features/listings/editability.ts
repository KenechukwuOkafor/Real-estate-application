/**
 * When a listing may still be edited by the agent who owns it.
 *
 * One definition, imported by everything that needs it: the write path that
 * refuses the transition, the page that decides whether to render a form, and
 * the list that decides whether to offer a link. Three copies of the same rule
 * is three chances for the page to offer an edit the server will reject, which
 * is a worse experience than not offering it.
 *
 * DRAFT: never been in front of a reviewer, so nothing to protect.
 *
 * REJECTED: the case that matters most. A rejection is a request to change
 * something, and an agent who cannot change it has been told to fix a listing
 * they are locked out of.
 *
 * Everything else is deliberately absent, and this is not the place to widen
 * it. pending_review is in a moderation queue and editing under a reviewer
 * would change what they are reviewing mid-review. approved is live inventory a
 * seeker may already have acted on. flagged and under_dispute are exactly the
 * states where an agent editing the evidence is the thing to prevent.
 */
import type { Database } from "@/types/database";

type ListingStatus = Database["public"]["Enums"]["listing_status"];

export const EDITABLE_LISTING_STATUSES = ["draft", "rejected"] as const;

export function isListingEditable(status: ListingStatus | string): boolean {
  return (EDITABLE_LISTING_STATUSES as readonly string[]).includes(status);
}

/**
 * When a listing may be CHANGED BY PROPOSAL rather than edited in place.
 *
 * The counterpart to the list above, and the two must not be confused. A
 * status here is one whose content a moderator has signed off, so an agent
 * cannot overwrite it — they submit a revision and a moderator sees it. A
 * status in EDITABLE_LISTING_STATUSES is one where the agent writes directly
 * because nobody has reviewed it yet.
 *
 * RENTED IS HERE AND MUST NEVER BE MOVED TO THE OTHER LIST. Marking a rented
 * listing available returns it to 'approved' with no re-review, which is only
 * legitimate because nothing changed while it was off the market. Direct
 * editing would make that flip a publication of unreviewed content, and the
 * mechanism preventing it is precisely rented's absence from
 * EDITABLE_LISTING_STATUSES. See migration 0036, and the probe in
 * src/server/repositories/listing-rented-integration.test.ts, which is what
 * will object.
 *
 * Mirrors submit_listing_revision's own check, so the page cannot offer a
 * proposal the database will refuse — and, more usefully here, cannot fail to
 * offer one it would accept: a "Change details" link that lands on "this
 * listing cannot be edited" is how a rented listing becomes uncorrectable.
 */
export const REVISABLE_LISTING_STATUSES = ["approved", "rented"] as const;

export function isListingRevisable(status: ListingStatus | string): boolean {
  return (REVISABLE_LISTING_STATUSES as readonly string[]).includes(status);
}
