"use client";

import { useState } from "react";

type SubmitListingReviewButtonProps = {
  listingId: string;
};

export function SubmitListingReviewButton({
  listingId,
}: SubmitListingReviewButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onClick() {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/agent/listings/${listingId}/submit`, {
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to submit listing.");
      setIsSubmitting(false);
      return;
    }

    setMessage("Listing submitted for review.");
    setIsSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="self-start rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        disabled={isSubmitting}
        onClick={onClick}
        type="button"
      >
        {isSubmitting ? "Submitting..." : "Submit for review"}
      </button>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
    </div>
  );
}
