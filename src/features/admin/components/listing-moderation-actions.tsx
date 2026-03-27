"use client";

import { useState } from "react";

type ListingModerationActionsProps = {
  listingId: string;
};

export function ListingModerationActions({
  listingId,
}: ListingModerationActionsProps) {
  const [rejectionReason, setRejectionReason] = useState("Duplicate or invalid listing.");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function approve() {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/admin/listings/${listingId}/approve`, {
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to approve listing.");
      setIsSubmitting(false);
      return;
    }

    setMessage("Listing approved.");
    setIsSubmitting(false);
  }

  async function reject() {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/admin/listings/${listingId}/reject`, {
      body: JSON.stringify({ reason: rejectionReason }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to reject listing.");
      setIsSubmitting(false);
      return;
    }

    setMessage("Listing rejected.");
    setIsSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <button
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          onClick={approve}
          type="button"
        >
          Approve
        </button>
        <button
          className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          onClick={reject}
          type="button"
        >
          Reject
        </button>
      </div>

      <input
        className="h-11 rounded-2xl border border-stone-900/10 bg-white px-4 text-sm"
        onChange={(event) => setRejectionReason(event.target.value)}
        value={rejectionReason}
      />

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
    </div>
  );
}
