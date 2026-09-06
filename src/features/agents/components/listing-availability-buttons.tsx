"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCopyForResponse } from "@/features/errors/error-copy";

/**
 * Off the market and back on — the pair that "Mark as rented" pretended to be.
 *
 * The old button carried that label and archived, which is terminal. These two
 * do the reversible thing: no slot in either direction, no re-review coming
 * back, and the listing survives.
 *
 * ===========================================================================
 * WHY THE CONFIRMATIONS ARE DIFFERENT WEIGHTS
 * ===========================================================================
 *
 * RemoveListingButton spends four bullets and two clicks talking an agent out
 * of a decision they cannot undo. Copying that here would be worse than
 * useless: a confirmation that appears for everything teaches people to click
 * through confirmations, so the one that matters stops working. Weight has to
 * track consequence or it stops carrying information.
 *
 * So: marking taken gets ONE line and one click to confirm, because it does
 * remove the listing from search and a mis-click is briefly costly. Marking
 * available gets NO confirmation at all — it is putting a property back on the
 * market, which is the thing the agent wants, and the undo is the other button
 * sitting beside it.
 */
function useTransition(listingId: string, path: "rented" | "available") {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setIsPending(true);
    setError(null);

    const response = await fetch(`/api/agent/listings/${listingId}/${path}`, {
      method: "POST",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setIsPending(false);
      return false;
    }

    setIsPending(false);
    router.refresh();
    return true;
  }

  return { error, isPending, run, setError };
}

export function MarkTakenButton({
  listingId,
  listingTitle,
}: {
  listingId: string;
  listingTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const { error, isPending, run, setError } = useTransition(listingId, "rented");

  if (!confirming) {
    return (
      <button
        className="rounded-full border border-stone-900/15 bg-white px-5 py-3 text-center text-sm font-medium text-stone-900 transition-colors hover:bg-stone-50"
        onClick={() => setConfirming(true)}
        type="button"
      >
        Mark as taken
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-300 bg-stone-50 p-4">
      <p className="text-sm font-semibold text-stone-900">
        Take “{listingTitle}” off the market?
      </p>
      {/*
        One sentence, and it leads with what is NOT lost. The agent arriving
        here has spent a year being told by the old button that taking a
        listing down is expensive and permanent, so the useful information is
        that this one is neither.
      */}
      <p className="mt-2 text-sm leading-6 text-stone-700">
        It stops appearing in search and stops taking new inspection requests.
        Nothing else changes — you keep the listing and the submission slot,
        anyone already arranging a viewing keeps their chat, and you can put it
        back with one click when it frees up.
      </p>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isPending}
          onClick={async () => {
            if (await run()) setConfirming(false);
          }}
          type="button"
        >
          {isPending ? "Marking..." : "Yes, it's taken"}
        </button>
        <button
          className="rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-60"
          disabled={isPending}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          type="button"
        >
          Keep it live
        </button>
      </div>
    </div>
  );
}

export function MarkAvailableButton({ listingId }: { listingId: string }) {
  const { error, isPending, run } = useTransition(listingId, "available");

  return (
    <div className="flex flex-col gap-2">
      <button
        className="rounded-full bg-stone-900 px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
        disabled={isPending}
        onClick={() => void run()}
        type="button"
      >
        {isPending ? "Putting it back..." : "Mark available"}
      </button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
