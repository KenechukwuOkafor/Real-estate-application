"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCopyForResponse } from "@/features/errors/error-copy";

type ListingRevisionActionsProps = {
  revisionId: string;
};

/**
 * Approve or refuse a proposed change.
 *
 * A rejection requires a reason, enforced here and again on the server. The
 * agent's only route back from a refused change is knowing what to alter, and
 * a moderator clicking through without one leaves them exactly where the old
 * "rejected with no reason" state left them.
 */
export function ListingRevisionActions({ revisionId }: ListingRevisionActionsProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(
      `/api/admin/listing-revisions/${revisionId}/${action}`,
      {
        body: action === "reject" ? JSON.stringify({ reason }) : undefined,
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; details?: unknown; message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Reason (required to reject)</span>
        <input
          className="h-11 rounded-2xl border border-stone-900/10 bg-white px-4"
          onChange={(event) => setReason(event.target.value)}
          placeholder="What should the agent change?"
          value={reason}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => act("approve")}
          type="button"
        >
          {isSubmitting ? "Working..." : "Approve change"}
        </button>
        <button
          className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-60"
          disabled={isSubmitting || !reason.trim()}
          onClick={() => act("reject")}
          type="button"
        >
          Reject change
        </button>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
