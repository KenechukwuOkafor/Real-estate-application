/**
 * What still stands between a draft and a submission.
 *
 * Five separate gates can refuse a submission — profile, verification, listing
 * state, photo count and entitlement — and each throws its own 422 or 403. An
 * agent who hit one saw a single red box and could not tell which of the five
 * had fired, so the fix was always guesswork.
 *
 * The portal design answers this with a checklist rather than a disabled button
 * and a code, and every input it needs is already on the page. This is that
 * checklist as a pure function, so the copy and the conditions are testable
 * without rendering anything.
 *
 * It deliberately does NOT disable the submit button. The server is the
 * authority on whether a submission is allowed, and a client that decides for
 * itself will eventually disagree with it — at which point the agent is blocked
 * by a rule nobody can see. The checklist informs; the server still refuses.
 */

export type VerificationStatus =
  | "not_submitted"
  | "pending_review"
  | "verified"
  | "rejected"
  | "suspended";

export type SubmitReadinessInput = {
  activeImageCount: number;
  area: string;
  freeListingQuota: number;
  hasActiveSubscription: boolean;
  priceNaira: number;
  verificationStatus: VerificationStatus;
};

export type ReadinessItem = {
  /** What the agent must do or wait for, phrased as the thing itself. */
  label: string;
  met: boolean;
  /** Shown when not met. Says what to do, never what is wrong with them. */
  hint?: string;
};

export const MINIMUM_LISTING_IMAGES = 3;

/**
 * Verification, as three separate sentences rather than one boolean.
 *
 * A pending review is not a failure by the agent and must not read like one —
 * they are waiting on us, and there is nothing for them to do.
 */
function verificationItem(status: VerificationStatus): ReadinessItem {
  if (status === "verified") {
    return { label: "Identity verified", met: true };
  }

  if (status === "pending_review") {
    return {
      hint: "We are reviewing your documents. Nothing for you to do — we will let you know.",
      label: "Identity verification in review",
      met: false,
    };
  }

  if (status === "rejected") {
    return {
      hint: "Your verification needs another look. Open verification to see what to change.",
      label: "Identity verification needs attention",
      met: false,
    };
  }

  if (status === "suspended") {
    return {
      hint: "Your account is on hold. Contact us and we will sort it out.",
      label: "Account on hold",
      met: false,
    };
  }

  return {
    hint: "Verify your identity so seekers know who they are dealing with.",
    label: "Identity verified",
    met: false,
  };
}

export function submitReadiness(input: SubmitReadinessInput): ReadinessItem[] {
  const photos: ReadinessItem = {
    label: `${MINIMUM_LISTING_IMAGES} photos added`,
    met: input.activeImageCount >= MINIMUM_LISTING_IMAGES,
    ...(input.activeImageCount >= MINIMUM_LISTING_IMAGES
      ? {}
      : {
          hint:
            input.activeImageCount === 0
              ? "Add at least three photos. Listings with more photos get far more enquiries."
              : `${input.activeImageCount} added so far — ${
                  MINIMUM_LISTING_IMAGES - input.activeImageCount
                } more to go.`,
        }),
  };

  const details: ReadinessItem = {
    label: "Price and area set",
    met: input.priceNaira > 0 && input.area.trim().length > 0,
    ...(input.priceNaira > 0 && input.area.trim().length > 0
      ? {}
      : { hint: "Add the rent and the area before submitting." }),
  };

  const entitlement: ReadinessItem = {
    label: input.hasActiveSubscription
      ? "Covered by your subscription"
      : "Submission slot available",
    met: input.hasActiveSubscription || input.freeListingQuota > 0,
    ...(input.hasActiveSubscription || input.freeListingQuota > 0
      ? {}
      : {
          hint: "You have used all your submission slots. A subscription gives you more.",
        }),
  };

  return [photos, details, verificationItem(input.verificationStatus), entitlement];
}

/** True when nothing is outstanding. The server still decides. */
export function isReadyToSubmit(items: ReadinessItem[]) {
  return items.every((item) => item.met);
}
