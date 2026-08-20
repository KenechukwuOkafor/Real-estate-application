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
