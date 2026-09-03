"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCopyForResponse } from "@/features/errors/error-copy";

type MarkInspectionCompleteProps = {
  inspectionRequestId: string;
  listingTitle: string;
  requesterName: string;
};

/**
 * Mark an accepted inspection as having happened.
 *
 * A second step, for the same reason accepting has one: this is a claim about
 * the world, made about somebody else, that they will see and were never asked
 * to agree to. It cannot be undone — completed is terminal in the database, not
 * merely in the product — so the panel says that rather than asking "are you
 * sure?", which tells nobody anything.
 *
 * An inline panel rather than window.confirm, matching RespondToInspection: a
 * native dialog cannot name the listing or the seeker, and this is a list where
 * the wrong row is one pixel away.
 */
export function MarkInspectionComplete({
  inspectionRequestId,
  listingTitle,
  requesterName,
}: MarkInspectionCompleteProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(
      `/api/inspection-requests/${inspectionRequestId}/complete`,
      { method: "POST" },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; details?: unknown; message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }

    setIsSubmitting(false);
    setIsConfirming(false);
    // Status, countdown and ordering are all server-derived, so the server is
    // the thing to re-ask.
    router.refresh();
  }

  if (isConfirming) {
    return (
      <div className="rounded-2xl border border-stone-900/15 bg-stone-50 p-4">
        <p className="text-sm font-semibold text-stone-900">
          Mark the visit to {listingTitle} as complete?
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm leading-6 text-stone-700">
          <li>• You are recording that you showed {requesterName} the property.</li>
          <li>
            • They will see this. They are not asked to confirm it — it is your
            record of what happened.
          </li>
          <li>• It cannot be undone.</li>
        </ul>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => confirm()}
            type="button"
          >
            {isSubmitting ? "Marking..." : "Yes, mark it complete"}
          </button>
          <button
            className="rounded-full border border-stone-900/15 px-5 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => setIsConfirming(false)}
            type="button"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white"
          onClick={() => setIsConfirming(true)}
          type="button"
        >
          Mark as complete
        </button>
      </div>
    </div>
  );
}
