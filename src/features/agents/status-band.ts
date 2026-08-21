/**
 * What an agent can do today, as data.
 *
 * Three facts govern every action in the portal: whether they are verified,
 * whether they have a submission slot, and whether somebody is waiting on them.
 * An agent who does not know those three is guessing, and the guess is usually
 * "why was my listing not submitted".
 *
 * Pure and separate from the page for the same reason the revision diff is:
 * which state produces which sentence is a correctness question, and a state
 * that silently produces the wrong tone — "all clear" while verification is
 * rejected — is a defect, not a styling choice.
 */

export type StatusTone = "good" | "attention" | "blocked" | "neutral";

export type StatusFact = {
  detail: string;
  href?: string;
  hrefLabel?: string;
  label: string;
  tone: StatusTone;
  value: string;
};

export type AttentionItem = {
  detail: string;
  href: string;
  hrefLabel: string;
  title: string;
};

export type StatusBandInput = {
  activeSubscriptionPlan: string | null;
  freeListingQuota: number;
  incomingRequests: number;
  listings: Array<{
    id: string;
    rejection_reason: string | null;
    status: string;
    title: string;
  }>;
  verificationStatus: string;
};

export type StatusBand = {
  attention: AttentionItem[];
  facts: StatusFact[];
};

function verificationFact(status: string): StatusFact {
  switch (status) {
    case "verified":
      return {
        detail: "You can submit listings for review.",
        label: "Verification",
        tone: "good",
        value: "Verified",
      };
    case "pending_review":
      return {
        detail:
          "We are checking your documents. You can keep building drafts while you wait.",
        label: "Verification",
        tone: "neutral",
        value: "Being checked",
      };
    case "rejected":
      return {
        // The one state that must not read as merely "not done". Something was
        // wrong and an agent has to act, and telling them that plainly here is
        // cheaper than them discovering it at submission.
        detail: "Something was wrong with your documents. Send them again to continue.",
        href: "/agent/verification",
        hrefLabel: "Fix verification",
        label: "Verification",
        tone: "blocked",
        value: "Not accepted",
      };
    case "suspended":
      return {
        detail: "Your account cannot submit listings. Contact support.",
        label: "Verification",
        tone: "blocked",
        value: "Suspended",
      };
    default:
      return {
        detail: "Drafts are free. Verification is what lets you submit one.",
        href: "/agent/verification",
        hrefLabel: "Start verification",
        label: "Verification",
        tone: "attention",
        value: "Not started",
      };
  }
}

function slotsFact(input: StatusBandInput): StatusFact {
  if (input.activeSubscriptionPlan) {
    return {
      detail: "Your subscription covers submissions. Drafts are always free.",
      label: "Submission slots",
      tone: "good",
      value: "Unlimited",
    };
  }

  if (input.freeListingQuota > 0) {
    return {
      detail: "One slot is used each time you submit a listing for review.",
      label: "Submission slots",
      tone: "good",
      value: `${input.freeListingQuota} left`,
    };
  }

  return {
    // Not "blocked". Nothing an agent already has is affected, and a red panel
    // saying so would be alarming out of proportion to what happened.
    detail:
      "Drafts are still free and unlimited, and your live listings are not affected.",
    label: "Submission slots",
    tone: "attention",
    value: "None left",
  };
}

function requestsFact(count: number): StatusFact {
  if (count === 0) {
    return {
      detail: "Nothing is waiting on you.",
      label: "Inspection requests",
      tone: "neutral",
      value: "None waiting",
    };
  }

  return {
    detail: "Seekers have 48 hours to hear back before the request closes itself.",
    href: "/agent/inspections",
    hrefLabel: "Answer requests",
    label: "Inspection requests",
    tone: "attention",
    value: `${count} waiting`,
  };
}

/**
 * The three facts, plus whatever needs doing.
 *
 * Attention items are per-listing and specific. "You have 2 rejected listings"
 * is a statistic; "The third photo shows a different property" is something an
 * agent can act on, so the reason travels with the item rather than being left
 * on the other page.
 */
export function agentStatusBand(input: StatusBandInput): StatusBand {
  const attention: AttentionItem[] = [];

  for (const listing of input.listings) {
    if (listing.status !== "rejected") {
      continue;
    }

    attention.push({
      detail:
        listing.rejection_reason?.trim() ||
        "A moderator asked for changes. Open the listing to see what to do.",
      href: `/agent/listings/${listing.id}/edit`,
      hrefLabel: "Fix and resubmit",
      title: listing.title,
    });
  }

  return {
    attention,
    facts: [
      verificationFact(input.verificationStatus),
      slotsFact(input),
      requestsFact(input.incomingRequests),
    ],
  };
}
