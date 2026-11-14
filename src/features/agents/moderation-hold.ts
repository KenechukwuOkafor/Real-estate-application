import type { SupportTopic } from "@/lib/support-contact";

/**
 * What an agent reads when a moderator has paused a live listing.
 *
 * Flagged and under_dispute were the two statuses with a reason an admin must
 * write and an agent could never read. The listing changed status, left public
 * view, and locked — no edit, no revision, no withdrawal, by design
 * (editability.ts, 0022) — and the one sentence that explained why sat in the
 * database unread. Rejections were fixed for exactly this; these two were not.
 *
 * Pure and in one place because three surfaces show it — the dashboard queue,
 * the listing card and the editor — and the wording has three jobs that must
 * not drift between them:
 *
 *  1. A FLAG IS A QUESTION, NOT A VERDICT. Nothing here says the agent did
 *     anything wrong, because they may not have.
 *  2. SAY WHAT IT COSTS. The listing is hidden from seekers while it is held.
 *     An agent who does not know that does not understand what a flag means.
 *  3. SAY WHAT THEY CAN DO. They cannot change the listing, so the honest
 *     answer is a person: the reason is a question they can only answer by
 *     reaching someone, which is what the support route is for.
 */

export type ModerationHoldInput = {
  dispute_reason: string | null;
  flag_reason: string | null;
  status: string;
};

export type ModerationHold = {
  kind: "flagged" | "disputed";
  /** Heading for the panel on the listing itself. */
  heading: string;
  /** Introduces the moderator's sentence. */
  reasonLabel: string;
  /** The moderator's words, verbatim, or a plain statement that there are none. */
  reason: string;
  /** What the hold costs and what the agent can do. */
  consequence: string;
  supportTopic: SupportTopic;
};

/**
 * Older rows can carry no reason: flag and dispute fell back to stock phrases
 * until the reason became required, and nothing earlier than that required one
 * at all. Saying so plainly beats an empty panel.
 */
const NO_REASON = "No details were recorded.";

export function moderationHold(listing: ModerationHoldInput): ModerationHold | null {
  if (listing.status === "flagged") {
    return {
      consequence:
        "While they check, it is hidden from seekers and cannot be edited or withdrawn. You do not need to change anything yet — if a change is needed, it will come back to you as a request to edit. If you can answer their question, message us on WhatsApp.",
      heading: "A moderator has a question about this listing",
      kind: "flagged",
      reason: listing.flag_reason?.trim() || NO_REASON,
      reasonLabel: "What they asked",
      supportTopic: "listing_flagged",
    };
  }

  if (listing.status === "under_dispute") {
    return {
      consequence:
        "While this is checked, it is hidden from seekers and cannot be edited or withdrawn. If you can show the property is yours, message us on WhatsApp.",
      heading: "Ownership of this listing is being checked",
      kind: "disputed",
      reason: listing.dispute_reason?.trim() || NO_REASON,
      reasonLabel: "What was raised",
      supportTopic: "listing_disputed",
    };
  }

  return null;
}

/** The one-line form, for the dashboard queue. */
export function moderationHoldTitle(hold: ModerationHold, listingTitle: string): string {
  return hold.kind === "flagged"
    ? `A moderator has a question about "${listingTitle}"`
    : `Ownership of "${listingTitle}" is being checked`;
}

export function moderationHoldDetail(hold: ModerationHold): string {
  return `${hold.reason} Hidden from seekers until this is resolved.`;
}
