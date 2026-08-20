"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorCopyForResponse } from "@/features/errors/error-copy";

export type ModerationListingStatus =
  | "approved"
  | "flagged"
  | "pending_review"
  | "rejected"
  | "under_dispute";

type ListingModerationActionsProps = {
  listingId: string;
  listingStatus: ModerationListingStatus;
};

export function ListingModerationActions({
  listingId,
  listingStatus,
}: ListingModerationActionsProps) {
  const router = useRouter();
  const [moderationReason, setModerationReason] = useState(
    listingStatus === "approved"
      ? "Ownership mismatch."
      : listingStatus === "flagged"
        ? "Competing ownership claim received."
        : "Duplicate or invalid listing.",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(action: "approve" | "reject" | "flag" | "dispute") {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const requiresReason = action !== "approve";
    const response = await fetch(`/api/admin/listings/${listingId}/${action}`, {
      body: requiresReason ? JSON.stringify({ reason: moderationReason }) : undefined,
      headers: requiresReason ? { "Content-Type": "application/json" } : undefined,
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;

    if (!response.ok) {
      // Moderators read copy too. An unmapped code here reports itself, which
      // is how we learn that a moderation path can fail in a way nobody wrote a
      // sentence for.
      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    setMessage(
      action === "approve"
        ? "Listing approved."
        : action === "reject"
          ? "Listing rejected."
          : action === "flag"
            ? "Listing flagged for review."
            : "Listing moved under dispute.",
    );
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {listingStatus !== "approved" ? (
          <button
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => submit("approve")}
            type="button"
          >
            Approve
          </button>
        ) : null}
        {listingStatus !== "rejected" ? (
          <button
            className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => submit("reject")}
            type="button"
          >
            Reject
          </button>
        ) : null}
        {listingStatus === "pending_review" || listingStatus === "approved" ? (
          <button
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => submit("flag")}
            type="button"
          >
            Flag
          </button>
        ) : null}
        {listingStatus === "approved" || listingStatus === "flagged" ? (
          <button
            className="rounded-full bg-stone-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => submit("dispute")}
            type="button"
          >
            Dispute
          </button>
        ) : null}
      </div>

      <textarea
        className="min-h-24 rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm"
        onChange={(event) => setModerationReason(event.target.value)}
        value={moderationReason}
      />

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
    </div>
  );
}
